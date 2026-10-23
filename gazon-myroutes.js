/* "Rotalarım": the rider's own routes, independent of the suggested ones.
 * - Route builder: tap the map or search to add start, via points and rest
 *   stops (Mola), reorder / drag them, avoid highways or tolls, see km, time
 *   and the weather along the route, save it and start navigation with it.
 * - Rest stops of a ride: where the rider stopped for 4+ minutes (detected
 *   from the GPS track times) are saved with the ride and become Mola points
 *   when the ride is saved as a route.
 * Storage: localStorage "gazon_my_routes". Pure parts tested in
 * test/myroutes.test.js.
 */
(function(root){
"use strict";
var KEY="gazon_my_routes";
function hav(a,b){var r=Math.PI/180,x=Math.sin((b.lat-a.lat)*r/2),y=Math.sin((b.lon-a.lon)*r/2);return 12742*Math.asin(Math.sqrt(x*x+Math.cos(a.lat*r)*Math.cos(b.lat*r)*y*y))}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}

/* ---------- pure ---------- */
// Stops in a ride track ([lat,lon,alt,timeMs]): stayed within radiusKm for
// at least minSec. Waiting before the start / after the end is not a stop.
function detectStops(track,minSec,radiusKm){
 minSec=minSec||240;radiusKm=radiusKm||.06;
 var a=(track||[]).filter(function(p){return Array.isArray(p)&&isFinite(Number(p[0]))&&isFinite(Number(p[1]))&&Number(p[3])>0})
  .map(function(p){return {lat:Number(p[0]),lon:Number(p[1]),t:Number(p[3])}});
 var out=[],i=0;
 while(i<a.length-1){
  var j=i;while(j+1<a.length&&hav(a[i],a[j+1])<=radiusKm)j++;
  var sec=(a[j].t-a[i].t)/1000;
  if(sec>=minSec&&i>0&&j<a.length-1){
   var la=0,lo=0;for(var k=i;k<=j;k++){la+=a[k].lat;lo+=a[k].lon}
   out.push({lat:+(la/(j-i+1)).toFixed(6),lon:+(lo/(j-i+1)).toFixed(6),start:a[i].t,end:a[j].t,sec:Math.round(sec)});
   i=j+1;
  }else i++;
 }
 return out;
}
// Google Routes request for the builder's points (first = start, last = end).
function buildRequest(points,opts){
 opts=opts||{};
 var p=(points||[]).filter(function(x){return x&&isFinite(x.lat)&&isFinite(x.lon)});
 if(p.length<2)return null;
 function ll(x){return {lat:Number(x.lat),lng:Number(x.lon)}}
 var req={origin:ll(p[0]),destination:ll(p[p.length-1]),travelMode:"DRIVING",routingPreference:"TRAFFIC_AWARE",polylineQuality:"HIGH_QUALITY",
  fields:["path","legs","distanceMeters","durationMillis"],
  intermediates:p.slice(1,-1).map(function(x){return x.type==="rest"?{location:ll(x),vehicleStopover:true}:{location:ll(x),via:true}})};
 if(opts.avoidHighways||opts.avoidTolls)req.routeModifiers={avoidHighways:!!opts.avoidHighways,avoidTolls:!!opts.avoidTolls};
 return req;
}
// A saved ride as an editable route: start, ~6 via points along the track,
// its rest stops (as Mola) in track order, end.
function rideToRoute(ride){
 var t=(ride&&ride.track||[]).filter(function(p){return Array.isArray(p)&&isFinite(Number(p[0]))&&isFinite(Number(p[1]))});
 if(t.length<2)return null;
 function pt(p,type,name){return {lat:+Number(p[0]).toFixed(6),lon:+Number(p[1]).toFixed(6),type:type,name:name||""}}
 var items=[],n=6;
 for(var i=1;i<=n;i++){var idx=Math.round(i/(n+1)*(t.length-1));items.push({idx:idx,p:pt(t[idx],"via")})}
 // Detected stops plus the rider's own "Mola yeri" marks (same place once).
 var rests=(ride.stops||[]).slice();
 (ride.marks||[]).forEach(function(m){if(m&&m.type==="rest"&&isFinite(m.lat)&&!rests.some(function(s){return hav(s,{lat:m.lat,lon:m.lng})<.15}))rests.push({lat:m.lat,lon:m.lng,name:"Mola"})});
 rests.forEach(function(s){
  var best=0,bd=Infinity;t.forEach(function(q,k){var d=hav({lat:s.lat,lon:s.lon},{lat:Number(q[0]),lon:Number(q[1])});if(d<bd){bd=d;best=k}});
  items.push({idx:best,p:{lat:s.lat,lon:s.lon,type:"rest",name:s.name||"Mola"}});
 });
 items.sort(function(a,b){return a.idx-b.idx});
 return {name:(ride.destination||"Sürüşüm")+" rotası",points:[pt(t[0],"start","Başlangıç")].concat(items.map(function(x){return x.p}),[pt(t[t.length-1],"end","Varış")]),
  opts:{avoidHighways:false,avoidTolls:false}};
}
function fmtTime(sec){sec=Math.round(sec||0);var h=Math.floor(sec/3600),m=Math.round(sec%3600/60);if(m===60){h++;m=0}return h?h+" sa "+m+" dk":Math.max(1,m)+" dk"}

/* ---------- storage ---------- */
function read(){try{var a=JSON.parse(localStorage.getItem(KEY)||"[]");return Array.isArray(a)?a:[]}catch(e){return []}}
function write(a){try{localStorage.setItem(KEY,JSON.stringify(a.slice(0,50)))}catch(e){}}
function saveRoute(r){
 var a=read(),i=a.findIndex(function(x){return x.id===r.id});
 r.updated=Date.now();if(i>=0)a[i]=r;else a.unshift(r);write(a);renderList();
}

/* ---------- builder ---------- */
var B=null; // current builder state
function $(id){return document.getElementById(id)}
function el(html){var d=document.createElement("div");d.innerHTML=html;return d.firstElementChild}
function ready(){return root.google&&google.maps&&google.maps.Map}
function here(){var c=root.GaZonMapContext,p=c&&c.getCurrentPoint&&c.getCurrentPoint();return p&&isFinite(p.lat)?{lat:p.lat,lon:p.lon}:null}
function geocodeName(p){
 return new Promise(function(res){
  try{new google.maps.Geocoder().geocode({location:{lat:p.lat,lng:p.lon},language:"tr"},function(r,s){
   if(s!=="OK"||!r||!r.length)return res("");
   var c=r[0].address_components||[],pick=function(t){var x=c.filter(function(y){return y.types.indexOf(t)>=0})[0];return x&&x.long_name};
   res([pick("route"),pick("administrative_area_level_2")||pick("locality")].filter(Boolean).join(", ")||r[0].formatted_address||"");
  })}catch(e){res("")}
 });
}
function label(i,n){return i===0?"A":i===n-1?"B":String(i)}
function open(route){
 if(!ready()){if(root.alert)alert("Harita henüz hazır değil, birazdan tekrar dene.");return}
 close();
 var r=route?JSON.parse(JSON.stringify(route)):{id:"r"+Date.now().toString(36),name:"",points:[],opts:{avoidHighways:false,avoidTolls:false}};
 var ov=el('<div class="gr-rb" role="dialog" aria-label="Rota oluştur">'+
  '<div class="gr-rb-top"><button type="button" class="gr-rb-x" aria-label="Kapat"><span class="mi">close</span></button>'+
  '<input class="gr-rb-name" maxlength="60" placeholder="Rota adı (örn. Abant turu)"><button type="button" class="gr-rb-save"><span class="mi">bookmark_add</span> Kaydet</button></div>'+
  '<div class="gr-rb-map"></div>'+
  '<div class="gr-rb-sheet"><form class="gr-rb-search"><input placeholder="Yer ara ve ekle (şehir, köy, tesis…)" enterkeyhint="search"><button type="submit" aria-label="Ara"><span class="mi">search</span></button><button type="button" class="gr-rb-me" aria-label="Konumumu ekle"><span class="mi">my_location</span></button></form>'+
  '<div class="gr-rb-hint"><span class="mi">touch_app</span> Haritaya dokunarak nokta ekle · noktayı sürükleyerek taşı</div>'+
  '<ol class="gr-rb-list"></ol>'+
  '<div class="gr-rb-opts"><button type="button" data-opt="avoidHighways"><span class="mi">remove_road</span> Otoyoldan kaçın</button><button type="button" data-opt="avoidTolls"><span class="mi">money_off</span> Paralı yoldan kaçın</button></div>'+
  '<div class="gr-rb-sum"></div><div class="gr-rb-wx"></div>'+
  '<div class="gr-rb-actions"><button type="button" class="primary gr-rb-go" disabled><span class="mi">navigation</span> Bu rotayla yola çık</button></div></div></div>');
 document.body.appendChild(ov);
 var map=new google.maps.Map(ov.querySelector(".gr-rb-map"),{center:{lat:39.2,lng:33},zoom:6,disableDefaultUI:true,zoomControl:true,gestureHandling:"greedy",clickableIcons:false});
 B={r:r,ov:ov,map:map,markers:[],line:null,res:null,seq:0,timer:0};
 ov.querySelector(".gr-rb-name").value=r.name||"";
 ov.querySelector(".gr-rb-x").onclick=close;
 ov.querySelector(".gr-rb-save").onclick=function(){save(false)};
 ov.querySelector(".gr-rb-go").onclick=go;
 ov.querySelector(".gr-rb-me").onclick=function(){var p=here();if(p)addPoint(p,true);else hint("Konum henüz yok · GPS bekleniyor")};
 ov.querySelector(".gr-rb-search").onsubmit=function(e){e.preventDefault();search(this.querySelector("input").value)};
 ov.querySelectorAll("[data-opt]").forEach(function(b){b.onclick=function(){var k=b.getAttribute("data-opt");r.opts[k]=!r.opts[k];paint();compute()}});
 map.addListener("click",function(e){addPoint({lat:e.latLng.lat(),lon:e.latLng.lng()})});
 if(!r.points.length){var p=here();if(p){map.setCenter({lat:p.lat,lng:p.lon});map.setZoom(11)}}
 paint();compute();fit();
}
function close(){
 if(!B)return;try{B.markers.forEach(function(m){m.setMap(null)});if(B.line)B.line.setMap(null)}catch(e){}
 B.ov.remove();B=null;
}
function hint(t){if(B)B.ov.querySelector(".gr-rb-hint").innerHTML='<span class="mi">info</span> '+esc(t)}
function addPoint(p,atStart){
 var pts=B.r.points,np={lat:+p.lat.toFixed(6),lon:+p.lon.toFixed(6),type:"via",name:p.name||""};
 if(atStart)pts.unshift(np);else pts.push(np);
 if(!np.name)geocodeName(np).then(function(n){np.name=n;paint()});
 paint();compute();
}
function search(q){
 q=String(q||"").trim();if(!q||!B)return;
 new google.maps.Geocoder().geocode({address:q,region:"TR",language:"tr"},function(r,s){
  if(s!=="OK"||!r||!r.length){hint("“"+q+"” bulunamadı");return}
  var g=r[0].geometry.location,p={lat:g.lat(),lon:g.lng(),name:r[0].formatted_address.split(",").slice(0,2).join(",")};
  addPoint(p);B.map.panTo({lat:p.lat,lng:p.lon});if(B.map.getZoom()<10)B.map.setZoom(10);
  B.ov.querySelector(".gr-rb-search input").value="";
 });
}
function paint(){
 if(!B)return;var pts=B.r.points,n=pts.length,list=B.ov.querySelector(".gr-rb-list");
 list.innerHTML=pts.map(function(p,i){
  var end=i===0||i===n-1,rest=!end&&p.type==="rest";
  return '<li class="'+(rest?"rest":"")+'"><span class="gr-rb-badge'+(rest?" rest":"")+'">'+(rest?'<span class="mi">local_cafe</span>':label(i,n))+'</span>'+
   '<span class="gr-rb-pt"><b>'+esc(p.name||"Nokta")+'</b><small>'+(i===0?"Başlangıç":i===n-1?"Varış":rest?"Mola yeri":"Geçiş noktası")+'</small></span>'+
   (end?'':'<button type="button" data-rest="'+i+'" class="'+(rest?"on":"")+'" aria-label="Mola yeri yap"><span class="mi">local_cafe</span></button>')+
   '<button type="button" data-up="'+i+'" aria-label="Yukarı"'+(i===0?" disabled":"")+'><span class="mi">arrow_upward</span></button>'+
   '<button type="button" data-del="'+i+'" aria-label="Sil"><span class="mi">delete</span></button></li>';
 }).join("")||'<li class="empty">Başlangıç ve varış ekle; aradaki yerleri geçiş noktası ya da mola yeri yap.</li>';
 list.querySelectorAll("[data-rest]").forEach(function(b){b.onclick=function(){var p=pts[+b.dataset.rest];p.type=p.type==="rest"?"via":"rest";paint();compute()}});
 list.querySelectorAll("[data-up]").forEach(function(b){b.onclick=function(){var i=+b.dataset.up;if(i>0){var x=pts[i];pts[i]=pts[i-1];pts[i-1]=x;paint();compute()}}});
 list.querySelectorAll("[data-del]").forEach(function(b){b.onclick=function(){pts.splice(+b.dataset.del,1);paint();compute()}});
 B.ov.querySelectorAll("[data-opt]").forEach(function(b){b.classList.toggle("on",!!B.r.opts[b.getAttribute("data-opt")])});
 // markers
 B.markers.forEach(function(m){m.setMap(null)});
 B.markers=pts.map(function(p,i){
  var rest=i>0&&i<n-1&&p.type==="rest";
  var m=new google.maps.Marker({map:B.map,position:{lat:p.lat,lng:p.lon},draggable:true,zIndex:50+i,
   label:{text:rest?"☕":label(i,n),color:"#fff",fontWeight:"800",fontSize:"12px"},
   icon:{path:google.maps.SymbolPath.CIRCLE,scale:13,fillColor:i===0?"#16A34A":i===n-1?"#DC2626":rest?"#EA580C":"#2563EB",fillOpacity:1,strokeColor:"#fff",strokeWeight:3}});
  m.addListener("dragend",function(e){p.lat=+e.latLng.lat().toFixed(6);p.lon=+e.latLng.lng().toFixed(6);p.name="";geocodeName(p).then(function(nm){p.name=nm;paint()});compute()});
  return m;
 });
}
function compute(){
 if(!B)return;clearTimeout(B.timer);
 var seq=++B.seq,sum=B.ov.querySelector(".gr-rb-sum"),goBtn=B.ov.querySelector(".gr-rb-go");
 var req=buildRequest(B.r.points,B.r.opts);
 if(!req){B.res=null;goBtn.disabled=true;sum.textContent="";B.ov.querySelector(".gr-rb-wx").innerHTML="";if(B.line){B.line.setMap(null);B.line=null}return}
 sum.innerHTML='<span class="mi">hourglass_top</span> Rota hesaplanıyor…';
 B.timer=setTimeout(async function(){
  try{
   var lib=await google.maps.importLibrary("routes"),res=await lib.Route.computeRoutes(req),rt=res&&res.routes&&res.routes[0];
   if(!B||seq!==B.seq)return;
   if(!rt||!rt.path||!rt.path.length)throw new Error("noroute");
   var path=rt.path.map(function(q){return {lat:typeof q.lat==="function"?q.lat():Number(q.lat),lon:typeof q.lng==="function"?q.lng():Number(q.lng)}});
   B.res={pts:path,km:Number(rt.distanceMeters||0)/1000,sec:Number(rt.durationMillis||0)/1000};
   if(B.line)B.line.setMap(null);
   B.line=new google.maps.Polyline({map:B.map,path:path.map(function(q){return {lat:q.lat,lng:q.lon}}),strokeColor:"#E8322E",strokeWeight:6,strokeOpacity:.95,zIndex:10});
   var rests=B.r.points.filter(function(p,i,a){return i>0&&i<a.length-1&&p.type==="rest"}).length;
   sum.innerHTML='<b>'+B.res.km.toFixed(1)+' km</b> · '+fmtTime(B.res.sec)+(rests?' · '+rests+' mola':'')+' <small>(molalardaki bekleme hariç)</small>';
   goBtn.disabled=false;
   if(root.GaZonWeather)GaZonWeather.renderRoute(B.ov.querySelector(".gr-rb-wx"),B.res);
  }catch(e){if(B&&seq===B.seq){B.res=null;goBtn.disabled=true;sum.innerHTML='<span class="mi">error</span> Bu noktalar arasında rota bulunamadı'}}
 },500);
}
function fit(){
 if(!B||!B.r.points.length)return;var b=new google.maps.LatLngBounds();
 B.r.points.forEach(function(p){b.extend({lat:p.lat,lng:p.lon})});B.map.fitBounds(b,60);
 if(B.r.points.length===1)B.map.setZoom(11);
}
function save(quiet){
 if(!B)return null;var r=B.r;
 r.name=B.ov.querySelector(".gr-rb-name").value.trim()||r.name||((r.points[0]&&r.points[0].name||"Başlangıç").split(",")[0]+" → "+((r.points[r.points.length-1]||{}).name||"Varış").split(",")[0]);
 if(r.points.length<2){hint("Kaydetmek için en az başlangıç ve varış ekle");return null}
 if(B.res){r.km=+B.res.km.toFixed(1);r.sec=Math.round(B.res.sec);r.track=simplify(B.res.pts,400).map(function(p){return [+p.lat.toFixed(5),+p.lon.toFixed(5)]})}
 saveRoute(JSON.parse(JSON.stringify(r)));
 if(!quiet)hint("“"+r.name+"” Rotalarım'a kaydedildi");
 return r;
}
function simplify(a,max){if(a.length<=max)return a;var out=[],step=(a.length-1)/(max-1);for(var i=0;i<max;i++)out.push(a[Math.round(i*step)]);return out}
// Navigation through the rider's own points: rest stops become stopovers.
function startRoute(r){
 var N=root.GaZonNavigation;if(!N||!N.openCommunityRoute||!r||!r.track||r.track.length<2)return false;
 var stops=(r.points||[]).filter(function(p,i,a){return i>0&&i<a.length-1&&p.type==="rest"}).map(function(p){
  var best=0,bd=Infinity;r.track.forEach(function(q,k){var d=hav(p,{lat:q[0],lon:q[1]});if(d<bd){bd=d;best=k}});
  return {lat:p.lat,lon:p.lon,name:p.name||"Mola",trackIndex:best};
 });
 N.openCommunityRoute({title:r.name,track:r.track,stops:stops},false);
 return true;
}
function go(){var r=save(true);if(!r||!r.track){hint("Önce rota hesaplansın");return}close();startRoute(r)}

/* ---------- Keşfet → Rotalarım ---------- */
function renderList(){
 var box=$("grMyRoutes");if(!box)return;var a=read();
 box.innerHTML='<div class="gr-moto-head"><b>Rotalarım</b><small>Kendi oluşturduğun rotalar · mola yerleriyle</small></div>'+
  '<button type="button" class="gr-mr-new"><span class="mi">add_road</span> Yeni rota oluştur</button>'+
  (a.length?a.map(function(r,i){
   var rests=(r.points||[]).filter(function(p,k,x){return k>0&&k<x.length-1&&p.type==="rest"}).length;
   return '<article class="gr-mr-card"><div><b>'+esc(r.name)+'</b><small>'+(r.km?r.km+' km · '+fmtTime(r.sec):'Hesaplanmadı')+' · '+(r.points||[]).length+' nokta'+(rests?' · '+rests+' mola':'')+'</small></div>'+
    '<div class="gr-mr-actions"><button type="button" class="primary" data-mr-go="'+i+'"><span class="mi">navigation</span> Başla</button><button type="button" data-mr-edit="'+i+'"><span class="mi">edit</span> Düzenle</button><button type="button" data-mr-del="'+i+'" aria-label="Sil"><span class="mi">delete</span></button></div></article>';
  }).join(""):'<div class="gr-moto-empty">Henüz kendi rotan yok. “Yeni rota oluştur” ile başla ya da Sürüşlerim’den bir sürüşü rota olarak kaydet.</div>');
 box.querySelector(".gr-mr-new").onclick=function(){open(null)};
 box.querySelectorAll("[data-mr-go]").forEach(function(b){b.onclick=function(){var r=read()[+b.dataset.mrGo];if(r&&!startRoute(r))open(r)}});
 box.querySelectorAll("[data-mr-edit]").forEach(function(b){b.onclick=function(){open(read()[+b.dataset.mrEdit])}});
 box.querySelectorAll("[data-mr-del]").forEach(function(b){b.onclick=function(){
  var i=+b.dataset.mrDel,r=read()[i];if(!r)return;
  var D=root.GaZonDialog,del=function(){var a=read();a.splice(i,1);write(a);renderList()};
  if(D)D.confirm({icon:"delete",danger:true,title:"Rota silinsin mi?",text:r.name,ok:"Sil"}).then(function(v){if(v)del()});else if(confirm("Rota silinsin mi?"))del();
 }});
}
function select(on){
 document.body.classList.toggle("gr-myroutes-active",on);
 var chip=$("grMyRoutesChip");if(chip)chip.classList.toggle("active",on);
 if(on){
  document.querySelectorAll(".discoverTabs .chip").forEach(function(c){if(c!==chip)c.classList.remove("active")});
  document.body.classList.remove("gr-travel-active","gr-discover-mine","gr-discover-home","gr-moto-active");
  renderList();var box=$("grMyRoutes");if(box)box.scrollIntoView({block:"start",behavior:"smooth"});
 }
}
function install(){
 // Rota tab: entry under the destination field.
 (function addEntry(){
  var f=$("grDestinationFields");if(!f){setTimeout(addEntry,500);return}
  if($("grBuildRoute"))return;
  var b=el('<button type="button" id="grBuildRoute" class="gr-build-route"><span class="mi">add_road</span><span><b>Kendi rotanı oluştur</b><small>Ara noktalar ve mola yerleriyle</small></span></button>');
  b.onclick=function(){open(null)};f.insertAdjacentElement("afterend",b);
 })();
 // Keşfet chip + section.
 (function addChip(){
  var tabs=document.querySelector(".discoverTabs");if(!tabs){setTimeout(addChip,500);return}
  if($("grMyRoutesChip"))return;
  var chip=el('<button type="button" class="chip" id="grMyRoutesChip">Rotalarım</button>');
  var after=$("grMyRidesChip")||tabs.firstElementChild;after?after.insertAdjacentElement("afterend",chip):tabs.appendChild(chip);
  chip.addEventListener("click",function(){select(true)});
  tabs.addEventListener("click",function(e){var c=e.target.closest(".chip");if(c&&c!==chip)select(false)});
  var box=el('<section id="grMyRoutes" class="gr-myroutes"></section>');
  ($("grMyRides")||tabs).insertAdjacentElement("afterend",box);
  renderList();
 })();
}
var api={detectStops:detectStops,buildRequest:buildRequest,rideToRoute:rideToRoute,read:read,saveRoute:saveRoute,open:open,startRoute:startRoute,
 saveRideAsRoute:function(ride){var r=rideToRoute(ride);if(!r)return null;r.id="r"+Date.now().toString(36);open(r);return r}};
root.GaZonMyRoutes=api;
if(typeof module!=="undefined"&&module.exports)module.exports=api;
if(typeof document!=="undefined"){if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install);else install()}
})(typeof window!=="undefined"?window:globalThis);
