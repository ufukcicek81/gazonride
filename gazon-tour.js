/* GaZonRide Tour Planner v0.1
 * Route preview uses actual Google Routes responses, never straight-line
 * "roads". Target distance is an estimate; actual routed length is shown.
 * Tours open in Google Maps with explicit intermediate waypoints until native
 * multi-stop guidance is implemented and verified on real devices.
 */
(function(global){
"use strict";
const EARTH_KM=6371.0088;
const KILOMETERS=[50,100,150];
const DIRECTIONS={auto:0,north:0,east:90,south:180,west:270};
let config=null,mode="destination",sequence=0,options=[],selected=0,lines=[],busy=false,home=null;
const id=function(x){return document.getElementById(x)};
function esc(s){return String(s||"").replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function normalize(p){if(!p)return null;const lat=Number(typeof p.lat==="function"?p.lat():p.lat),lon=Number(p.lon!=null?p.lon:(typeof p.lng==="function"?p.lng():p.lng));
 return Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180?{lat,lon}:null}
function offset(origin,bearing,km){
 const p=normalize(origin);if(!p||!Number.isFinite(bearing)||!Number.isFinite(km)||km<=0)return null;
 const rad=Math.PI/180,a=p.lat*rad,b=p.lon*rad,t=bearing*rad,d=km/EARTH_KM;
 const lat=Math.asin(Math.sin(a)*Math.cos(d)+Math.cos(a)*Math.sin(d)*Math.cos(t));
 const lon=b+Math.atan2(Math.sin(t)*Math.sin(d)*Math.cos(a),Math.cos(d)-Math.sin(a)*Math.sin(lat));
 return {lat:lat/rad,lon:((lon/rad+540)%360)-180};
}
function candidates(origin,km,direction){
 const out=[],bearing=DIRECTIONS[direction]===undefined?0:DIRECTIONS[direction];
 for(let i=0;i<3;i++){
  const head=direction==="auto"?[15,135,255][i]:bearing+[-37,0,37][i];
  const radius=km/[4.45,4.15,4.7][i];
  out.push({name:["Keşif halkası","Alternatif manzara","Farklı güzergâh"][i],
   middle:[offset(origin,head-47,radius),offset(origin,head+47,radius)],
   avoidHighways:i===2});
 }
 return out;
}
function setMessage(s){let m=id("grTourMessage");if(m)m.textContent=s;if(config&&config.setStatus)config.setStatus(s)}
function clearLines(){lines.forEach(function(p){try{p.setMap(null)}catch(e){}});lines=[]}
function reset(){sequence++;options=[];selected=0;busy=false;clearLines();let el=id("grTourChoices");if(el){el.classList.remove("active");el.innerHTML=""}
 let btn=id("grTourPlan");if(btn){btn.disabled=false;btn.innerHTML='<span class="mi">alt_route</span> Üç tur önerisi oluştur'}
}
function isTourMode(){return mode==="tour"}
function setMode(next){
 next=next==="tour"?"tour":"destination";if(mode===next)return;
 reset();mode=next;document.body.classList.toggle("gr-tour-mode",mode==="tour");
 for(let [key,button] of [["destination",id("grModeDestination")],["tour",id("grModeTour")]]){
  if(button){const active=key===mode;button.classList.toggle("active",active);button.setAttribute("aria-selected",String(active))}
 }
 if(mode==="tour"){
  if(config&&config.clearDestinationRoutes)config.clearDestinationRoutes();
  setMessage("Tur uzunluğunu seç. Gerçek yol mesafesini hesaplayıp göstereceğiz.");
 }else setMessage("Hedef belirleyerek alternatif rotaları hesaplayabilirsin.");
}
function outline(d,i){
 const map=config.getMap();
 const line=new google.maps.Polyline({map,path:d.points.map(p=>({lat:p.lat,lng:p.lon})),
  strokeColor:i===selected?"#ff5a1f":"#87a8c8",strokeWeight:i===selected?8:5,
  strokeOpacity:i===selected?1:.8,zIndex:i===selected?30:14,clickable:true});
 line.addListener("click",function(){choose(i)});
 lines.push(line);
}
function fit(){
 const map=config.getMap();if(!map||!options.length)return;
 const bounds=new google.maps.LatLngBounds();
 options.forEach(o=>o.points.forEach(p=>bounds.extend({lat:p.lat,lng:p.lon})));
 if(!bounds.isEmpty())map.fitBounds(bounds,{top:Math.min(310,window.innerHeight*.38),bottom:Math.min(255,window.innerHeight*.31),left:22,right:22});
}
function choose(i){
 if(!options[i])return;selected=i;
 lines.forEach(function(line,j){line.setOptions({strokeColor:j===i?"#ff5a1f":"#87a8c8",
  strokeWeight:j===i?8:5,strokeOpacity:j===i?1:.75,zIndex:j===i?30:14})});
 renderOptions();
}
function externalUrl(o){
 if(!o)return "";
 const coords=p=>p.lat.toFixed(6)+","+p.lon.toFixed(6);
 return "https://www.google.com/maps/dir/?api=1&origin="+encodeURIComponent(coords(o.origin))+
 "&destination="+encodeURIComponent(coords(o.origin))+
 "&waypoints="+encodeURIComponent(o.middle.map(coords).join("|"))+"&travelmode=driving";
}
function openSelected(){
 const o=options[selected];if(!o)return;
 const url=externalUrl(o);
 // Google Maps recomputes the route; display actual distance there before riding.
 const a=document.createElement("a");a.href=url;a.target="_blank";a.rel="noopener noreferrer";
 document.body.appendChild(a);a.click();a.remove();
}
function renderOptions(){
 const box=id("grTourChoices");if(!box)return;
 if(!options.length){box.classList.remove("active");box.innerHTML="";return}
 const target=Number(id("grTourLength").value);
 box.innerHTML='<div class="gr-tour-heading"><b>Turunu seç</b><small>'+options.length+' gerçek yol rotası</small></div>'+
 '<div class="gr-tour-routes">'+options.map(function(x,i){
  return '<button type="button" data-tour="'+i+'" aria-pressed="'+(i===selected)+'" class="gr-tour-route'+(i===selected?' active':'')+'">'+
  '<b>'+(i+1)+'. '+esc(x.name)+'</b><strong>'+x.km.toFixed(1)+' km</strong><small>'+Math.round(x.sec/60)+' dk · Hedeften '+Math.round(Math.abs(x.km-target))+' km '+(x.km>=target?'uzun':'kısa')+'</small></button>'
 }).join("")+'</div>'+
 '<div class="gr-tour-action"><button id="grTourOpen" type="button"><span class="mi">route</span> Google Haritalar’da turu aç</button></div>'+
 '<p class="gr-tour-disclaimer">Tur önerileri Google’ın gerçek araç yollarıyla hesaplanır. Açılan Google Haritalar güzergâhı yeniden hesaplayabilir; sürmeden önce ara durakları kontrol et. GaZonRide içinde çok duraklı canlı yönlendirme sonraki aşamadadır.</p>';
 box.classList.add("active");
 box.querySelectorAll("[data-tour]").forEach(b=>b.onclick=function(){choose(Number(b.dataset.tour))});
 const open=id("grTourOpen");if(open)open.onclick=openSelected;
}
async function plan(){
 if(busy||!config)return;
 reset();busy=true;const run=++sequence;
 const btn=id("grTourPlan"),target=Number(id("grTourLength").value);
 const dir=id("grTourDirection").value;
 if(btn){btn.disabled=true;btn.innerHTML='<span class="mi">hourglass_top</span> Hesaplanıyor'}
 try{
  if(!KILOMETERS.includes(target))throw Error("Desteklenmeyen kilometre hedefi");
  if(!config.googleReady()||!config.getMap()){throw Error("Google harita hazır değil. İnterneti kontrol et.")}
  const origin=normalize(await config.getOrigin());
  if(!origin)throw Error("Konum bulunamadı. GPS iznini açıp yeniden dene.");
  home=origin;
  const {Route}=await google.maps.importLibrary("routes");
  if(run!==sequence||mode!=="tour")return;
  const dirs=candidates(origin,target,dir),found=[];
  for(let i=0;i<dirs.length;i++){
   if(run!==sequence||mode!=="tour")return;
   setMessage("Tur rotaları hesaplanıyor · "+(i+1)+"/"+dirs.length);
   const cand=dirs[i];
   const req={origin:{lat:origin.lat,lng:origin.lon},
    destination:{lat:origin.lat,lng:origin.lon},
    intermediates:cand.middle.map(p=>({location:{lat:p.lat,lng:p.lon}})),
    travelMode:"DRIVING",polylineQuality:"HIGH_QUALITY",
    routingPreference:"TRAFFIC_AWARE",
    fields:["path","legs","distanceMeters","durationMillis"]};
   if(cand.avoidHighways)req.routeModifiers={avoidHighways:true};
   try{
    const result=await Route.computeRoutes(req);
    if(run!==sequence||mode!=="tour")return;
    const rt=result&&result.routes&&result.routes[0];
    if(!rt||!rt.path||rt.path.length<3)continue;
    const pts=rt.path.map(normalize).filter(Boolean);
    const km=Number(rt.distanceMeters)/1000,sec=Number(rt.durationMillis)/1000;
    if(pts.length<3||!Number.isFinite(km)||km<target*.35||km>target*2.8)continue;
    if(found.some(x=>Math.abs(x.km-km)<2&&x.points[Math.floor(x.points.length/2)]&&
        pts[Math.floor(pts.length/2)]&&Math.abs(x.points[Math.floor(x.points.length/2)].lat-pts[Math.floor(pts.length/2)].lat)<.003))continue;
    found.push({name:cand.name,km,sec,origin,middle:cand.middle,points:pts});
    options=found.slice();
    outline(options[options.length-1],options.length-1);
    renderOptions();
   }catch(err){console.warn("Tour candidate unavailable",err)}
  }
  if(run!==sequence||mode!=="tour")return;
  if(!found.length)throw Error("Bu bölgede uygun halkalı rota bulunamadı. Başka yön veya mesafe dene.");
  choose(0);fit();
  setMessage(found.length+" tur hesaplandı. Seçtiğin turu haritada ve kartlardan inceleyebilirsin.");
 }catch(err){
  if(run===sequence){console.warn("Tour planning unavailable",err);setMessage(err&&err.message||"Tur hesaplanamadı. Tekrar dene.")}
 }finally{
  if(run===sequence){busy=false;if(btn){btn.disabled=false;btn.innerHTML='<span class="mi">alt_route</span> Üç tur önerisi oluştur'}}
 }
}
function init(settings){
 config=settings;
 let b=id("grModeDestination"),t=id("grModeTour");
 if(b)b.onclick=()=>setMode("destination");
 if(t)t.onclick=()=>setMode("tour");
 let planButton=id("grTourPlan");if(planButton)planButton.onclick=plan;
 const box=id("grTourChoices");if(box&&box.parentElement!==document.body)document.body.appendChild(box);
 setMode("destination");
}
const api={init,setMode,isTourMode,plan,clear:reset,offset,candidates,externalUrl};
global.GaZonTour=api;
if(typeof module==="object"&&module.exports)module.exports={offset,candidates,externalUrl};
})(typeof window!=="undefined"?window:globalThis);
