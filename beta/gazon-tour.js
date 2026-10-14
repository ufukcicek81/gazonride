/* GazOnRide Tour Planner UI v2
 * Planning logic lives in gazon-tour-engine.js (tested on a synthetic road
 * network). This file connects it to Google Routes, the map and the cards.
 * Android Native Navigation SDK receives the SAME loop corners plus a route
 * token, so turn-by-turn guidance follows the previewed loop.
 */
(function(global){
"use strict";
const Engine=global.GaZonTourEngine||(typeof require==="function"?require("./gazon-tour-engine.js"):null);
const KILOMETERS=[50,100,150];
let config=null,mode="destination",sequence=0,options=[],selected=0,lines=[],busy=false,home=null;
const id=function(x){return document.getElementById(x)};
function esc(s){return String(s||"").replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
const normalize=Engine.point,offset=Engine.offset,loopQuality=Engine.loopQuality,curvature=Engine.curvature,score=Engine.score;
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
function clearLines(){lines.forEach(function(p){
 try{p.setMap(null)}catch(e){}
 if(p._gazonOutline)try{p._gazonOutline.setMap(null)}catch(e){}
});lines=[]}
function reset(){sequence++;options=[];selected=0;busy=false;clearLines();showResults(false);let el=id("grTourChoices");if(el){el.classList.remove("active");el.innerHTML=""}
 let btn=id("grTourPlan");if(btn){btn.disabled=false;btn.innerHTML='<span class="mi">alt_route</span> Tur önerisi oluştur'}
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
 const path=d.points.map(p=>({lat:p.lat,lng:p.lon}));
 const active=i===selected,zi=active?30:14;
 const edge=new google.maps.Polyline({map,path,strokeColor:"#ffffff",
  strokeWeight:active?10:8,strokeOpacity:active?.95:.65,zIndex:zi-1,clickable:false});
 const line=new google.maps.Polyline({map,path,
  strokeColor:active?"#1A73E8":"#91A7BF",strokeWeight:active?6:5,
  strokeOpacity:active?1:.83,zIndex:zi,clickable:true});
 line._gazonOutline=edge;
 line.addListener("click",function(){choose(i)});
 lines.push(line);
}
// Results view: the planner shrinks to one summary line so the map between
// it and the choice cards shows the whole selected loop before SÜR.
function showResults(on){
 document.body.classList.toggle("gr-tour-has-options",!!on);
 const sum=id("grTourSummary");if(!sum)return;
 if(!on){sum.hidden=true;return}
 const len=id("grTourLength"),style=id("grTourStyle");
 sum.hidden=false;
 sum.querySelector("b").textContent=(len?len.value:"")+" km · "+(style?style.options[style.selectedIndex].text:"")+" · "+options.length+" tur";
}
// Fit the SELECTED loop into the visible gap between top panel and sheet.
function fit(){
 const map=config.getMap(),o=options[selected];if(!map||!o)return;
 requestAnimationFrame(function(){
  const bounds=new google.maps.LatLngBounds();
  o.points.forEach(p=>bounds.extend({lat:p.lat,lng:p.lon}));
  if(bounds.isEmpty())return;
  const panel=id("navigationPanel"),sheet=id("grTourChoices"),h=window.innerHeight;
  const top=panel?Math.max(20,panel.getBoundingClientRect().bottom+14):h*.3;
  const sheetTop=sheet&&sheet.classList.contains("active")?sheet.getBoundingClientRect().top:h*.7;
  const bottom=Math.max(20,h-sheetTop+28);
  if(top+bottom>h-120){map.fitBounds(bounds,40);return}
  // Generous side margins: the whole loop plus some surroundings.
  map.fitBounds(bounds,{top:top+16,bottom:bottom,left:44,right:44});
 });
}
function choose(i){
 if(!options[i])return;selected=i;
 lines.forEach(function(line,j){
  const active=j===i,zi=active?30:14;
  line.setOptions({strokeColor:active?"#1A73E8":"#91A7BF",
   strokeWeight:active?6:5,strokeOpacity:active?1:.83,zIndex:zi});
  if(line._gazonOutline)line._gazonOutline.setOptions({
   strokeWeight:active?10:8,strokeOpacity:active?.95:.65,zIndex:zi-1});
 });
 renderOptions();
 fit();
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
 const open=id("grTourOpen");if(open)open.disabled=true;
 setMessage("Tur navigasyona hazırlanıyor…");
 Promise.resolve(config.launchInside(o)).then(function(started){
  if(started){
   setMessage("Tur GazOnRide içinde başlatılıyor. Yol boyunca dönüşleri takip et.");
   const box=id("grTourChoices");if(box)box.classList.remove("active");
  }else setMessage("Tur navigasyonu başlatılamadı. Lütfen uygulama izinlerini kontrol et.");
 },function(){setMessage("Tur navigasyonu başlatılamadı. Tekrar dene.")})
 .then(function(){if(open)open.disabled=false});
}
function duration(sec){const m=Math.round(sec/60);return m>=60?Math.floor(m/60)+' sa '+(m%60)+' dk':m+' dk'}
function renderOptions(){
 const box=id("grTourChoices");if(!box)return;
 if(!options.length){box.classList.remove("active");box.innerHTML="";return}
 const target=Number(id("grTourLength").value);
 box.innerHTML='<div class="gr-tour-heading"><b>Turunu seç</b><small>'+options.length+' gerçek yol rotası</small></div>'+
 '<div class="gr-tour-routes">'+options.map(function(x,i){
  return '<button type="button" data-tour="'+i+'" aria-pressed="'+(i===selected)+'" class="gr-tour-route'+(i===selected?' active':'')+'">'+
  '<b>'+(i+1)+'. '+esc(x.name)+'</b><strong>'+x.km.toFixed(1)+' km</strong><small>'+duration(x.sec)+' · viraj '+x.curveScore+' /10 km'+(x.overlap>=.02?' · yol tekrarı %'+Math.round(x.overlap*100):'')+'</small>'+(x.warning?'<em class="gr-tour-warning">'+esc(x.warning)+'</em>':'')+'</button>'
 }).join("")+'</div>'+
 '<div class="gr-tour-action"><button id="grTourOpen" type="button"><span class="mi">two_wheeler</span> SÜR · Turu başlat</button></div>'+
 '<p class="gr-tour-disclaimer">Viraj puanı Google yol çizgilerinden tahmindir; asfalt kalitesi, kapalı yollar ve motosiklete uygunluk doğrulanmaz. Canlı navigasyon gerektiğinde rotayı yeniden hesaplayabilir.</p>';
 box.classList.add("active");
 box.querySelectorAll("[data-tour]").forEach(b=>b.onclick=function(){choose(Number(b.dataset.tour))});
 const open=id("grTourOpen");if(open)open.onclick=openSelected;
}
// Google Routes adapter for the engine. Same request shape as navigation.
function googleRouter(Route){
 return async function(req){
  const request={origin:{lat:req.origin.lat,lng:req.origin.lon},
   destination:{lat:req.destination.lat,lng:req.destination.lon},
   intermediates:req.intermediates.map(p=>({location:{lat:p.lat,lng:p.lon}})),
   travelMode:"DRIVING",polylineQuality:"HIGH_QUALITY",routingPreference:"TRAFFIC_AWARE",
   fields:["path","legs","distanceMeters","durationMillis"]};
  if(req.avoidHighways)request.routeModifiers={avoidHighways:true};
  const result=await Route.computeRoutes(request);
  const rt=result&&result.routes&&result.routes[0];
  if(!rt||!rt.path||rt.path.length<3)return null;
  return {points:rt.path.map(normalize).filter(Boolean),km:Number(rt.distanceMeters)/1000,
   sec:Number(rt.durationMillis)/1000,steps:extractSteps(rt)};
 };
}
const STYLE_NAMES={verycurvy:"Çok virajlı",curvy:"Virajlı",fast:"Hızlı",balanced:"Dengeli"};
async function plan(){
 if(busy||!config)return;
 reset();busy=true;const run=++sequence;
 const btn=id("grTourPlan"),target=Number(id("grTourLength").value);
 const dir=id("grTourDirection").value,style=id("grTourStyle").value;
 if(btn){btn.disabled=true;btn.innerHTML='<span class="mi">hourglass_top</span> Hesaplanıyor'}
 const live=()=>run===sequence&&mode==="tour";
 try{
  if(!KILOMETERS.includes(target))throw Error("Desteklenmeyen kilometre hedefi");
  if(!config.googleReady()||!config.getMap()){throw Error("Google harita hazır değil. İnterneti kontrol et.")}
  const origin=normalize(await config.getOrigin());
  if(!origin)throw Error("Konum bulunamadı. GPS iznini açıp yeniden dene.");
  home=origin;
  const {Route}=await google.maps.importLibrary("routes");
  if(!live())return;
  setMessage("Gerçek yollar üzerinde halka turlar aranıyor…");
  const result=await Engine.planTours({origin,targetKm:target,style,direction:dir,
   router:googleRouter(Route),cancelled:()=>!live(),
   onProgress:p=>{if(live())setMessage("Halka turlar aranıyor · "+p.found+" uygun · "+p.requests+" yol hesabı")}});
  if(!live())return;
  if(!result.options.length)throw Error(result.error==="router-unavailable"?
   "Google rota servisine ulaşılamadı. İnterneti kontrol edip tekrar dene.":
   "Bu bölgede hedef kilometreye uygun tur bulunamadı. Başka yön veya mesafe dene.");
  options=result.options;clearLines();options.forEach(outline);showResults(true);choose(0);
  const relaxed=options[0].relaxed;
  setMessage(options.length+" tur hazır · "+STYLE_NAMES[style]+" tercihine göre sıralandı."+
   (relaxed?" Bu bölgede tam halka sınırlı; uyarılı seçenekler gösteriliyor.":""));
 }catch(err){
  if(run===sequence){console.warn("Tour planning unavailable",err);setMessage(err&&err.message||"Tur hesaplanamadı. Tekrar dene.")}
 }finally{
  if(run===sequence){busy=false;if(btn){btn.disabled=false;btn.innerHTML='<span class="mi">alt_route</span> Tur önerisi oluştur'}}
 }
}
function init(settings){
 config=settings;
 let b=id("grModeDestination"),t=id("grModeTour");
 if(b)b.onclick=()=>setMode("destination");
 if(t)t.onclick=()=>setMode("tour");
 let planButton=id("grTourPlan");if(planButton)planButton.onclick=plan;
 const edit=id("grTourEdit");if(edit)edit.onclick=function(){document.body.classList.remove("gr-tour-has-options");const sum=id("grTourSummary");if(sum)sum.hidden=true};
 const box=id("grTourChoices");if(box&&box.parentElement!==document.body)document.body.appendChild(box);
 setMode("destination");
}
const api={init,setMode,isTourMode,plan,clear:reset,offset,externalUrl};
global.GaZonTour=api;
if(typeof module==="object"&&module.exports)module.exports={offset,externalUrl,curvature,score,extractSteps,loopQuality,googleRouter};
})(typeof window!=="undefined"?window:globalThis);
