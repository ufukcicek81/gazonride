(function(){
"use strict";
var modal,currentRide=null,anim=0,start=0,duration=12000,auto=true;
var map3d=null,classicMap=null,route3d=null,travel3d=null,bike3d=null,classicRoute=null,classicTravel=null,classicBike=null,using3d=false;

function $(id){return document.getElementById(id)}
function rides(){try{var a=JSON.parse(localStorage.getItem("gazon_rides")||"[]");if(!Array.isArray(a))a=[];if(window.GaZonDemoRide)a=a.concat([window.GaZonDemoRide]);return a}catch(e){return window.GaZonDemoRide?[window.GaZonDemoRide]:[]}}
function pts(ride){return (ride&&ride.track||[]).filter(function(p){return Array.isArray(p)&&p.length>=2&&isFinite(Number(p[0]))&&isFinite(Number(p[1]))}).map(function(p){return {lat:Number(p[0]),lng:Number(p[1]),alt:p[2]==null?0:Number(p[2]),time:p[3]||0}})}
function bearing(a,b){var p=Math.PI/180,y1=a.lat*p,y2=b.lat*p,dl=(b.lng-a.lng)*p;return (Math.atan2(Math.sin(dl)*Math.cos(y2),Math.cos(y1)*Math.sin(y2)-Math.sin(y1)*Math.cos(y2)*Math.cos(dl))*180/Math.PI+360)%360}
function interpolate(a,b,t){return {lat:a.lat+(b.lat-a.lat)*t,lng:a.lng+(b.lng-a.lng)*t,alt:(a.alt||0)+((b.alt||0)-(a.alt||0))*t}}
function pointAt(a,p){
 if(!a.length)return null;
 var f=Math.max(0,Math.min(1,p))*(a.length-1),i=Math.min(a.length-2,Math.floor(f)),t=f-i;
 if(a.length===1)return a[0];
 return {point:interpolate(a[i],a[i+1],t),i:i,next:a[i+1]};
}
function waitForGoogle(){
 return new Promise(function(resolve,reject){
  var n=0;(function tick(){if(window.google&&google.maps&&google.maps.importLibrary)return resolve();if(++n>80)return reject(new Error("Google Maps hazır değil"));setTimeout(tick,100)})();
 })
}
function clearMap(){
 cancelAnimationFrame(anim);anim=0;start=0;
 var host=$("grReplayMap");if(host)host.innerHTML="";
 map3d=null;classicMap=null;route3d=null;travel3d=null;bike3d=null;classicRoute=null;classicTravel=null;classicBike=null;using3d=false;
}
async function build3DMap(ride){
 var a=pts(ride),host=$("grReplayMap");if(!host||a.length<2)throw new Error("Rota izi yok");
 clearMap();
 await waitForGoogle();
 try{
  var lib=await google.maps.importLibrary("maps3d");
  var Map3DElement=lib.Map3DElement,Polyline3DElement=lib.Polyline3DElement,Marker3DElement=lib.Marker3DElement;
  if(!Map3DElement||!Polyline3DElement||!Marker3DElement)throw new Error("3D Maps desteklenmiyor");
  var first=a[0],second=a[1],hd=bearing(first,second);
  map3d=new Map3DElement({
   center:{lat:first.lat,lng:first.lng,altitude:Math.max(0,first.alt||0)},
   range:900,
   tilt:67.5,
   heading:hd,
   mode:"SATELLITE",
   defaultUIDisabled:true
  });
  map3d.style.width="100%";map3d.style.height="100%";map3d.style.display="block";
  route3d=new Polyline3DElement({
   path:a.map(function(p){return {lat:p.lat,lng:p.lng,altitude:Math.max(1,p.alt||1)}}),
   strokeColor:"#ff5a1f",strokeWidth:8,outerColor:"#ffffff",outerWidth:.18,
   altitudeMode:"RELATIVE_TO_GROUND",drawsOccludedSegments:true
  });
  travel3d=new Polyline3DElement({
   path:[{lat:first.lat,lng:first.lng,altitude:Math.max(2,first.alt||2)}],
   strokeColor:"#ffffff",strokeWidth:5,altitudeMode:"RELATIVE_TO_GROUND",drawsOccludedSegments:true
  });
  bike3d=new Marker3DElement({
   position:{lat:first.lat,lng:first.lng,altitude:Math.max(5,first.alt||5)},
   altitudeMode:"RELATIVE_TO_GROUND",label:"🏍",sizePreserved:true,drawsWhenOccluded:true
  });
  map3d.append(route3d);map3d.append(travel3d);map3d.append(bike3d);host.append(map3d);using3d=true;
  return true;
 }catch(e){
  console.warn("Maps 3D fallback",e);
  return buildClassicMap(a,host);
 }
}
function buildClassicMap(a,host){
 host.innerHTML="";
 var first=a[0];
 classicMap=new google.maps.Map(host,{center:{lat:first.lat,lng:first.lng},zoom:17,mapTypeId:"hybrid",disableDefaultUI:true,gestureHandling:"greedy",clickableIcons:false});
 classicRoute=new google.maps.Polyline({map:classicMap,path:a.map(function(p){return {lat:p.lat,lng:p.lng}}),strokeColor:"#ff5a1f",strokeWeight:8,strokeOpacity:.95});
 classicTravel=new google.maps.Polyline({map:classicMap,path:[{lat:first.lat,lng:first.lng}],strokeColor:"#ffffff",strokeWeight:5,strokeOpacity:.95});
 classicBike=new google.maps.Marker({map:classicMap,position:{lat:first.lat,lng:first.lng},label:{text:"🏍",fontSize:"22px"},icon:{path:google.maps.SymbolPath.CIRCLE,scale:15,fillColor:"#ff5a1f",fillOpacity:1,strokeColor:"#fff",strokeWeight:3}});
 try{classicMap.setTilt(45)}catch(e){}
 var b=new google.maps.LatLngBounds();a.forEach(function(p){b.extend({lat:p.lat,lng:p.lng})});classicMap.fitBounds(b,45);
 using3d=false;return true;
}
function updateScene(progress){
 var a=pts(currentRide);if(a.length<2)return;
 var x=pointAt(a,progress);if(!x)return;
 var p=x.point,hd=bearing(p,x.next);
 if(using3d&&map3d){
  bike3d.position={lat:p.lat,lng:p.lng,altitude:Math.max(5,p.alt||5)};
  travel3d.path=a.slice(0,x.i+1).concat([p]).map(function(q){return {lat:q.lat,lng:q.lng,altitude:Math.max(2,q.alt||2)}});
  map3d.center={lat:p.lat,lng:p.lng,altitude:Math.max(0,p.alt||0)};
  map3d.heading=hd;map3d.tilt=67.5;map3d.range=700;
 }else if(classicMap){
  var pos={lat:p.lat,lng:p.lng};classicBike.setPosition(pos);
  classicTravel.setPath(a.slice(0,x.i+1).concat([p]).map(function(q){return {lat:q.lat,lng:q.lng}}));
  classicMap.panTo(pos);classicMap.setZoom(18);try{classicMap.setTilt(45);classicMap.setHeading(hd)}catch(e){}
 }
 var bar=$("grReplayBar");if(bar)bar.style.width=Math.round(progress*100)+"%";
}
function loop(ts){
 if(!auto)return;
 if(!start)start=ts;
 var p=((ts-start)%duration)/duration;updateScene(p);anim=requestAnimationFrame(loop)
}
async function open(ride){
 currentRide=ride;if(!modal)install();modal.classList.add("active");document.body.style.overflow="hidden";
 $("grReplayKm").textContent=Number(ride.km||0).toFixed(1)+" km";
 $("grReplayTime").textContent=ride.duration||"00:00";
 $("grReplayMax").textContent=Math.round(Number(ride.max||0))+" km/s";
 $("grReplayName").textContent=ride.destination||"Sürüş Tekrarı";
 $("grReplayDate").textContent=ride.date||"";
 $("grReplayState").textContent="3D harita hazırlanıyor…";
 try{await build3DMap(ride);$("grReplayState").textContent=using3d?"Google Maps 3D · canlı kamera":"Google Harita · eğimli kamera";auto=true;start=0;cancelAnimationFrame(anim);anim=requestAnimationFrame(loop)}
 catch(e){$("grReplayState").textContent="3D harita açılamadı";console.warn(e)}
}
function close(){auto=false;cancelAnimationFrame(anim);clearMap();if(modal)modal.classList.remove("active");document.body.style.overflow=""}
function toggle(){auto=!auto;$("grReplayPlay").innerHTML=auto?'<span class="mi">pause</span> Duraklat':'<span class="mi">play_arrow</span> Oynat';if(auto){start=0;anim=requestAnimationFrame(loop)}else cancelAnimationFrame(anim)}
async function shareRide(){
 var t=(currentRide.destination||"GaZonRide 3D Sürüş")+" · "+Number(currentRide.km||0).toFixed(1)+" km · "+(currentRide.duration||"");
 try{if(navigator.share){await navigator.share({title:"GaZonRide 3D Sürüş",text:t});return}}catch(e){}
 if(navigator.clipboard)try{await navigator.clipboard.writeText(t);alert("Sürüş bilgisi kopyalandı.")}catch(e){}
}
function scan(){
 document.querySelectorAll("#historyList .ride").forEach(function(row,i){if(row.querySelector("[data-gr-replay]"))return;var b=document.createElement("button");b.className="mapBtn";b.setAttribute("data-gr-replay",String(i));b.title="3D Sürüş Tekrarı";b.innerHTML='<span class="mi">3d_rotation</span>';b.onclick=function(){var r=rides()[Number(b.getAttribute("data-gr-replay"))];if(r)open(r)};row.appendChild(b)});
 document.querySelectorAll("#screen [data-route]").forEach(function(routeBtn){var card=routeBtn.closest(".screenCard");if(!card||card.querySelector("[data-gr-screen-replay]"))return;var i=Number(routeBtn.getAttribute("data-route")),b=document.createElement("button");b.className="screenBtn";b.setAttribute("data-gr-screen-replay",String(i));b.innerHTML='<span class="mi" style="vertical-align:-5px">3d_rotation</span> 3D Sürüş Tekrarı';b.onclick=function(){var r=rides()[Number(b.getAttribute("data-gr-screen-replay"))];if(r)open(r)};routeBtn.insertAdjacentElement("afterend",b)});
}
function install(){
 modal=document.createElement("div");modal.id="grReplay";modal.className="gr-replay";
 modal.innerHTML='<div class="gr-replay-wrap"><div class="gr-replay-head"><div><b>3D Sürüş Tekrarı</b><small id="grReplayState">Google Maps 3D</small></div><button class="gr-replay-close" id="grReplayClose"><span class="mi">close</span></button></div><div class="gr-replay-stage"><div id="grReplayMap" class="gr-replay-map"></div><div class="gr-replay-overlay"><div class="gr-replay-stat"><b id="grReplayKm">0 km</b><small>MESAFE</small></div><div class="gr-replay-stat"><b id="grReplayTime">00:00</b><small>SÜRE</small></div><div class="gr-replay-stat"><b id="grReplayMax">0 km/s</b><small>MAX HIZ</small></div></div><div class="gr-replay-title"><b id="grReplayName">Sürüş Tekrarı</b><small id="grReplayDate"></small><div class="gr-replay-progress"><i id="grReplayBar"></i></div></div></div><div class="gr-replay-controls"><button id="grReplayPlay"><span class="mi">pause</span> Duraklat</button><button class="primary" id="grReplayShare"><span class="mi">share</span> Rotayı Paylaş</button></div><div class="gr-replay-note">3D tekrar gerçek Google haritası üzerinde rota izini takip eder. Desteklenen cihazlarda 3D binalar ve arazi, diğer cihazlarda eğimli Google harita görünümü kullanılır.</div></div>';
 document.body.appendChild(modal);$("grReplayClose").onclick=close;$("grReplayPlay").onclick=toggle;$("grReplayShare").onclick=shareRide;
 new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});scan()
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install);else install();
window.GaZonReplay={open:open,scan:scan};
})();