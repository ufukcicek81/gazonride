(function(){
"use strict";
var modal,currentRide=null,anim=0,start=0,duration=65000,auto=false,mode="overview",introDelay=900,lastProgress=0,playPoints=[],playCum=[],playTotal=0,lastCameraTs=0,lastTrailTs=0,lastCameraHeading=0,lastCameraPoint=null,playbackSpeed=2,cinematicShots=[],cameraSceneIndex=-1,playSessionId=0,lastBikeTs=0;
var overviewMap=null,overviewRoute=null,startMarker=null,endMarker=null;
var map3d=null,classicMap=null,route3d=null,travel3d=null,bike3d=null,classicRoute=null,classicTravel=null,classicBike=null,using3d=false;

function $(id){return document.getElementById(id)}
function rides(){try{var a=JSON.parse(localStorage.getItem("gazon_rides")||"[]");if(!Array.isArray(a))a=[];if(window.GaZonDemoRide)a=a.concat([window.GaZonDemoRide]);return a}catch(e){return window.GaZonDemoRide?[window.GaZonDemoRide]:[]}}
function pts(ride){return (ride&&ride.track||[]).filter(function(p){return Array.isArray(p)&&p.length>=2&&isFinite(Number(p[0]))&&isFinite(Number(p[1]))}).map(function(p){return {lat:Number(p[0]),lng:Number(p[1]),alt:p[2]==null?0:Number(p[2]),time:p[3]||0}})}
function bearing(a,b){var p=Math.PI/180,y1=a.lat*p,y2=b.lat*p,dl=(b.lng-a.lng)*p;return (Math.atan2(Math.sin(dl)*Math.cos(y2),Math.cos(y1)*Math.sin(y2)-Math.sin(y1)*Math.cos(y2)*Math.cos(dl))*180/Math.PI+360)%360}
function interpolate(a,b,t){return {lat:a.lat+(b.lat-a.lat)*t,lng:a.lng+(b.lng-a.lng)*t,alt:(a.alt||0)+((b.alt||0)-(a.alt||0))*t}}
function geoKm(a,b){var R=6371,p=Math.PI/180,dLat=(b.lat-a.lat)*p,dLon=(b.lng-a.lng)*p,x=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(a.lat*p)*Math.cos(b.lat*p)*Math.sin(dLon/2)*Math.sin(dLon/2);return 2*R*Math.asin(Math.sqrt(x))}
function lerpAngle(a,b,t){var d=((b-a+540)%360)-180;return (a+d*t+360)%360}
function replaySource(ride){return ride&&Array.isArray(ride._matchedReplayPath)&&ride._matchedReplayPath.length>1?ride._matchedReplayPath:cleanTrack(pts(ride))}
function cleanTrack(a){
 if(!Array.isArray(a))return [];
 var out=[];
 for(var i=0;i<a.length;i++){
  var p=a[i];
  if(!p||!isFinite(Number(p.lat))||!isFinite(Number(p.lng))||Math.abs(p.lat)>90||Math.abs(p.lng)>180)continue;
  if(!out.length){out.push(p);continue}
  var last=out[out.length-1],d=geoKm(last,p);
  if(d<.002)continue;
  var dt=last.time&&p.time?Math.max(.5,(Number(p.time)-Number(last.time))/1000):0;
  if(d>.35&&dt>0&&dt<5){
   var next=a[i+1];
   if(next&&isFinite(Number(next.lat))&&isFinite(Number(next.lng))&&geoKm(last,next)<.10)continue;
  }
  out.push(p);
 }
 return out
}
function simplifyForMatch(a,max){
 if(a.length<=max)return a.slice();
 var out=[],step=(a.length-1)/(max-1);
 for(var i=0;i<max;i++)out.push(a[Math.min(a.length-1,Math.round(i*step))]);
 return out
}
function resamplePath(a,spacingM){
 if(!a||a.length<2)return a||[];
 var out=[a[0]],target=Math.max(5,Number(spacingM||8))/1000,carry=0;
 for(var i=1;i<a.length;i++){
  var s=a[i-1],e=a[i],seg=geoKm(s,e);if(seg<=0)continue;
  var used=0;
  while(carry+(seg-used)>=target){
   var need=target-carry,t=(used+need)/seg;
   out.push(interpolate(s,e,Math.max(0,Math.min(1,t))));
   used+=need;carry=0
  }
  carry+=Math.max(0,seg-used)
 }
 var z=a[a.length-1],q=out[out.length-1];
 if(!q||geoKm(q,z)>.002)out.push(z);
 return out
}
function pathLength(a){var n=0;for(var i=1;i<a.length;i++)n+=geoKm(a[i-1],a[i]);return n}
function validMatched(raw,matched){
 if(!matched||matched.length<3)return false;
 var rawLen=Math.max(.05,pathLength(raw)),matLen=pathLength(matched);
 if(matLen<rawLen*.82||matLen>rawLen*1.28)return false;
 if(geoKm(raw[0],matched[0])>.22)return false;
 if(geoKm(raw[raw.length-1],matched[matched.length-1])>.22)return false;
 return true
}
function appendUniquePath(base,extra){
 (extra||[]).forEach(function(p){
  var last=base[base.length-1];
  if(!last||geoKm(last,p)>.002)base.push(p)
 });
 return base
}
async function matchOsrmChunk(chunk){
 var coords=chunk.map(function(p){return p.lng.toFixed(6)+","+p.lat.toFixed(6)}).join(";");
 var radiuses=chunk.map(function(){return "45"}).join(";");
 var url="https://router.project-osrm.org/match/v1/driving/"+coords+"?overview=full&geometries=geojson&tidy=true&gaps=ignore&radiuses="+radiuses;
 var res=await fetch(url,{cache:"no-store"});if(!res.ok)throw new Error("OSRM "+res.status);
 var data=await res.json(),matchings=(data&&data.matchings)||[];
 if(!matchings.length)throw new Error("OSRM match empty");
 var path=[];
 matchings.forEach(function(m){
  var g=m&&m.geometry&&m.geometry.coordinates;if(!Array.isArray(g))return;
  g.forEach(function(q){appendUniquePath(path,[{lat:Number(q[1]),lng:Number(q[0]),alt:0,time:0}])})
 });
 if(path.length<2)throw new Error("OSRM geometry empty");
 return path
}
async function matchViaOsrm(raw){
 var sampled=simplifyForMatch(raw,180),all=[],chunkSize=45,step=44;
 for(var i=0;i<sampled.length-1;i+=step){
  var chunk=sampled.slice(i,Math.min(sampled.length,i+chunkSize));
  if(chunk.length<2)break;
  var part=await matchOsrmChunk(chunk);
  if(!validMatched(chunk,part))throw new Error("Truncated matching segment");
  appendUniquePath(all,part);
 }
 return resamplePath(all,18)
}
async function roadBridge(a,b){
 var coords=[a,b].map(function(p){return p.lng.toFixed(6)+","+p.lat.toFixed(6)}).join(";");
 var url="https://router.project-osrm.org/route/v1/driving/"+coords+"?overview=full&geometries=geojson&steps=false";
 var ctrl=typeof AbortController!=="undefined"?new AbortController():null;
 var timeout=ctrl?setTimeout(function(){ctrl.abort()},4500):null;
 try{
  var response=await fetch(url,{cache:"no-store",signal:ctrl?ctrl.signal:undefined});
  if(!response.ok)throw new Error("Gap route "+response.status);
  var data=await response.json(),r=data.routes&&data.routes[0],coords2=r&&r.geometry&&r.geometry.coordinates;
  if(!Array.isArray(coords2)||coords2.length<2)throw new Error("No gap geometry");
  var path=coords2.map(function(q){return {lat:Number(q[1]),lng:Number(q[0]),alt:0,time:0}});
  var straight=geoKm(a,b),km=pathLength(path);
  if(geoKm(a,path[0])>.12||geoKm(b,path[path.length-1])>.12||km>Math.max(1,straight*3.2))throw new Error("Unsafe gap route");
  return path
 }finally{if(timeout)clearTimeout(timeout)}
}
async function bridgeGpsGaps(raw){
 var out=[raw[0]],bridged=0,unresolved=0;
 for(var i=1;i<raw.length;i++){
  var p=raw[i],prev=raw[i-1],km=geoKm(prev,p);
  if(km>.45){
   if(km<30&&bridged+unresolved<4){
    try{appendUniquePath(out,await roadBridge(prev,p));bridged++;continue}catch(e){console.warn("GPS gap bridge fallback",e)}
   }
   unresolved++
  }
  appendUniquePath(out,[p])
 }
 return {path:out,bridged:bridged,unresolved:unresolved}
}
async function matchRideToRoads(ride){
 var raw=cleanTrack(pts(ride));if(raw.length<2)return raw;
 try{
  var osrmPath=await matchViaOsrm(raw);
  if(validMatched(raw,osrmPath))return osrmPath;
  console.warn("Road match rejected: incomplete route")
 }catch(e){console.warn("OSRM road match fallback",e)}
 // Missing GPS samples must be joined on a real roadway, not by a flight across buildings.
 var repaired=await bridgeGpsGaps(raw);
 ride._replayGapCount=repaired.bridged;
 ride._replayUnresolvedGaps=repaired.unresolved;
 var suggested=pathLength(repaired.path),reported=Number(ride.km||0);
 if(repaired.bridged&&reported>0&&suggested>reported*1.5)console.warn("Reconstructed road exceeds recorded trip; check GPS");
 return resamplePath(repaired.path,18)
}
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
 var km=Math.max(1,playTotal||Number(ride&&ride.km||0));
 return Math.max(22000,Math.min(90000,km*2500));
}
function routeIntegrity(ride){
 var reported=Number(ride&&ride.km||0),actual=pathLength(replaySource(ride));
 return {reportedKm:reported,playableKm:actual,coverage:reported>0?actual/reported:1,missing:reported>2&&actual<reported*.78,pointCount:replaySource(ride).length}
}
function qualityLabel(ride){
 var q=routeIntegrity(ride);
 return q.missing?"GPS izi eksik: "+q.playableKm.toFixed(1)+" / "+q.reportedKm.toFixed(1)+" km · Kaydedilmeyen bölüm oynatılamaz":
 ride._replayUnresolvedGaps?"GPS boşluğu var · "+q.playableKm.toFixed(1)+" km · Yol eşleşmesi kısmen eksik":
 ride._replayGapCount?"Tahmini yol bağlantısı · "+q.playableKm.toFixed(1)+" km · GPS boşluğu tamamlandı":
 "Gerçek rota · "+q.playableKm.toFixed(1)+" km · "+q.pointCount+" nokta";
}
function setDistanceLabel(progress){
 var el=$("grReplayDistance");
 if(el)el.textContent=(Math.max(0,Math.min(1,progress))*playTotal).toFixed(1)+" / "+playTotal.toFixed(1)+" km";
}
function updateSpeedControls(){
 if(!modal)return;
 modal.querySelectorAll("[data-replay-speed]").forEach(function(el){el.classList.toggle("active",Number(el.getAttribute("data-replay-speed"))===playbackSpeed)})
}
function setSpeed(next){
 var now=performance.now(),wasPlaying=auto&&start>0;
 if(wasPlaying)lastProgress=Math.min(1,Math.max(lastProgress,(now-start)/(duration/playbackSpeed)));
 playbackSpeed=next;
 if(wasPlaying)start=now-lastProgress*(duration/playbackSpeed);
 if(mode==="3d"){
  stopCinematicFlight();
  buildCinematicPlan();
 }
 updateSpeedControls()
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
 playSessionId++;stopCinematicFlight();cinematicShots=[];cameraSceneIndex=-1;
 cancelAnimationFrame(anim);anim=0;start=0;auto=false;mode="overview";
 var host=$("grReplayMap");if(host)host.innerHTML="";
 overviewMap=null;overviewRoute=null;startMarker=null;endMarker=null;
 map3d=null;classicMap=null;route3d=null;travel3d=null;bike3d=null;classicRoute=null;classicTravel=null;classicBike=null;using3d=false;
}
function makeDotIcon(color,scale){return {path:google.maps.SymbolPath.CIRCLE,scale:scale||8,fillColor:color,fillOpacity:1,strokeColor:"#fff",strokeWeight:3}}
function buildOverviewMap(ride){
 var a=replaySource(ride),host=$("grReplayMap");if(!host||a.length<2)throw new Error("Rota izi yok");
 host.innerHTML="";
 overviewMap=new google.maps.Map(host,{center:{lat:a[0].lat,lng:a[0].lng},zoom:10,mapTypeId:"roadmap",disableDefaultUI:true,gestureHandling:"greedy",clickableIcons:false});
 overviewRoute=new google.maps.Polyline({map:overviewMap,path:a.map(function(p){return {lat:p.lat,lng:p.lng}}),strokeColor:"#ff5926",strokeWeight:14,strokeOpacity:1});
 startMarker=new google.maps.Marker({map:overviewMap,position:{lat:a[0].lat,lng:a[0].lng},icon:makeDotIcon("#27c46b",8),title:"Başlangıç"});
 var e=a[a.length-1];
 endMarker=new google.maps.Marker({map:overviewMap,position:{lat:e.lat,lng:e.lng},icon:makeDotIcon("#d9272e",9),title:"Varış"});
 var b=new google.maps.LatLngBounds();a.forEach(function(p){b.extend({lat:p.lat,lng:p.lng})});overviewMap.fitBounds(b,48);
 mode="overview";$("grReplayPlay3D").style.display="inline-flex";$("grReplayPause").style.display="none";$("grReplayState").textContent=qualityLabel(ride);setDistanceLabel(0);
}
async function buildClassicFollowMap(ride){
 var a=replaySource(ride),host=$("grReplayMap");if(!host||a.length<2)throw new Error("Rota izi yok");
 host.innerHTML="";
 using3d=false;map3d=null;route3d=null;travel3d=null;bike3d=null;
 classicMap=new google.maps.Map(host,{
  center:{lat:a[0].lat,lng:a[0].lng},zoom:14.2,mapTypeId:"hybrid",
  disableDefaultUI:true,gestureHandling:"greedy",clickableIcons:false,
  streetViewControl:false,fullscreenControl:false,mapTypeControl:false
 });
 classicRoute=new google.maps.Polyline({map:classicMap,path:a.map(function(p){return {lat:p.lat,lng:p.lng}}),strokeColor:"#20e0d0",strokeWeight:16,strokeOpacity:1});
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


function stopCinematicFlight(){
 if(map3d&&typeof map3d.stopCameraAnimation==="function"){
  try{map3d.stopCameraAnimation()}catch(e){console.warn("Camera stop",e)}
 }
}
function buildCinematicPlan(){
 // Camera positions come from the COMPLETE route, never from noisy frame-by-frame GPS.
 var realMs=duration/Math.max(.5,playbackSpeed),count=Math.max(3,Math.min(8,Math.floor(realMs/3300)));
 var moveMs=Math.max(1400,Math.min(6200,(realMs*.80/Math.max(1,count-1))*.80));
 var offsets=[-18,22,-24,16,-12,24,-17,12],tilts=[49,53,48,51,50,54,49,52];
 var width=Math.max(3300,Math.min(14500,2200+(playTotal/Math.max(1,count))*1100));
 cinematicShots=[];cameraSceneIndex=-1;
 if(playPoints.length<2)return;
 for(var i=0;i<count;i++){
  var trigger=.075+i*(.80/Math.max(1,count-1)),focus=Math.min(.985,trigger+.45/count);
  var mid=pointAtDistance(focus),prev=pointAtDistance(Math.max(0,focus-.065)),next=pointAtDistance(Math.min(1,focus+.065));
  if(!mid||!prev||!next)continue;
  var dir=geoKm(prev.point,next.point)>.02?bearing(prev.point,next.point):lastCameraHeading;
  var heading=(dir+offsets[i%offsets.length]+360)%360;
  cinematicShots.push({
   at:trigger,durationMillis:moveMs,
   camera:{center:{lat:mid.point.lat,lng:mid.point.lng,altitude:120},range:width*(i%3===1?1.08:1),tilt:tilts[i%tilts.length],heading:heading}
  })
 }
}
function updateCinematicCamera(progress){
 if(!cinematicShots.length)return;
 var nextIndex=-1;
 for(var i=0;i<cinematicShots.length;i++)if(progress>=cinematicShots[i].at)nextIndex=i;
 if(nextIndex<0||nextIndex===cameraSceneIndex)return;
 cameraSceneIndex=nextIndex;
 var shot=cinematicShots[nextIndex],view=shot.camera;
 if(using3d&&map3d){
  try{
   map3d.flyCameraTo({endCamera:view,durationMillis:shot.durationMillis})
  }catch(e){
   console.warn("Cinematic shot fallback",e);
   try{map3d.center=view.center;map3d.range=view.range;map3d.tilt=view.tilt;map3d.heading=view.heading}catch(ignore){}
  }
 }else if(classicMap){
  // Compatible 2D map also uses a handful of planned views, not GPS-follow.
  try{
   var center={lat:view.center.lat,lng:view.center.lng};
   classicMap.panTo(center);
   classicMap.setZoom(Math.max(11,Math.min(14.2,15.0-Math.log2(view.range/1800))));
   classicMap.setTilt(35);
   classicMap.setHeading(view.heading)
  }catch(e){console.warn("Classic cinematic view",e)}
 }
}
function startReplayPlayback(ride,label){
 mode="3d";$("grReplayPlay3D").style.display="none";$("grReplayPause").style.display="inline-flex";
 $("grReplayState").textContent=label||"Sinematik sürüş hazırlanıyor";
 auto=false;start=0;lastProgress=0;lastTrailTs=0;lastBikeTs=0;
 preparePlayback(ride);buildCinematicPlan();cancelAnimationFrame(anim);
 var thisSession=++playSessionId;
 setTimeout(function(){
  if(mode!=="3d"||thisSession!==playSessionId)return;
  auto=true;start=0;
  $("grReplayState").textContent=using3d?"Cinematic Replay v6 · drone kamera · "+qualityLabel(ride):"Sinematik rota · "+qualityLabel(ride);
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
   range:info.range,tilt:47,heading:head,mode:"HYBRID",
   defaultUIHidden:true,gestureHandling:"COOPERATIVE"
  });
  map3d.style.width="100%";map3d.style.height="100%";map3d.style.display="block";
  host.appendChild(map3d);

  route3d=new Polyline3DElement({
   path:simplifyForMatch(a,900).map(function(p){return {lat:p.lat,lng:p.lng,altitude:2}}),
   altitudeMode:"RELATIVE_TO_GROUND",strokeColor:"#21F2DE",strokeWidth:22,
   outerColor:"#07191A",outerWidth:.30,drawsOccludedSegments:true,geodesic:true,zIndex:8
  });
  map3d.append(route3d);

  travel3d=new Polyline3DElement({
   path:[{lat:first.lat,lng:first.lng,altitude:2}],
   altitudeMode:"RELATIVE_TO_GROUND",strokeColor:"#FFFFFF",strokeWidth:10,
   outerColor:"#20E0D0",outerWidth:.28,drawsOccludedSegments:true,zIndex:12
  });
  map3d.append(travel3d);

  if(Marker3DElement){
   bike3d=new Marker3DElement({
    position:{lat:first.lat,lng:first.lng,altitude:2},
    altitudeMode:"RELATIVE_TO_GROUND",label:"🏍",sizePreserved:true,drawsWhenOccluded:true,zIndex:30
   });
   map3d.append(bike3d);
  }

  using3d=true;lastCameraHeading=head;lastCameraPoint={lat:first.lat,lng:first.lng};
  $("grReplayState").textContent="Google Earth görünümü hazırlanıyor…";
  try{
   map3d.flyCameraTo({
    endCamera:{center:{lat:first.lat,lng:first.lng,altitude:140},range:4500,tilt:47,heading:head},
    durationMillis:2100
   });
  }catch(e){
   map3d.center={lat:first.lat,lng:first.lng,altitude:140};map3d.range=4500;map3d.tilt=47;map3d.heading=head;
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
  if(bike3d&&(now-lastBikeTs>75||progress>=1)){
   try{bike3d.position={lat:p.lat,lng:p.lng,altitude:2}}catch(e){}
   lastBikeTs=now
  }
  // The thick full route stays static. Update only the travelled highlight at a modest rate.
  if(travel3d&&(now-lastTrailTs>480||progress>=1)){
   try{
    var traveled=simplifyForMatch(playPoints.slice(0,x.i+1).concat([p]),520);
    travel3d.path=traveled.map(function(q){return {lat:q.lat,lng:q.lng,altitude:3}})
   }catch(e){console.warn("Travel trace update",e)}
   lastTrailTs=now
  }
 }else if(classicMap){
  if(classicBike)classicBike.setPosition(pos);
  if(classicTravel&&(now-lastTrailTs>480||progress>=1)){
   var tail=simplifyForMatch(playPoints.slice(0,x.i+1).concat([p]),520);
   classicTravel.setPath(tail.map(function(q){return {lat:q.lat,lng:q.lng}}));
   lastTrailTs=now
  }
 }
 // Crucial: no map.center/heading/range assignments on every animation frame.
 updateCinematicCamera(progress);
 var bar=$("grReplayBar");if(bar)bar.style.width=Math.round(progress*100)+"%";
 setDistanceLabel(progress)
}
function loop(ts){
 if(!auto)return;
 if(!start)start=ts;
 var p=Math.min(1,(ts-start)/(duration/playbackSpeed));
 if(p<lastProgress)p=lastProgress;
 lastProgress=p;updateScene(p,ts);
 if(p>=1){
  auto=false;
  if(using3d&&map3d){
   try{
    var full=routeBoundsInfo(playPoints),finalHeading=cinematicShots.length?cinematicShots[cinematicShots.length-1].camera.heading:0;
    map3d.flyCameraTo({
     endCamera:{center:full.center,range:Math.max(4600,full.range),tilt:43,heading:finalHeading},
     durationMillis:2600
    })
   }catch(e){console.warn("Final aerial pullback",e)}
  }
  $("grReplayState").textContent=routeIntegrity(currentRide).missing?"Kaydedilen GPS bölümü tamamlandı":"Sürüş tamamlandı · Tam rota";
  $("grReplayPause").innerHTML='<span class="mi">replay</span> Tekrar oynat';return
 }
 anim=requestAnimationFrame(loop)
}
async function open(ride){
 currentRide=ride;playbackSpeed=2;if(!modal)install();modal.classList.add("active");updateSpeedControls();document.body.style.overflow="hidden";clearMaps();$("grReplayState").textContent="Gerçek yol rotası hazırlanıyor…";var host=$("grReplayMap");if(host)host.innerHTML='<div style="height:100%;display:grid;place-items:center;padding:24px;text-align:center;color:#c7ced8;font-weight:800">Google yol rotası hazırlanıyor…</div>';
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
  preparePlayback(currentRide);duration=replayDurationMs(currentRide);lastProgress=0;lastCameraTs=0;lastTrailTs=0;lastCameraPoint=null;lastCameraHeading=0;
  buildOverviewMap(currentRide)
 }catch(e){$("grReplayState").textContent="Rota hazırlanamadı";var host=$("grReplayMap");if(host)host.innerHTML='<div style="height:100%;display:grid;place-items:center;padding:24px;text-align:center;color:#ff8a65;font-weight:800">Örnek rota açılamadı: '+String(e&&e.message||e).replace(/[&<>]/g,"")+'</div>';console.warn(e)}
}
function close(){clearMaps();if(modal)modal.classList.remove("active");document.body.style.overflow=""}
function pauseResume(){
 var restarting=!auto&&lastProgress>=.999;
 if(restarting){
  stopCinematicFlight();
  lastProgress=0;start=0;lastTrailTs=0;lastBikeTs=0;
  buildCinematicPlan();updateScene(0,performance.now());
  if(using3d&&map3d&&playPoints.length){
   var first=playPoints[0],head=bearing(first,playPoints[Math.min(12,playPoints.length-1)]);
   try{map3d.flyCameraTo({endCamera:{center:{lat:first.lat,lng:first.lng,altitude:140},range:4500,tilt:47,heading:head},durationMillis:1300})}catch(e){}
  }
 }
 auto=!auto;
 $("grReplayPause").innerHTML=auto?'<span class="mi">pause</span> Duraklat':'<span class="mi">play_arrow</span> Devam et';
 if(auto){
  if(!restarting){cameraSceneIndex=-1;stopCinematicFlight()}
  start=performance.now()-lastProgress*(duration/playbackSpeed);
  anim=requestAnimationFrame(loop)
 }else{
  cancelAnimationFrame(anim);stopCinematicFlight();cameraSceneIndex=-1
 }
}
function backOverview(){
 playSessionId++;auto=false;lastProgress=0;start=0;cancelAnimationFrame(anim);
 stopCinematicFlight();cinematicShots=[];cameraSceneIndex=-1;buildOverviewMap(currentRide)
}
async function shareRide(){var t=(currentRide.destination||"GaZonRide Sürüş")+" · "+Number(currentRide.km||0).toFixed(1)+" km · "+(currentRide.duration||"");try{if(navigator.share){await navigator.share({title:"GaZonRide Sürüş",text:t});return}}catch(e){}if(navigator.clipboard)try{await navigator.clipboard.writeText(t)}catch(e){}}
function scan(){
 document.querySelectorAll("#historyList .ride").forEach(function(row,i){if(row.querySelector("[data-gr-replay]"))return;var b=document.createElement("button");b.className="mapBtn";b.setAttribute("data-gr-replay",String(i));b.title="Sürüş Tekrarı";b.innerHTML='<span class="mi">3d_rotation</span>';b.onclick=function(){var r=rides()[Number(b.getAttribute("data-gr-replay"))];if(r)open(r)};row.appendChild(b)});
 document.querySelectorAll("#screen [data-route]").forEach(function(routeBtn){var card=routeBtn.closest(".screenCard");if(!card||card.querySelector("[data-gr-screen-replay]"))return;var i=Number(routeBtn.getAttribute("data-route")),b=document.createElement("button");b.className="screenBtn";b.setAttribute("data-gr-screen-replay",String(i));b.innerHTML='<span class="mi" style="vertical-align:-5px">3d_rotation</span> Sürüş Tekrarı';b.onclick=function(){var r=rides()[Number(b.getAttribute("data-gr-screen-replay"))];if(r)open(r)};routeBtn.insertAdjacentElement("afterend",b)})
}
function install(){
 modal=document.createElement("div");modal.id="grReplay";modal.className="gr-replay";
 modal.innerHTML='<div class="gr-replay-wrap"><div class="gr-replay-head"><div><b>Sürüş Tekrarı</b><small id="grReplayState">Rota hazırlanıyor</small></div><button class="gr-replay-close" id="grReplayClose"><span class="mi">close</span></button></div><div class="gr-replay-stage"><div id="grReplayMap" class="gr-replay-map"></div><button class="gr-play3d" id="grReplayPlay3D"><span class="mi">play_arrow</span> Sürüşü Oynat</button><div class="gr-replay-title"><b id="grReplayName">Sürüş Tekrarı</b><small id="grReplayDate"></small><small id="grReplayDistance" class="gr-replay-distance">0 / 0 km</small><div class="gr-replay-progress"><i id="grReplayBar"></i></div></div></div><div class="gr-replay-speed"><span>Oynatma hızı</span><button data-replay-speed="1">1×</button><button data-replay-speed="2" class="active">2×</button><button data-replay-speed="4">4×</button></div><div class="gr-bigstats"><div><b id="grReplayKm">0</b><small>KM</small></div><div><b id="grReplayTime">00:00</b><small>SÜRE</small></div><div><b id="grReplayTurns">0</b><small>VİRAJ</small></div></div><div class="gr-detail-list"><div><span>Ortalama hız</span><b><span id="grReplayAvg">0</span> km/sa</b></div><div><span>Azami hız</span><b><span id="grReplayMax">0</span> km/sa</b></div><div><span>En yüksek yatış</span><b id="grReplayLean">0°</b></div><div><span>Tahmini yakıt</span><b id="grReplayFuel">0.0 L</b></div></div><div class="gr-replay-controls"><button id="grReplayPause" style="display:none"><span class="mi">pause</span> Duraklat</button><button id="grReplayOverview"><span class="mi">map</span> Rota Özeti</button><button class="primary" id="grReplayShare"><span class="mi">share</span> Paylaş</button></div></div>';
 document.body.appendChild(modal);$("grReplayClose").onclick=close;$("grReplayPlay3D").onclick=function(){build3DMap(currentRide)};$("grReplayPause").onclick=pauseResume;$("grReplayOverview").onclick=backOverview;$("grReplayShare").onclick=shareRide;modal.querySelectorAll("[data-replay-speed]").forEach(function(b){b.onclick=function(){setSpeed(Number(b.getAttribute("data-replay-speed")))}});new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});scan()
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install);else install();
window.GaZonReplay={open:open,scan:scan,diagnostics:function(ride){return routeIntegrity(ride||currentRide)},cameraDiagnostics:function(){return {shotCount:cinematicShots.length,sceneIndex:cameraSceneIndex,mode:using3d?"3d":"classic",shots:cinematicShots.map(function(s){return {at:s.at,heading:s.camera.heading,center:s.camera.center,range:s.camera.range}})}}};
})();