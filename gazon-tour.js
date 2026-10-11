/* GaZonRide Tour Planner v0.1
 * Route preview uses actual Google Routes responses, never straight-line
 * "roads". Target distance is an estimate; actual routed length is shown.
 * Tours start in GaZonRide. Android Native Navigation SDK receives all three
 * stops; iOS/browser guidance uses the precomputed full route. Actual devices
 * still require field verification for accurate spoken instructions.
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
 for(let i=0;i<5;i++){
  const head=direction==="auto"?[15,135,255,75,210][i]:bearing+[-55,-25,0,25,55][i];
  const radius=km/[4.45,4.15,4.7,4.35,4.55][i];
  out.push({name:["Keşif halkası","Alternatif manzara","Farklı güzergâh"][i],
   middle:[offset(origin,head-47,radius),offset(origin,head+47,radius)],
   avoidHighways:i===2||i===4});
 }
 return out;
}
function distanceKm(a,b){
 const rad=Math.PI/180, x=(b.lat-a.lat)*rad, y=(b.lon-a.lon)*rad;
 const sin=Math.sin(x/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(y/2)**2;
 return 2*EARTH_KM*Math.asin(Math.min(1,Math.sqrt(sin)));
}
function bearing(a,b){
 const rad=Math.PI/180,lat1=a.lat*rad,lat2=b.lat*rad,dlon=(b.lon-a.lon)*rad;
 return Math.atan2(Math.sin(dlon)*Math.cos(lat2),
  Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(dlon))*180/Math.PI;
}
function curvature(points,km){
 // Sample at roughly 90m spacing to avoid inflated scores on detailed
 // road geometry or short zig-zags caused by tiny polyline segments.
 if(!Array.isArray(points)||points.length<3||!Number.isFinite(km)||km<=0)return 0;
 const sample=[points[0]];let last=points[0],travel=0;
 for(let i=1;i<points.length;i++){
  const p=points[i];if(!p)continue;
  travel+=distanceKm(last,p);last=p;
  if(travel>=.09){sample.push(p);travel=0}
 }
 if(sample.length<3)return 0;
 let sum=0;
 for(let i=2;i<sample.length;i++){
  const b1=bearing(sample[i-2],sample[i-1]),b2=bearing(sample[i-1],sample[i]);
  const delta=Math.abs(((b2-b1+540)%360)-180);
  if(delta>=18&&delta<=155)sum+=Math.min(90,delta)/45;
 }
 return Math.round(sum/Math.max(1,km)*10*10)/10; // turn units per 10 km
}
function score(o,style,target){
 const deviation=Math.abs(o.km-target)/Math.max(target,1);
 const hours=o.sec/3600;
 if(style==="fast")return -hours-deviation*.6;
 if(style==="curvy")return o.curveScore*.12-deviation*1.8-hours*.04;
 if(style==="verycurvy")return o.curveScore*.2-deviation*1.2-hours*.015;
 return -deviation*3-hours*.28+o.curveScore*.018;
}
function extractSteps(rt){
 const steps=[];
 (rt.legs||[]).forEach(leg=>(leg.steps||[]).forEach(st=>{
  const instr=st.navigationInstruction||{};
  steps.push({distance:Number(st.distanceMeters||0),
   instruction:{maneuver:st.maneuver||instr.maneuver||"",
    instructions:st.instructions||instr.instructions||""},
   end:normalize(st.endLocation)});
 }));
 return steps;
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
 const panel=id("grTourPanel");if(panel)panel.hidden=mode!=="tour";
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
 const o=options[selected];if(!o||!config||typeof config.launchInside!=="function")return;
 const started=config.launchInside(o);
 if(started) {
  setMessage("Tur GaZonRide içinde başlatılıyor. Yol boyunca dönüşleri takip et.");
  const box=id("grTourChoices");if(box)box.classList.remove("active");
 } else setMessage("Tur navigasyonu başlatılamadı. Lütfen uygulama izinlerini kontrol et.");
}
function renderOptions(){
 const box=id("grTourChoices");if(!box)return;
 if(!options.length){box.classList.remove("active");box.innerHTML="";return}
 const target=Number(id("grTourLength").value);
 box.innerHTML='<div class="gr-tour-heading"><b>Turunu seç</b><small>'+options.length+' gerçek yol rotası</small></div>'+
 '<div class="gr-tour-routes">'+options.map(function(x,i){
  return '<button type="button" data-tour="'+i+'" aria-pressed="'+(i===selected)+'" class="gr-tour-route'+(i===selected?' active':'')+'">'+
  '<b>'+(i+1)+'. '+esc(x.name)+'</b><strong>'+x.km.toFixed(1)+' km</strong><small>'+Math.round(x.sec/60)+' dk · tahmini viraj puanı '+x.curveScore+' /10 km</small></button>'
 }).join("")+'</div>'+
 '<div class="gr-tour-action"><button id="grTourOpen" type="button"><span class="mi">navigation</span> GaZonRide’da turu başlat</button></div>'+
 '<p class="gr-tour-disclaimer">Viraj puanı Google yol çizgilerinden tahmindir; asfalt kalitesi, kapalı yollar ve motosiklete uygunluk doğrulanmaz. Canlı navigasyon gerektiğinde rotayı yeniden hesaplayabilir.</p>';
 box.classList.add("active");
 box.querySelectorAll("[data-tour]").forEach(b=>b.onclick=function(){choose(Number(b.dataset.tour))});
 const open=id("grTourOpen");if(open)open.onclick=openSelected;
}
async function plan(){
 if(busy||!config)return;
 reset();busy=true;const run=++sequence;
 const btn=id("grTourPlan"),target=Number(id("grTourLength").value);
 const dir=id("grTourDirection").value,style=id("grTourStyle").value;
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
  for(let i=0;i<(style==="curvy"||style==="verycurvy"?dirs.length:3);i++){
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
    const curveScore=curvature(pts,km);
    found.push({name:cand.name,km,sec,origin,middle:cand.middle,points:pts,
      steps:extractSteps(rt),curveScore});
    options=found.slice();
    outline(options[options.length-1],options.length-1);
    renderOptions();
   }catch(err){console.warn("Tour candidate unavailable",err)}
  }
  if(run!==sequence||mode!=="tour")return;
  if(!found.length)throw Error("Bu bölgede uygun halkalı rota bulunamadı. Başka yön veya mesafe dene.");
  // Keep the path and rendered line arrays in the same sorted order.
  found.sort((a,b)=>score(b,style,target)-score(a,style,target));
  options=found;clearLines();options.forEach(outline);choose(0);fit();
  setMessage(found.length+" tur hesaplandı. "+(style==="verycurvy"?"Çok virajlı":style==="curvy"?"Virajlı":style==="fast"?"Hızlı":"Dengeli")+" tercihe göre sıralandı.");
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
if(typeof module==="object"&&module.exports)module.exports={offset,candidates,externalUrl,curvature,score,extractSteps};
})(typeof window!=="undefined"?window:globalThis);
