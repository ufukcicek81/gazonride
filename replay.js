(function(){
"use strict";
var modal,currentRide=null,anim=0,start=0,duration=65000,auto=false,mode="overview",introDelay=900,lastProgress=0,playPoints=[],playCum=[],playTotal=0,lastCameraTs=0,lastTrailTs=0,lastCameraHeading=0,lastCameraPoint=null;
var overviewMap=null,overviewRoute=null,startMarker=null,endMarker=null;
var map3d=null,classicMap=null,route3d=null,travel3d=null,bike3d=null,classicRoute=null,classicTravel=null,classicBike=null,using3d=false;

function $(id){return document.getElementById(id)}
function rides(){try{var a=JSON.parse(localStorage.getItem("gazon_rides")||"[]");if(!Array.isArray(a))a=[];if(window.GaZonDemoRide)a=a.concat([window.GaZonDemoRide]);return a}catch(e){return window.GaZonDemoRide?[window.GaZonDemoRide]:[]}}
function pts(ride){return (ride&&ride.track||[]).filter(function(p){return Array.isArray(p)&&p.length>=2&&isFinite(Number(p[0]))&&isFinite(Number(p[1]))}).map(function(p){return {lat:Number(p[0]),lng:Number(p[1]),alt:p[2]==null?0:Number(p[2]),time:p[3]||0}})}
function bearing(a,b){var p=Math.PI/180,y1=a.lat*p,y2=b.lat*p,dl=(b.lng-a.lng)*p;return (Math.atan2(Math.sin(dl)*Math.cos(y2),Math.cos(y1)*Math.sin(y2)-Math.sin(y1)*Math.cos(y2)*Math.cos(dl))*180/Math.PI+360)%360}
function interpolate(a,b,t){return {lat:a.lat+(b.lat-a.lat)*t,lng:a.lng+(b.lng-a.lng)*t,alt:(a.alt||0)+((b.alt||0)-(a.alt||0))*t}}
function geoKm(a,b){var R=6371,p=Math.PI/180,dLat=(b.lat-a.lat)*p,dLon=(b.lng-a.lng)*p,x=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(a.lat*p)*Math.cos(b.lat*p)*Math.sin(dLon/2)*Math.sin(dLon/2);return 2*R*Math.asin(Math.sqrt(x))}
function lerpAngle(a,b,t){var d=((b-a+540)%360)-180;return (a+d*t+360)%360}
function replaySource(ride){return ride&&Array.isArray(ride._matchedReplayPath)&&ride._matchedReplayPath.length>1?ride._matchedReplayPath:pts(ride)}
function simplifyForMatch(a,max){if(a.length<=max)return a.slice();var out=[],step=(a.length-1)/(max-1);for(var i=0;i<max;i++)out.push(a[Math.min(a.length-1,Math.round(i*step))]);return out}
function resamplePath(a,spacingM){if(!a||a.length<2)return a||[];var out=[a[0]],target=Math.max(4,Number(spacingM||7))/1000,carry=0;for(var i=1;i<a.length;i++){var s=a[i-1],e=a[i],seg=geoKm(s,e);if(seg<=0)continue;var used=0;while(carry+(seg-used)>=target){var need=target-carry,t=(used+need)/seg;out.push(interpolate(s,e,Math.max(0,Math.min(1,t))));used+=need;carry=0}carry+=Math.max(0,seg-used)}out.push(a[a.length-1]);return out}
async function matchRideToRoads(ride){var raw=pts(ride);if(raw.length<2)return raw;var sample=simplifyForMatch(raw,80);try{var coords=sample.map(function(p){return p.lng.toFixed(6)+","+p.lat.toFixed(6)}).join(";"),url="https://router.project-osrm.org/match/v1/driving/"+coords+"?overview=full&geometries=geojson&tidy=true";var res=await fetch(url,{cache:"no-store"});if(!res.ok)throw new Error("match "+res.status);var data=await res.json(),m=data&&data.matchings&&data.matchings[0],g=m&&m.geometry&&m.geometry.coordinates;if(!Array.isArray(g)||g.length<2)throw new Error("matched path empty");return resamplePath(g.map(function(q){return {lat:Number(q[1]),lng:Number(q[0]),alt:0,time:0}}),7)}catch(e){console.warn("Road match fallback",e);return resamplePath(raw,7)}}
function preparePlayback(ride){
 playPoints=replaySource(ride);playCum=[0];playTotal=0;
 for(var i=1;i<playPoints.length;i++){playTotal+=geoKm(playPoints[i-1],playPoints[i]);playCum.push(playTotal)}
}
function pointAtDistance(progress){
 var a=playPoints;if(!a.length)return null;if(a.length===1)return {point:a[0],i:0,next:a[0]};
 var target=Math.max(0,Math.min(1,progress))*Math.max(.000001,playTotal),lo=0,hi=playCum.length-1;
 while(lo<hi){var mid=Math.floor((lo+hi)/2);if(playCum[mid]<target)lo=mid+1;else hi=mid}
 var i=Math.max(0,Math.min(a.length-2,lo-1)),seg=Math.max(.000001,playCum[i+1]-playCum[i]),t=Math.max(0,Math.min(1,(target-playCum[i])/seg));
 return {point:interpolate(a[i],a[i+1],t),i:i,next:a[i+1]};
}
function waitForGoogle(){return new Promise(function(resolve,reject){var n=0;(function tick(){if(window.google&&google.maps&&google.maps.importLibrary)return resolve();if(++n>100)return reject(new Error("Google Maps hazır değil"));setTimeout(tick,100)})()})}
function parseDuration(s){var a=String(s||"0").split(":").map(Number);if(a.length===3)return a[0]*3600+a[1]*60+a[2];if(a.length===2)return a[0]*60+a[1];return Number(a[0]||0)}
function fmtDuration(sec){sec=Math.max(0,Math.round(Number(sec||0)));var h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;return (h?String(h).padStart(2,"0")+":":"")+String(m).padStart(2,"0")+":"+String(s).padStart(2,"0")}
function avgSpeed(ride){var sec=parseDuration(ride.duration);return sec>0?Math.round(Number(ride.km||0)/(sec/3600)):0}
function replayDurationMs(ride){
 var km=Math.max(1,Number(ride&&ride.km||0));
 var base=km*700;
 return Math.max(45000,Math.min(100000,base));
}

async function computeDemoRouteNewApi(start,end){
 var routesLib=await google.maps.importLibrary("routes"),Route=routesLib.Route;
 var req={origin:{lat:start.lat,lng:start.lng},destination:{lat:end.lat,lng:end.lng},travelMode:"DRIVING",routingPreference:"TRAFFIC_AWARE",polylineQuality:"HIGH_QUALITY",fields:["path","distanceMeters","durationMillis","legs"]};
 var result=await Route.computeRoutes(req),rt=result&&result.routes&&result.routes[0];
 if(!rt||!rt.path||rt.path.length<2)throw new Error("Yeni Routes API rota vermedi");
 return {
  path:rt.path.map(function(p){return {lat:typeof p.lat==="function"?p.lat():Number(p.lat),lng:typeof p.lng==="function"?p.lng():Number(p.lng)}}),
  distance:Number(rt.distanceMeters||0),
  durationMs:Math.max(60000,Number(rt.durationMillis||3600000)),
  turns:(rt.legs||[]).reduce(function(t,l){return t+((l.steps||[]).length||0)},0)
 }
}
async function computeDemoRouteLegacy(start,end){
 return new Promise(function(resolve,reject){
  try{
   var svc=new google.maps.DirectionsService();
   svc.route({origin:start,destination:end,travelMode:google.maps.TravelMode.DRIVING,provideRouteAlternatives:false},function(res,status){
    if(status!=="OK"||!res||!res.routes||!res.routes[0]){reject(new Error("Directions: "+status));return}
    var r=res.routes[0],leg=r.legs&&r.legs[0],path=r.overview_path||[];
    if(path.length<2){reject(new Error("Directions rota izi boş"));return}
    resolve({
     path:path.map(function(p){return {lat:p.lat(),lng:p.lng()}}),
     distance:Number(leg&&leg.distance&&leg.distance.value||0),
     durationMs:Number(leg&&leg.duration&&leg.duration.value||3600)*1000,
     turns:(leg&&leg.steps&&leg.steps.length)||0
    })
   })
  }catch(e){reject(e)}
 })
}
async function resolveDemoRoadRoute(ride){
 if(!ride||!ride.demoGoogleRoute)return ride;
 if(Array.isArray(ride.track)&&ride.track.length>20)return ride;
 await waitForGoogle();
 var start={lat:40.8438,lng:31.1565};
 var end={lat:40.777225,lng:30.394154};
 var data;
 try{data=await computeDemoRouteNewApi(start,end)}
 catch(e){console.warn("Demo new Routes failed",e);data=await computeDemoRouteLegacy(start,end)}
 if(!data||!data.path||data.path.length<2)throw new Error("Düzce - Çark Caddesi rota izi alınamadı");
 var totalMs=data.durationMs,base=Date.now()-86400000,step=Math.max(500,Math.round(totalMs/Math.max(1,data.path.length-1)));
 ride.track=data.path.map(function(p,i){return [p.lat,p.lng,0,base+i*step]});
 ride.km=Number(data.distance||0)/1000;
 ride.duration=fmtDuration(totalMs/1000);
 ride.turns=Number(data.turns||0);
 ride.demoResolved=true;
 return ride
}
function clearMaps(){
 cancelAnimationFrame(anim);anim=0;start=0;auto=false;
 var host=$("grReplayMap");if(host)host.innerHTML="";
 overviewMap=null;overviewRoute=null;startMarker=null;endMarker=null;
 map3d=null;classicMap=null;route3d=null;travel3d=null;bike3d=null;classicRoute=null;classicTravel=null;classicBike=null;using3d=false;
}
function makeDotIcon(color,scale){return {path:google.maps.SymbolPath.CIRCLE,scale:scale||8,fillColor:color,fillOpacity:1,strokeColor:"#fff",strokeWeight:3}}
function buildOverviewMap(ride){
 var a=replaySource(ride),host=$("grReplayMap");if(!host||a.length<2)throw new Error("Rota izi yok");
 host.innerHTML="";
 overviewMap=new google.maps.Map(host,{center:{lat:a[0].lat,lng:a[0].lng},zoom:10,mapTypeId:"roadmap",disableDefaultUI:true,gestureHandling:"greedy",clickableIcons:false});
 overviewRoute=new google.maps.Polyline({map:overviewMap,path:a.map(function(p){return {lat:p.lat,lng:p.lng}}),strokeColor:"#d9272e",strokeWeight:6,strokeOpacity:1});
 startMarker=new google.maps.Marker({map:overviewMap,position:{lat:a[0].lat,lng:a[0].lng},icon:makeDotIcon("#27c46b",8),title:"Başlangıç"});
 var e=a[a.length-1];
 endMarker=new google.maps.Marker({map:overviewMap,position:{lat:e.lat,lng:e.lng},icon:makeDotIcon("#d9272e",9),title:"Varış"});
 var b=new google.maps.LatLngBounds();a.forEach(function(p){b.extend({lat:p.lat,lng:p.lng})});overviewMap.fitBounds(b,48);
 mode="overview";$("grReplayPlay3D").style.display="inline-flex";$("grReplayPause").style.display="none";$("grReplayState").textContent="Gerçek yol rotası";
}
async function buildClassicFollowMap(ride){
 var a=replaySource(ride),host=$("grReplayMap");if(!host||a.length<2)throw new Error("Rota izi yok");
 host.innerHTML="";
 using3d=false;map3d=null;route3d=null;travel3d=null;bike3d=null;
 classicMap=new google.maps.Map(host,{
  center:{lat:a[0].lat,lng:a[0].lng},zoom:16,mapTypeId:"roadmap",
  disableDefaultUI:true,gestureHandling:"greedy",clickableIcons:false,
  streetViewControl:false,fullscreenControl:false,mapTypeControl:false
 });
 classicRoute=new google.maps.Polyline({map:classicMap,path:a.map(function(p){return {lat:p.lat,lng:p.lng}}),strokeColor:"#20e0d0",strokeWeight:7,strokeOpacity:.96});
 classicTravel=new google.maps.Polyline({map:classicMap,path:[{lat:a[0].lat,lng:a[0].lng}],strokeColor:"#ffffff",strokeWeight:3,strokeOpacity:.9});
 classicBike=new google.maps.Marker({map:classicMap,position:{lat:a[0].lat,lng:a[0].lng},label:{text:"🏍",fontSize:"22px"},icon:makeDotIcon("#ff5a1f",13),zIndex:50});
 lastCameraHeading=bearing(a[0],a[Math.min(3,a.length-1)]);lastCameraPoint={lat:a[0].lat,lng:a[0].lng};
 try{classicMap.setTilt(35);classicMap.setHeading(lastCameraHeading)}catch(e){}
 startReplayPlayback(ride,"Uyumlu takip görünümü");
}

function routeBoundsInfo(a){
 var minLat=90,maxLat=-90,minLng=180,maxLng=-180;
 a.forEach(function(p){minLat=Math.min(minLat,p.lat);maxLat=Math.max(maxLat,p.lat);minLng=Math.min(minLng,p.lng);maxLng=Math.max(maxLng,p.lng)});
 var center={lat:(minLat+maxLat)/2,lng:(minLng+maxLng)/2,altitude:0};
 var diag=geoKm({lat:minLat,lng:minLng},{lat:maxLat,lng:maxLng});
 return {center:center,range:Math.max(1800,Math.min(18000,diag*1150))}
}

function startReplayPlayback(ride,label){
 mode="3d";$("grReplayPlay3D").style.display="none";$("grReplayPause").style.display="inline-flex";
 $("grReplayState").textContent=label||"Sinematik sürüş hazırlanıyor";
 auto=false;start=0;lastProgress=0;lastCameraTs=0;lastTrailTs=0;lastCameraPoint=null;lastCameraHeading=0;preparePlayback(ride);cancelAnimationFrame(anim);
 setTimeout(function(){
  if(mode!=="3d")return;
  auto=true;start=0;$("grReplayState").textContent=using3d?"Cinematic Replay · 3D arazi":"Sürüş takip görünümü";
  anim=requestAnimationFrame(loop)
 },using3d?2300:introDelay)
}

async function build3DMap(ride){
 var a=replaySource(ride),host=$("grReplayMap");if(!host||a.length<2)throw new Error("Rota izi yok");
 host.innerHTML="";await waitForGoogle();
 classicMap=null;classicRoute=null;classicTravel=null;classicBike=null;
 try{
  var lib=await google.maps.importLibrary("maps3d");
  var Map3DElement=lib.Map3DElement,Polyline3DElement=lib.Polyline3DElement,Marker3DElement=lib.Marker3DElement;
  if(!Map3DElement||!Polyline3DElement)throw new Error("3D Maps desteklenmiyor");
  var info=routeBoundsInfo(a),first=a[0],head=bearing(a[0],a[Math.min(4,a.length-1)]);
  map3d=new Map3DElement({
   center:{lat:info.center.lat,lng:info.center.lng,altitude:0},
   range:info.range,tilt:58,heading:head,mode:"HYBRID",
   defaultUIHidden:true,gestureHandling:"COOPERATIVE"
  });
  map3d.style.width="100%";map3d.style.height="100%";map3d.style.display="block";
  host.appendChild(map3d);

  route3d=new Polyline3DElement({
   path:a.map(function(p){return {lat:p.lat,lng:p.lng,altitude:2}}),
   altitudeMode:"RELATIVE_TO_GROUND",strokeColor:"#20E0D0",strokeWidth:10,
   outerColor:"#07191A",outerWidth:.32,drawsOccludedSegments:false,geodesic:true,zIndex:8
  });
  map3d.append(route3d);

  travel3d=new Polyline3DElement({
   path:[{lat:first.lat,lng:first.lng,altitude:4}],
   altitudeMode:"RELATIVE_TO_GROUND",strokeColor:"#FFFFFF",strokeWidth:5,
   outerColor:"#20E0D0",outerWidth:.28,drawsOccludedSegments:false,zIndex:12
  });
  map3d.append(travel3d);

  if(Marker3DElement){
   bike3d=new Marker3DElement({
    position:{lat:first.lat,lng:first.lng,altitude:7},
    altitudeMode:"RELATIVE_TO_GROUND",label:"🏍",sizePreserved:true,drawsWhenOccluded:false,zIndex:30
   });
   map3d.append(bike3d);
  }

  using3d=true;lastCameraHeading=head;lastCameraPoint={lat:first.lat,lng:first.lng};
  $("grReplayState").textContent="3D arazi hazırlanıyor…";
  try{
   map3d.flyCameraTo({
    endCamera:{center:{lat:first.lat,lng:first.lng,altitude:25},range:950,tilt:67,heading:head},
    durationMillis:2100
   });
  }catch(e){
   map3d.center={lat:first.lat,lng:first.lng,altitude:25};map3d.range=950;map3d.tilt=67;map3d.heading=head;
  }
  startReplayPlayback(ride,"Sinematik kamera hazırlanıyor");
 }catch(e){
  console.warn("3D cinematic fallback",e);
  await buildClassicFollowMap(ride)
 }
}
function updateScene(progress,ts){
 if(playPoints.length<2)preparePlayback(currentRide);
 var x=pointAtDistance(progress);if(!x)return;
 var p=x.point,pos={lat:p.lat,lng:p.lng},now=Number(ts||performance.now());
 if(using3d&&map3d){
  if(bike3d)try{bike3d.position={lat:p.lat,lng:p.lng,altitude:7}}catch(e){}
  if(now-lastTrailTs>140&&travel3d){
   try{travel3d.path=playPoints.slice(0,x.i+1).concat([p]).map(function(q){return {lat:q.lat,lng:q.lng,altitude:4}})}catch(e){}
   lastTrailTs=now
  }
  if(now-lastCameraTs>70){
   var ahead=playPoints[Math.min(playPoints.length-1,x.i+Math.max(5,Math.round(playPoints.length*.006)))]||x.next||p;
   var rawHead=bearing(p,ahead);
   lastCameraHeading=lerpAngle(lastCameraHeading||rawHead,rawHead,.12);
   if(!lastCameraPoint)lastCameraPoint={lat:pos.lat,lng:pos.lng};
   lastCameraPoint={lat:lastCameraPoint.lat+(pos.lat-lastCameraPoint.lat)*.16,lng:lastCameraPoint.lng+(pos.lng-lastCameraPoint.lng)*.16};
   var curve=Math.abs((((rawHead-lastCameraHeading)+540)%360)-180);
   var cinematicRange=820+Math.min(420,curve*9)+180*Math.sin(progress*Math.PI);
   try{
    map3d.center={lat:lastCameraPoint.lat,lng:lastCameraPoint.lng,altitude:25};
    map3d.heading=lastCameraHeading;map3d.tilt=67;map3d.range=cinematicRange;
   }catch(e){}
   lastCameraTs=now
  }
 }else if(classicMap){
  classicBike.setPosition(pos);
  if(now-lastTrailTs>120){
   classicTravel.setPath(playPoints.slice(0,x.i+1).concat([p]).map(function(q){return {lat:q.lat,lng:q.lng}}));
   lastTrailTs=now
  }
  if(now-lastCameraTs>90){
   var rawHead2=bearing(p,x.next||p);
   lastCameraHeading=lerpAngle(lastCameraHeading||rawHead2,rawHead2,.18);
   if(!lastCameraPoint)lastCameraPoint={lat:pos.lat,lng:pos.lng};
   lastCameraPoint={lat:lastCameraPoint.lat+(pos.lat-lastCameraPoint.lat)*.30,lng:lastCameraPoint.lng+(pos.lng-lastCameraPoint.lng)*.30};
   if(typeof classicMap.moveCamera==="function")classicMap.moveCamera({center:lastCameraPoint,zoom:16,heading:lastCameraHeading,tilt:35});
   else{classicMap.panTo(lastCameraPoint);try{classicMap.setHeading(lastCameraHeading);classicMap.setTilt(35)}catch(e){}}
   lastCameraTs=now
  }
 }
 var bar=$("grReplayBar");if(bar)bar.style.width=Math.round(progress*100)+"%"
}
function loop(ts){
 if(!auto)return;
 if(!start)start=ts;
 var p=Math.min(1,(ts-start)/duration);
 if(p<lastProgress)p=lastProgress;
 lastProgress=p;updateScene(p,ts);
 if(p>=1){auto=false;$("grReplayState").textContent="Sürüş tamamlandı";$("grReplayPause").innerHTML='<span class="mi">replay</span> Tekrar oynat';return}
 anim=requestAnimationFrame(loop)
}
async function open(ride){
 currentRide=ride;if(!modal)install();modal.classList.add("active");document.body.style.overflow="hidden";clearMaps();$("grReplayState").textContent="Düzce → Çark Caddesi gerçek yol rotası hazırlanıyor…";var host=$("grReplayMap");if(host)host.innerHTML='<div style="height:100%;display:grid;place-items:center;padding:24px;text-align:center;color:#c7ced8;font-weight:800">Google yol rotası hazırlanıyor…</div>';
 try{
  await waitForGoogle();currentRide=await resolveDemoRoadRoute(currentRide);currentRide._matchedReplayPath=await matchRideToRoads(currentRide);
  $("grReplayKm").textContent=Number(currentRide.km||0).toFixed(1);
  $("grReplayTime").textContent=currentRide.duration||"00:00";
  $("grReplayMax").textContent=Math.round(Number(currentRide.max||0));
  $("grReplayAvg").textContent=avgSpeed(currentRide);
  $("grReplayTurns").textContent=Math.round(Number(currentRide.turns||0));
  var lm=$("grReplayLean");if(lm)lm.textContent=Math.max(Number(currentRide.leanMaxLeft||0),Number(currentRide.leanMaxRight||0)).toFixed(1)+"°";
  var fuel=$("grReplayFuel");if(fuel)fuel.textContent=Number(currentRide.fuelLiters||0).toFixed(1)+" L";
  $("grReplayName").textContent=currentRide.destination||"Sürüş Tekrarı";$("grReplayDate").textContent=currentRide.date||"";
  duration=replayDurationMs(currentRide);lastProgress=0;lastCameraTs=0;lastTrailTs=0;lastCameraPoint=null;lastCameraHeading=0;preparePlayback(currentRide);
  buildOverviewMap(currentRide)
 }catch(e){$("grReplayState").textContent="Rota hazırlanamadı";var host=$("grReplayMap");if(host)host.innerHTML='<div style="height:100%;display:grid;place-items:center;padding:24px;text-align:center;color:#ff8a65;font-weight:800">Örnek rota açılamadı: '+String(e&&e.message||e).replace(/[&<>]/g,"")+'</div>';console.warn(e)}
}
function close(){clearMaps();if(modal)modal.classList.remove("active");document.body.style.overflow=""}
function pauseResume(){
 if(!auto&&lastProgress>=.999){lastProgress=0;start=0;lastCameraTs=0;lastTrailTs=0;updateScene(0,performance.now())}
 auto=!auto;$("grReplayPause").innerHTML=auto?'<span class="mi">pause</span> Duraklat':'<span class="mi">play_arrow</span> Devam et';
 if(auto){start=performance.now()-lastProgress*duration;anim=requestAnimationFrame(loop)}else cancelAnimationFrame(anim)
}
function backOverview(){auto=false;lastProgress=0;start=0;cancelAnimationFrame(anim);buildOverviewMap(currentRide)}
async function shareRide(){var t=(currentRide.destination||"GaZonRide Sürüş")+" · "+Number(currentRide.km||0).toFixed(1)+" km · "+(currentRide.duration||"");try{if(navigator.share){await navigator.share({title:"GaZonRide Sürüş",text:t});return}}catch(e){}if(navigator.clipboard)try{await navigator.clipboard.writeText(t)}catch(e){}}
function scan(){
 document.querySelectorAll("#historyList .ride").forEach(function(row,i){if(row.querySelector("[data-gr-replay]"))return;var b=document.createElement("button");b.className="mapBtn";b.setAttribute("data-gr-replay",String(i));b.title="Sürüş Tekrarı";b.innerHTML='<span class="mi">3d_rotation</span>';b.onclick=function(){var r=rides()[Number(b.getAttribute("data-gr-replay"))];if(r)open(r)};row.appendChild(b)});
 document.querySelectorAll("#screen [data-route]").forEach(function(routeBtn){var card=routeBtn.closest(".screenCard");if(!card||card.querySelector("[data-gr-screen-replay]"))return;var i=Number(routeBtn.getAttribute("data-route")),b=document.createElement("button");b.className="screenBtn";b.setAttribute("data-gr-screen-replay",String(i));b.innerHTML='<span class="mi" style="vertical-align:-5px">3d_rotation</span> Sürüş Tekrarı';b.onclick=function(){var r=rides()[Number(b.getAttribute("data-gr-screen-replay"))];if(r)open(r)};routeBtn.insertAdjacentElement("afterend",b)})
}
function install(){
 modal=document.createElement("div");modal.id="grReplay";modal.className="gr-replay";
 modal.innerHTML='<div class="gr-replay-wrap"><div class="gr-replay-head"><div><b>Sürüş Tekrarı</b><small id="grReplayState">Rota hazırlanıyor</small></div><button class="gr-replay-close" id="grReplayClose"><span class="mi">close</span></button></div><div class="gr-replay-stage"><div id="grReplayMap" class="gr-replay-map"></div><button class="gr-play3d" id="grReplayPlay3D"><span class="mi">play_arrow</span> Sürüşü Oynat</button><div class="gr-replay-title"><b id="grReplayName">Sürüş Tekrarı</b><small id="grReplayDate"></small><div class="gr-replay-progress"><i id="grReplayBar"></i></div></div></div><div class="gr-bigstats"><div><b id="grReplayKm">0</b><small>KM</small></div><div><b id="grReplayTime">00:00</b><small>SÜRE</small></div><div><b id="grReplayTurns">0</b><small>VİRAJ</small></div></div><div class="gr-detail-list"><div><span>Ortalama hız</span><b><span id="grReplayAvg">0</span> km/sa</b></div><div><span>Azami hız</span><b><span id="grReplayMax">0</span> km/sa</b></div><div><span>En yüksek yatış</span><b id="grReplayLean">0°</b></div><div><span>Tahmini yakıt</span><b id="grReplayFuel">0.0 L</b></div></div><div class="gr-replay-controls"><button id="grReplayPause" style="display:none"><span class="mi">pause</span> Duraklat</button><button id="grReplayOverview"><span class="mi">map</span> Rota Özeti</button><button class="primary" id="grReplayShare"><span class="mi">share</span> Paylaş</button></div></div>';
 document.body.appendChild(modal);$("grReplayClose").onclick=close;$("grReplayPlay3D").onclick=function(){build3DMap(currentRide)};$("grReplayPause").onclick=pauseResume;$("grReplayOverview").onclick=backOverview;$("grReplayShare").onclick=shareRide;new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});scan()
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install);else install();
window.GaZonReplay={open:open,scan:scan};
})();