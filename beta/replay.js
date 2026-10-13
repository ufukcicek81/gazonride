(function(){
"use strict";
var modal,currentRide=null,anim=0,start=0,duration=65000,auto=false,mode="overview",introDelay=900,lastProgress=0,playPoints=[],playCum=[],playTotal=0,lastCameraTs=0,lastTrailTs=0,lastCameraHeading=0,lastCameraPoint=null,playbackSpeed=2,orbitRail=[],orbitStartHeading=0,orbitTotalDegrees=245,orbitLastFrame=0,orbitFrames=0,orbitLatest=null,playSessionId=0,lastBikeTs=0;
var overviewMap=null,overviewRoute=null,startMarker=null,endMarker=null;
var puck3d=null,map3d=null,classicMap=null,route3d=null,travel3d=null,bike3d=null,classicRoute=null,classicTravel=null,classicBike=null,using3d=false;

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
  if(validMatched(raw,osrmPath)){
   // Road matching can trim the first/last metres; keep the real start and end.
   if(geoKm(raw[0],osrmPath[0])>.02)osrmPath.unshift(raw[0]);
   var rl=raw[raw.length-1];if(geoKm(rl,osrmPath[osrmPath.length-1])>.02)osrmPath.push(rl);
   ride._roadMatched=true;
   return osrmPath;
  }
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
// Raw GPS (road matching failed) zigzags at junctions and red lights:
// drop points closer than 6 m and apply a 5-point moving average.
function smoothRaw(a){
 var k=[];a.forEach(function(p){if(!k.length||geoKm(k[k.length-1],p)>=.006)k.push(p)});
 if(k.length<5)return k;
 return k.map(function(p,i){
  if(i<2||i>k.length-3)return p;
  var la=0,lo=0,al=0;for(var j=i-2;j<=i+2;j++){la+=k[j].lat;lo+=k[j].lng;al+=Number(k[j].alt)||0}
  return {lat:la/5,lng:lo/5,alt:al/5,time:p.time};
 });
}
function preparePlayback(ride){
 playPoints=replaySource(ride);if(!(ride&&ride._roadMatched))playPoints=smoothRaw(playPoints);playCum=[0];playTotal=0;
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
// Moving time and speeds from the GPS timestamps (stops and gaps excluded).
function trackStats(ride){
 var a=cleanTrack(pts(ride)).filter(function(p){return Number(p.time)>0}),sec=0,km=0;
 for(var i=1;i<a.length;i++){
  var dt=(Number(a[i].time)-Number(a[i-1].time))/1000,d=geoKm(a[i-1],a[i]);
  if(dt>0&&dt<=60&&d/(dt/3600)>=4&&d/(dt/3600)<220){sec+=dt;km+=d}
 }
 return sec>60?{sec:sec,avg:km/(sec/3600)}:null;
}
function avgSpeed(ride){var sec=parseDuration(ride.duration);return sec>0?Math.round(Number(ride.km||0)/(sec/3600)):0}
function replayDurationMs(ride){
 // ~6 s per km at 1x: fast enough to feel like a flight, slow enough for
 // the 3D tiles to load sharp and the eye to follow the road.
 var km=Math.max(1,playTotal||Number(ride&&ride.km||0));
 return Math.max(40000,Math.min(300000,km*6000));
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
 playSessionId++;stopCinematicFlight();orbitRail=[];orbitLatest=null;orbitLastFrame=0;orbitFrames=0;
 cancelAnimationFrame(anim);anim=0;start=0;auto=false;mode="overview";
 var host=$("grReplayMap");if(host)host.innerHTML="";
 overviewMap=null;overviewRoute=null;startMarker=null;endMarker=null;
 puck3d=null;map3d=null;classicMap=null;route3d=null;travel3d=null;bike3d=null;classicRoute=null;classicTravel=null;classicBike=null;using3d=false;
}
function makeDotIcon(color,scale){return {path:google.maps.SymbolPath.CIRCLE,scale:scale||8,fillColor:color,fillOpacity:1,strokeColor:"#fff",strokeWeight:2.5}}
// Rider puck: white ring, red core, white centre (no emoji, no default pin).
var RIDER_SVG='<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 44 44"><circle cx="22" cy="22" r="20" fill="#E8322E" fill-opacity=".28"/><circle cx="22" cy="22" r="13" fill="#E8322E" stroke="#fff" stroke-width="4"/><circle cx="22" cy="22" r="4.5" fill="#fff"/></svg>';
function riderIconUrl(){return "data:image/svg+xml;charset=UTF-8,"+encodeURIComponent(RIDER_SVG)}
function riderTemplate(){
 var t=document.createElement("template");
 t.content.append(new DOMParser().parseFromString(RIDER_SVG,"image/svg+xml").documentElement);
 return t;
}
function buildOverviewMap(ride){
 var a=replaySource(ride),host=$("grReplayMap");if(!host||a.length<2)throw new Error("Rota izi yok");
 host.innerHTML="";
 overviewMap=new google.maps.Map(host,{center:{lat:a[0].lat,lng:a[0].lng},zoom:10,mapTypeId:"roadmap",disableDefaultUI:true,gestureHandling:"greedy",clickableIcons:false});
 var path=a.map(function(p){return {lat:p.lat,lng:p.lng}});
 // Same look as the ride cards: thin red line on a soft white halo.
 new google.maps.Polyline({map:overviewMap,path:path,strokeColor:"#FFFFFF",strokeWeight:7,strokeOpacity:.85,zIndex:1,clickable:false});
 overviewRoute=new google.maps.Polyline({map:overviewMap,path:path,strokeColor:"#E5322D",strokeWeight:4,strokeOpacity:1,zIndex:2,clickable:false});
 startMarker=new google.maps.Marker({map:overviewMap,position:{lat:a[0].lat,lng:a[0].lng},icon:makeDotIcon("#22C55E",6),title:"Başlangıç",zIndex:3});
 var e=a[a.length-1];
 endMarker=new google.maps.Marker({map:overviewMap,position:{lat:e.lat,lng:e.lng},icon:makeDotIcon("#DC2626",6),title:"Varış",zIndex:3});
 var b=new google.maps.LatLngBounds();a.forEach(function(p){b.extend({lat:p.lat,lng:p.lng})});overviewMap.fitBounds(b,48);
 mode="overview";$("grReplayPlay3D").style.display="inline-flex";modal.classList.remove("gr-replay-live");$("grReplayPause").style.display="none";$("grReplayState").textContent=qualityLabel(ride);setDistanceLabel(0);
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
 classicBike=new google.maps.Marker({map:classicMap,position:{lat:a[0].lat,lng:a[0].lng},icon:{url:riderIconUrl(),scaledSize:new google.maps.Size(28,28),anchor:new google.maps.Point(14,14)},zIndex:50});
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

function routePoint(progress){
 var at=pointAtDistance(Math.max(0,Math.min(1,progress)));
 return at&&at.point
}
/* ---------- Chase camera ("Takip") ----------
 * Camera sits behind and above the rider and looks along the road ahead,
 * like a drone following the bike. Heading = direction to a point ~350 m
 * ahead (so it pre-rotates into bends instead of snapping), smoothed with a
 * time-based exponential filter; range opens up on twisty sections. Center
 * altitude is above ground (Map3DElement), so terrain needs no elevation API. */
var camMode=(function(){try{return localStorage.getItem("gazon_replay_cam")||"chase"}catch(e){return "chase"}})();
var chase={heading:null,range:null,ts:0,center:null},speedProfile=[],lastHudTs=0;
function pointAtKm(km){var x=pointAtDistance(Math.max(0,Math.min(playTotal,km))/Math.max(.000001,playTotal));return x&&x.point}
function offsetPoint(a,brg,km){
 var R=6371,p=Math.PI/180,d=km/R,b=brg*p,la=a.lat*p,lo=a.lng*p;
 var la2=Math.asin(Math.sin(la)*Math.cos(d)+Math.cos(la)*Math.sin(d)*Math.cos(b));
 var lo2=lo+Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(la),Math.cos(d)-Math.sin(la)*Math.sin(la2));
 return {lat:la2/p,lng:lo2/p};
}
function angleGap(a,b){return Math.abs(((b-a+540)%360)-180)}
function chaseTarget(progress){
 var d=progress*playTotal,cur=pointAtKm(d),ahead=pointAtKm(d+.35),near=pointAtKm(d+.12),far=pointAtKm(d+.6);
 if(!cur||!ahead)return null;
 var heading=geoKm(cur,ahead)>.01?bearing(cur,ahead):(chase.heading||0);
 // Twistiness of the next ~600 m opens the frame so bends stay in view.
 var bend=near&&far?angleGap(bearing(cur,near),bearing(near,far)):0;
 return {rider:cur,heading:heading,range:520+Math.min(600,bend*8),tilt:68};
}
function updateChaseCamera(progress,now,force){
 var t=chaseTarget(progress);if(!t)return;
 var dt=chase.ts?Math.min(.1,(now-chase.ts)/1000):1;chase.ts=now;
 var kH=1-Math.exp(-dt/1.1),kR=1-Math.exp(-dt/2.2);
 chase.heading=chase.heading==null?t.heading:lerpAngle(chase.heading,t.heading,kH);
 chase.range=chase.range==null?t.range:chase.range+(t.range-chase.range)*kR;
 // Look at a point just ahead of the rider along the camera heading: the
 // rider stays fixed in the lower middle of the frame, the road opens ahead.
 // Locked on the rider: the dot stays in the middle of the frame.
 chase.center={lat:t.rider.lat,lng:t.rider.lng};
 orbitLatest={center:chase.center,heading:chase.heading,tilt:t.tilt,range:chase.range};orbitFrames++;
 if(using3d&&map3d){
  try{map3d.center={lat:chase.center.lat,lng:chase.center.lng,altitude:groundAt(progress)};map3d.heading=chase.heading;map3d.tilt=t.tilt;map3d.range=chase.range}catch(e){}
 }else if(classicMap){
  try{classicMap.moveCamera({center:chase.center,zoom:16.4,heading:chase.heading,tilt:60})}catch(e){}
 }
}
// Recorded speed by distance (needs timestamps), smoothed over ~300 m.
function buildSpeedProfile(ride){
 speedProfile=[];
 var a=cleanTrack(pts(ride)).filter(function(p){return Number(p.time)>0});if(a.length<3)return;
 var cum=0,raw=[];
 for(var i=1;i<a.length;i++){
  var d=geoKm(a[i-1],a[i]),dt=(Number(a[i].time)-Number(a[i-1].time))/3600000;cum+=d;
  if(dt>0&&d/dt<220)raw.push({km:cum,v:d/dt});
 }
 if(!raw.length||cum<=0)return;
 raw.forEach(function(r,i){
  var sum=0,n=0;for(var j=i;j>=0&&r.km-raw[j].km<.15;j--){sum+=raw[j].v;n++}
  for(j=i+1;j<raw.length&&raw[j].km-r.km<.15;j++){sum+=raw[j].v;n++}
  speedProfile.push({f:r.km/cum,v:sum/n});
 });
}
function speedAt(progress){
 var sp=speedProfile;if(!sp.length)return null;
 var lo=0,hi=sp.length-1;while(lo<hi){var m=(lo+hi)>>1;if(sp[m].f<progress)lo=m+1;else hi=m}
 return sp[lo].v;
}
/* Ground elevation for the camera target. Map3DElement treats the centre
 * altitude as absolute, so "0" aimed ~180 m below the road in Düzce and the
 * rider showed up near the top of the screen. Profile from the recorded GPS
 * altitudes by distance, smoothed; median as fallback. */
var elevProfile=[],elevMedian=0;
function buildElevProfile(ride){
 elevProfile=[];elevMedian=0;
 var a=cleanTrack(pts(ride)).filter(function(p){return Number(p.alt)>-100&&Number(p.alt)!==0});
 if(a.length<2)return;
 var alts=a.map(function(p){return Number(p.alt)}).sort(function(x,y){return x-y});elevMedian=alts[Math.floor(alts.length/2)];
 var cum=[0];for(var i=1;i<a.length;i++)cum.push(cum[i-1]+geoKm(a[i-1],a[i]));
 var tot=cum[cum.length-1]||1;
 // ±200 m sliding mean (two pointers, linear time).
 var lo=0,hi=0,sum=0;
 for(var k=0;k<a.length;k++){
  while(hi<a.length&&cum[hi]-cum[k]<=.2){sum+=Number(a[hi].alt);hi++}
  while(cum[k]-cum[lo]>.2){sum-=Number(a[lo].alt);lo++}
  elevProfile.push({f:cum[k]/tot,h:sum/(hi-lo)});
 }
}
function groundAt(progress){
 var e=elevProfile;if(!e.length)return elevMedian||0;
 var p=Math.max(0,Math.min(1,progress)),lo=0,hi=e.length-1;
 while(lo<hi){var m=(lo+hi)>>1;if(e[m].f<p)lo=m+1;else hi=m}
 if(lo===0)return e[0].h;var a=e[lo-1],b=e[lo],t=(p-a.f)/Math.max(1e-9,b.f-a.f);
 return a.h+(b.h-a.h)*t;
}
function altitudeAt(progress){
 var x=pointAtDistance(progress);return x&&x.point&&Number(x.point.alt)>0?x.point.alt:null;
}
function updateHud(progress,now,force){
 if(!force&&now-lastHudTs<120)return;lastHudTs=now;
 var km=$("grHudKm"),sp=$("grHudSpeed"),al=$("grHudAlt"),cp=$("grHudCompass");
 if(km)km.textContent=Math.floor(progress*playTotal);
 if(sp){var v=speedAt(progress);sp.textContent=v==null?"—":Math.round(v)}
 if(al){var h=altitudeAt(progress);al.textContent=h==null?"—":Math.round(h)}
 if(cp&&chase.heading!=null)cp.style.transform="rotate("+(-(camMode==="chase"?chase.heading:(orbitLatest&&orbitLatest.heading||0)))+"deg)";
}

function buildOrbitRail(){
 // A continuous camera axis is derived from the entire measured route.
 // Smooth GPS noise spatially once, before playback; never chase each recorded sample.
 orbitRail=[];orbitLatest=null;orbitLastFrame=0;orbitFrames=0;
 if(playPoints.length<2||playTotal<=0)return;
 orbitStartHeading=bearing(playPoints[0],playPoints[Math.min(playPoints.length-1,4)]);
 var count=Math.min(750,Math.max(42,Math.ceil(playTotal/.075)));
 var radiusKm=Math.min(.22,Math.max(.055,playTotal*.012));
 var weights=[1,3,5,3,1],stepKm=radiusKm*.5;
 for(var i=0;i<=count;i++){
  var progress=i/count,lat=0,lng=0,sum=0;
  if(i===0||i===count){
   var edge=routePoint(progress);
   orbitRail.push({lat:edge.lat,lng:edge.lng});
   continue
  }
  for(var k=-2;k<=2;k++){
   var targetKm=Math.max(0,Math.min(playTotal,progress*playTotal+k*stepKm));
   var p=routePoint(targetKm/playTotal),w=weights[k+2];
   lat+=p.lat*w;lng+=p.lng*w;sum+=w
  }
  orbitRail.push({lat:lat/sum,lng:lng/sum})
 }
}
function orbitRailAt(progress){
 var rail=orbitRail,p=Math.max(0,Math.min(1,progress));
 if(!rail.length)return routePoint(p);
 if(rail.length===1||p===0)return rail[0];
 if(p===1)return rail[rail.length-1];
 var at=p*(rail.length-1),i=Math.floor(at),t=at-i;
 var a=rail[Math.max(0,i-1)],b=rail[i],c=rail[Math.min(rail.length-1,i+1)],d=rail[Math.min(rail.length-1,i+2)];
 function spline(a,b,c,d,t){
  return .5*(2*b+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t)
 }
 return {lat:spline(a.lat,b.lat,c.lat,d.lat,t),lng:spline(a.lng,b.lng,c.lng,d.lng,t)}
}
function orbitCameraPose(progress){
 // The route is the rotation axis, NOT the rear of the motorcycle.
 // One unbroken orbit and a continuously sliding route-centered aerial focus.
 var p=Math.max(0,Math.min(1,progress)),focus=orbitRailAt(p);
 var orbitalEase=p*p*(3-2*p),arc=Math.sin(Math.PI*p);
 return {
  // Closer drone: ~1.5 km instead of 4.5 km, aimed at the ground (altitude
  // 0) so the route sits in the middle of the frame.
  center:{lat:focus.lat,lng:focus.lng,altitude:groundAt(p)},
  heading:(orbitStartHeading+orbitTotalDegrees*orbitalEase)%360,
  tilt:55+5*arc*arc,
  range:1500-350*arc*arc
 }
}
function updateOrbitCamera(progress,ts,force){
 var now=Number(ts||performance.now());
 if(!force&&now-orbitLastFrame<32&&progress<1)return;
 var view=orbitCameraPose(progress);if(!view)return;
 orbitLastFrame=now;orbitFrames++;orbitLatest=view;
 if(using3d&&map3d){
  // Assign interpolated pose at display cadence; NO flyCameraTo scene restart.
  try{
   map3d.center=view.center;
   map3d.heading=view.heading;
   map3d.tilt=view.tilt;
   map3d.range=view.range
  }catch(e){console.warn("Smooth orbit camera",e)}
 }else if(classicMap){
  try{
   var center={lat:view.center.lat,lng:view.center.lng};
   var zoom=Math.max(11,Math.min(14.6,15-Math.log2(view.range/1800)));
   if(typeof classicMap.moveCamera==="function")classicMap.moveCamera({center:center,zoom:zoom,heading:view.heading,tilt:35});
   else classicMap.setCenter(center)
  }catch(e){console.warn("2D orbit camera",e)}
 }
}
function startReplayPlayback(ride,label){
 mode="3d";$("grReplayPlay3D").style.display="none";modal.classList.add("gr-replay-live");$("grReplayPause").style.display="inline-flex";
 $("grReplayState").textContent=label||"Sinematik drone uçuşu hazırlanıyor";
 auto=false;start=0;lastProgress=0;lastTrailTs=0;lastBikeTs=0;
 preparePlayback(ride);buildOrbitRail();buildSpeedProfile(ride);chase={heading:null,range:null,ts:0,center:null};lastHudTs=0;cancelAnimationFrame(anim);
 var thisSession=++playSessionId;
 function go(){
  if(mode!=="3d"||thisSession!==playSessionId)return;
  auto=true;start=0;
  $("grReplayState").textContent=(camMode==="chase"?"Takip kamerası · ":"Drone yörüngesi · ")+qualityLabel(ride);
  anim=requestAnimationFrame(loop)
 }
 if(!using3d){setTimeout(go,introDelay);return}
 // Start only when the 3D tiles at the start point are sharp: wait for the
 // intro flight, then for the map to report a steady (fully loaded) view.
 setTimeout(function(){
  if(mode!=="3d"||thisSession!==playSessionId)return;
  $("grReplayState").textContent="3D harita netleşiyor…";
  waitForSteady(9000).then(function(){setTimeout(go,350)});
 },2300);
}
// gmp-steadychange(isSteady) is tracked from map creation; resolves once the
// view has been steady for a moment, or after maxMs as a safety net.
var map3dSteady=false,map3dSteadyAt=0;
function trackSteady(el){
 map3dSteady=false;map3dSteadyAt=0;
 try{el.addEventListener("gmp-steadychange",function(e){map3dSteady=!!(e&&e.isSteady);map3dSteadyAt=map3dSteady?performance.now():0})}catch(e){}
}
function waitForSteady(maxMs){
 var t0=performance.now();
 return new Promise(function(resolve){
  (function check(){
   var now=performance.now();
   if(map3dSteady&&now-map3dSteadyAt>=250)return resolve(true);
   if(now-t0>=maxMs)return resolve(false);
   setTimeout(check,120);
  })();
 });
}
async function build3DMap(ride){
 var a=replaySource(ride),host=$("grReplayMap");if(!host||a.length<2)throw new Error("Rota izi yok");
 host.innerHTML="";await waitForGoogle();
 classicMap=null;classicRoute=null;classicTravel=null;classicBike=null;
 try{
  var lib=await google.maps.importLibrary("maps3d");
  var Map3DElement=lib.Map3DElement,Polyline3DElement=lib.Polyline3DElement,Marker3DElement=lib.Marker3DElement,Polygon3DElement=lib.Polygon3DElement;
  if(!Map3DElement||!Polyline3DElement)throw new Error("3D Maps desteklenmiyor");
  buildElevProfile(ride);
  var info=routeBoundsInfo(a),first=a[0],head=bearing(a[0],a[Math.min(4,a.length-1)]);
  map3d=new Map3DElement({
   center:{lat:info.center.lat,lng:info.center.lng,altitude:elevMedian},
   range:info.range,tilt:47,heading:head,mode:"HYBRID",
   defaultUIHidden:true,gestureHandling:"COOPERATIVE"
  });
  map3d.style.width="100%";map3d.style.height="100%";map3d.style.display="block";trackSteady(map3d);
  host.appendChild(map3d);

  // The route is revealed only as the rider covers it (no full line ahead).

  trailCtor=Polyline3DElement;trailChunks=[];trailFrom=0;
  travel3d=newTrail([first]);
  map3d.append(travel3d);

  puck3d=null;
  if(Polyline3DElement){
   // Rider dot lying flat on the road, drawn like the trail (polylines are
   // ground ribbons with a constant on-screen width): a tiny circle with a
   // wide stroke reads as a filled dot. White rim, red core, white centre.
   puck3d=[["#FFFFFF",22,4.2],["#E5322D",15,4.4],["#FFFFFF",5,4.6]].map(function(l,k){
    var el=new Polyline3DElement({altitudeMode:"RELATIVE_TO_GROUND",strokeColor:l[0],strokeWidth:l[1],
     drawsOccludedSegments:true,zIndex:40+k,path:puckCircle(first,.45,l[2])});
    map3d.append(el);return {el:el,alt:l[2]};
   });
  }else if(Marker3DElement){
   bike3d=new Marker3DElement({
    position:{lat:first.lat,lng:first.lng,altitude:2},
    altitudeMode:"RELATIVE_TO_GROUND",sizePreserved:true,drawsWhenOccluded:true,zIndex:30
   });
   try{bike3d.append(riderTemplate())}catch(e){}
   map3d.append(bike3d);
  }

  using3d=true;lastCameraHeading=head;lastCameraPoint={lat:first.lat,lng:first.lng};
  $("grReplayState").textContent="Google Earth görünümü hazırlanıyor…";
  try{
   preparePlayback(ride);chase={heading:null,range:null,ts:0,center:null};
   var t0=camMode==="chase"?chaseTarget(0):null;
   map3d.flyCameraTo({
    endCamera:t0?{center:{lat:t0.rider.lat,lng:t0.rider.lng,altitude:groundAt(0)},range:t0.range,tilt:t0.tilt,heading:t0.heading}
                :{center:{lat:first.lat,lng:first.lng,altitude:groundAt(0)},range:1500,tilt:55,heading:head},
    durationMillis:2100
   });
  }catch(e){
   map3d.center={lat:first.lat,lng:first.lng,altitude:groundAt(0)};map3d.range=1500;map3d.tilt=55;map3d.heading=head;
  }
  startReplayPlayback(ride,"Sinematik kamera hazırlanıyor");
 }catch(e){
  console.warn("3D cinematic fallback",e);
  await buildClassicFollowMap(ride)
 }
}
// Circle of radius r metres around p (flat, a little above the trail).
function puckCircle(p,r,alt){
 var out=[],k=Math.cos(p.lat*Math.PI/180);
 for(var i=0;i<=12;i++){var a=i/12*2*Math.PI;out.push({lat:p.lat+r*Math.cos(a)/111320,lng:p.lng+r*Math.sin(a)/(111320*k),altitude:alt})}
 return out;
}
/* Travelled trail: finished pieces are frozen as their own polylines, so
 * each frame only redraws the short live piece behind the rider. */
var trailCtor=null,trailChunks=[],trailFrom=0;
function newTrail(points){
 return new trailCtor({
  path:points.map(function(q){return {lat:q.lat,lng:q.lng,altitude:3}}),
  altitudeMode:"RELATIVE_TO_GROUND",strokeColor:"#E8322E",strokeWidth:9,
  outerColor:"#FFFFFF",outerWidth:.22,drawsOccludedSegments:true,zIndex:12
 });
}
function resetTrail(){
 trailChunks.forEach(function(c){try{c.remove()}catch(e){}});trailChunks=[];trailFrom=0;
 if(travel3d&&playPoints[0])travel3d.path=[{lat:playPoints[0].lat,lng:playPoints[0].lng,altitude:3}];
}
function growTrail(i,p){
 if(i<trailFrom)resetTrail();
 if(i-trailFrom>=120&&trailCtor&&map3d){
  // Freeze the current piece up to point i and start a new live piece there.
  travel3d.path=playPoints.slice(trailFrom,i+1).map(function(q){return {lat:q.lat,lng:q.lng,altitude:3}});
  trailChunks.push(travel3d);trailFrom=i;
  travel3d=newTrail([playPoints[i]]);map3d.append(travel3d);
 }
 travel3d.path=playPoints.slice(trailFrom,i+1).concat([p]).map(function(q){return {lat:q.lat,lng:q.lng,altitude:3}});
}
function updateScene(progress,ts){
 if(playPoints.length<2)preparePlayback(currentRide);
 var x=pointAtDistance(progress);if(!x)return;
 var p=x.point,pos={lat:p.lat,lng:p.lng},now=Number(ts||performance.now());
 if(using3d&&map3d){
  if(puck3d){
   puck3d.forEach(function(l){try{l.el.path=puckCircle(p,.45,l.alt)}catch(e){}});
   lastBikeTs=now
  }else if(bike3d){
   try{bike3d.position={lat:p.lat,lng:p.lng,altitude:2}}catch(e){}
   lastBikeTs=now
  }
  if(travel3d&&(now-lastTrailTs>=33||progress>=1)){
   try{growTrail(x.i,p)}catch(e){console.warn("Travel trace update",e)}
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
 if(camMode==="chase")updateChaseCamera(progress,now,progress>=1);
 else updateOrbitCamera(progress,now,progress>=1);
 updateHud(progress,now,progress>=1);
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
  // Freeze in the final continuously-computed orbit pose; no cut to a new scene.
  $("grReplayState").textContent=routeIntegrity(currentRide).missing?"Kaydedilen GPS bölümü tamamlandı":"Sürüş tamamlandı · Kesintisiz uçuş";
  $("grReplayPause").innerHTML='<span class="mi">replay</span> Tekrar oynat';
  return
 }
 anim=requestAnimationFrame(loop)
}
async function open(ride){
 currentRide=ride;playbackSpeed=1;if(!modal)install();modal.classList.add("active");updateSpeedControls();document.body.style.overflow="hidden";clearMaps();$("grReplayState").textContent="Gerçek yol rotası hazırlanıyor…";var host=$("grReplayMap");if(host)host.innerHTML='<div style="height:100%;display:grid;place-items:center;padding:24px;text-align:center;color:#c7ced8;font-weight:800">Google yol rotası hazırlanıyor…</div>';
 try{
  await waitForGoogle();currentRide=await resolveDemoRoadRoute(currentRide);currentRide._matchedReplayPath=await matchRideToRoads(currentRide);
  $("grReplayKm").textContent=Number(currentRide.km||0).toFixed(1);
  preparePlayback(currentRide);buildSpeedProfile(currentRide);
  var ts=trackStats(currentRide),vmax=speedProfile.reduce(function(m,x){return Math.max(m,x.v)},0);
  $("grReplayTime").textContent=ts?fmtDuration(ts.sec):(currentRide.duration||"00:00");
  $("grReplayMax").textContent=Math.round(Math.max(Number(currentRide.max||0),vmax));
  $("grReplayAvg").textContent=ts?Math.round(ts.avg):avgSpeed(currentRide);
  $("grReplayTurns").textContent=Math.round(Number(currentRide.turns||0));
  var lm=$("grReplayLean");if(lm)lm.textContent=Math.max(Number(currentRide.leanMaxLeft||0),Number(currentRide.leanMaxRight||0)).toFixed(1)+"°";
  var fuel=$("grReplayFuel");if(fuel)fuel.textContent=Number(currentRide.fuelLiters||0).toFixed(1)+" L";
  $("grReplayName").textContent=currentRide.destination||"Sürüş Tekrarı";$("grReplayDate").textContent=currentRide.date||"";
  preparePlayback(currentRide);duration=replayDurationMs(currentRide);lastProgress=0;lastCameraTs=0;lastTrailTs=0;lastCameraPoint=null;lastCameraHeading=0;
  buildOverviewMap(currentRide)
 }catch(e){$("grReplayState").textContent="Rota hazırlanamadı";var host=$("grReplayMap");if(host)host.innerHTML='<div style="height:100%;display:grid;place-items:center;padding:24px;text-align:center;color:#ff8a65;font-weight:800">Örnek rota açılamadı: '+String(e&&e.message||e).replace(/[&<>]/g,"")+'</div>';console.warn(e)}
}
function close(){closeReplayShare();clearMaps();if(modal)modal.classList.remove("active");document.body.style.overflow=""}
function pauseResume(){
 var restarting=!auto&&lastProgress>=.999;
 if(restarting){
  lastProgress=0;start=0;lastTrailTs=0;lastBikeTs=0;orbitLastFrame=0;chase={heading:null,range:null,ts:0,center:null};
  resetTrail();updateScene(0,performance.now())
 }
 auto=!auto;
 $("grReplayPause").innerHTML=auto?'<span class="mi">pause</span> Duraklat':'<span class="mi">play_arrow</span> Devam et';
 if(auto){
  start=performance.now()-lastProgress*(duration/playbackSpeed);
  anim=requestAnimationFrame(loop)
 }else{
  cancelAnimationFrame(anim);
  // Stop only an unfinished introductory Google flight, if present.
  if(!orbitFrames)stopCinematicFlight()
 }
}
function backOverview(){
 playSessionId++;auto=false;lastProgress=0;start=0;cancelAnimationFrame(anim);
 stopCinematicFlight();orbitRail=[];orbitLatest=null;orbitLastFrame=0;buildOverviewMap(currentRide)
}
function replayShareText(){
 var ride=currentRide||{},track=pts(ride),J=window.GaZonJournal,label=J&&J.rideTitle?J.rideTitle(ride):(ride.destination||"Motosiklet sürüşü");
 var m=J&&J.metrics?J.metrics(ride):null,bits=[Number(ride.km||0).toFixed(1)+" km"];
 if(m){if(m.sec)bits.push(J.fmtDur(m.sec));if(m.avg>0)bits.push("ort. "+m.avg+" km/sa");if(m.turns)bits.push(m.turns+" viraj")}else if(ride.duration)bits.push(ride.duration);
 var text="🏍 GaZonRide sürüşü\n"+label+"\n"+bits.join(" · ");
 if(track.length>1){
  var a=track[0],b=track[track.length-1];
  var url="https://www.google.com/maps/dir/?api=1&origin="+encodeURIComponent(a.lat.toFixed(6)+","+a.lng.toFixed(6))+"&destination="+encodeURIComponent(b.lat.toFixed(6)+","+b.lng.toFixed(6))+"&travelmode=driving";
  text+="\n📍 Başlangıç / varış: "+url
 }
 return text
}
function closeReplayShare(){
 var panel=$("grReplaySharePanel");if(panel)panel.classList.remove("active")
}
function shareRide(){
 // Android app: system share sheet straight away (WhatsApp, Instagram, …).
 if(window.AndroidBridge&&typeof AndroidBridge.shareText==="function"){try{AndroidBridge.shareText("GaZonRide Sürüşü",replayShareText());return}catch(e){}}
 var panel=$("grReplaySharePanel");if(!panel)return;
 panel.classList.add("active");
 var msg=$("grReplayShareResult");if(msg)msg.textContent="Paylaşım yöntemini seç";
}
async function copyReplayShare(){
 var text=replayShareText(),result=$("grReplayShareResult"),ok=false;
 try{
  if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(text);ok=true}
 }catch(e){}
 if(!ok){
  try{
   var area=document.createElement("textarea");area.value=text;area.style.position="fixed";area.style.opacity="0";document.body.appendChild(area);
   area.focus();area.select();ok=!!document.execCommand("copy");area.remove()
  }catch(e){}
 }
 if(result)result.textContent=ok?"Sürüş bilgileri kopyalandı.":"Kopyalama engellendi. WhatsApp veya cihaz paylaşımını kullan.";
}
function whatsappReplayShare(){
 var url="https://wa.me/?text="+encodeURIComponent(replayShareText());
 // Inside the Android WebView window.open/wa.me do nothing: hand the link to Android.
 if(window.AndroidBridge&&typeof AndroidBridge.openExternal==="function"){
  try{AndroidBridge.openExternal("whatsapp://send?text="+encodeURIComponent(replayShareText()));return}catch(e){}
 }
 var tab=null;try{tab=window.open(url,"_blank","noopener,noreferrer")}catch(e){}
 if(!tab)window.location.href=url
}
async function nativeReplayShare(){
 var txt=replayShareText(),result=$("grReplayShareResult");
 if(window.AndroidBridge&&typeof AndroidBridge.shareText==="function"){try{AndroidBridge.shareText("GaZonRide Sürüşü",txt);return}catch(e){}}
 if(!navigator.share){if(result)result.textContent="Cihaz paylaşımı desteklenmiyor. WhatsApp veya Kopyala'yı kullan.";return}
 try{
  await navigator.share({title:"GaZonRide Sürüşü",text:txt});
  if(result)result.textContent="Paylaşım açıldı.";
 }catch(e){
  if(result)result.textContent=e&&e.name==="AbortError"?"Paylaşım iptal edildi.":"Cihaz paylaşımı açılamadı. Diğer seçenekleri kullan."
 }
}
function scan(){
 document.querySelectorAll("#historyList .ride").forEach(function(row,i){if(row.querySelector("[data-gr-replay]"))return;var b=document.createElement("button");b.className="mapBtn";b.setAttribute("data-gr-replay",String(i));b.title="Sürüş Tekrarı";b.innerHTML='<span class="mi">3d_rotation</span>';b.onclick=function(){var r=rides()[Number(b.getAttribute("data-gr-replay"))];if(r)open(r)};row.appendChild(b)});
 document.querySelectorAll("#screen [data-route]").forEach(function(routeBtn){var card=routeBtn.closest(".screenCard");if(!card||card.querySelector("[data-gr-screen-replay]"))return;var i=Number(routeBtn.getAttribute("data-route")),b=document.createElement("button");b.className="screenBtn";b.setAttribute("data-gr-screen-replay",String(i));b.innerHTML='<span class="mi" style="vertical-align:-5px">3d_rotation</span> Sürüş Tekrarı';b.onclick=function(){var r=rides()[Number(b.getAttribute("data-gr-screen-replay"))];if(r)open(r)};routeBtn.insertAdjacentElement("afterend",b)})
}
function install(){
 modal=document.createElement("div");modal.id="grReplay";modal.className="gr-replay";
 modal.innerHTML='<div class="gr-replay-wrap"><div class="gr-replay-head"><div><b>Sürüş Tekrarı</b><small id="grReplayState">Rota hazırlanıyor</small></div><button class="gr-replay-close" id="grReplayClose"><span class="mi">close</span></button></div><div class="gr-replay-stage"><div id="grReplayMap" class="gr-replay-map"></div><button class="gr-play3d" id="grReplayPlay3D"><span class="mi">play_arrow</span> Sürüşü Oynat</button><div class="gr-replay-title"><b id="grReplayName">Sürüş Tekrarı</b><small id="grReplayDate"></small><small id="grReplayDistance" class="gr-replay-distance">0 / 0 km</small><div class="gr-replay-progress"><i id="grReplayBar"></i></div></div>'+
 '<div class="gr-replay-hud" aria-live="off"><div><b id="grHudKm">0</b><small>km</small><span>mesafe</span></div><div><b id="grHudSpeed">—</b><small>km/sa</small><span>hız</span></div><div><b id="grHudAlt">—</b><small>m</small><span>rakım</span></div></div>'+
 '<div class="gr-replay-compass" id="grHudCompass" aria-hidden="true"><i>N</i></div>'+
 '<button class="gr-replay-cam" id="grReplayCam" type="button"></button></div><div class="gr-replay-speed"><span>Oynatma hızı</span><button data-replay-speed="1">1×</button><button data-replay-speed="2" class="active">2×</button><button data-replay-speed="4">4×</button></div><div class="gr-bigstats"><div><b id="grReplayKm">0</b><small>KM</small></div><div><b id="grReplayTime">00:00</b><small>SÜRE</small></div><div><b id="grReplayTurns">0</b><small>VİRAJ</small></div></div><div class="gr-detail-list"><div><span>Ortalama hız</span><b><span id="grReplayAvg">0</span> km/sa</b></div><div><span>Azami hız</span><b><span id="grReplayMax">0</span> km/sa</b></div><div><span>En yüksek yatış</span><b id="grReplayLean">0°</b></div><div><span>Tahmini yakıt</span><b id="grReplayFuel">0.0 L</b></div></div><div class="gr-replay-controls"><button id="grReplayPause" style="display:none"><span class="mi">pause</span> Duraklat</button><button id="grReplayOverview"><span class="mi">map</span> Rota Özeti</button><button class="primary" id="grReplayShare"><span class="mi">share</span> Sürüşü Paylaş</button></div><div class="gr-replay-share-panel" id="grReplaySharePanel" role="dialog" aria-label="Sürüşü paylaş"><div class="gr-replay-share-head"><b>🏍 Sürüşü Paylaş</b><button id="grReplayShareClose" aria-label="Kapat"><span class="mi">close</span></button></div><p>Başlangıç ve varış konumunu içeren harita bağlantısı paylaşılır; tüm GPS izi paylaşılmaz.</p><div id="grReplayShareResult" aria-live="polite">Paylaşım yöntemini seç</div><div class="gr-replay-share-actions"><button id="grReplayNative"><span class="mi">ios_share</span> Cihazla Paylaş</button><button id="grReplayWhatsapp"><span class="mi">chat</span> WhatsApp</button><button id="grReplayCopy"><span class="mi">content_copy</span> Kopyala</button></div></div></div>';
 document.body.appendChild(modal);
 var camBtn=$("grReplayCam"),paintCam=function(){camBtn.innerHTML='<span class="mi">'+(camMode==="chase"?"two_wheeler":"flight")+'</span> '+(camMode==="chase"?"Takip":"Drone")};
 paintCam();camBtn.onclick=function(){camMode=camMode==="chase"?"orbit":"chase";try{localStorage.setItem("gazon_replay_cam",camMode)}catch(e){}paintCam();if(mode==="3d"&&currentRide)build3DMap(currentRide)};
 $("grReplayClose").onclick=close;$("grReplayPlay3D").onclick=function(){build3DMap(currentRide)};$("grReplayPause").onclick=pauseResume;$("grReplayOverview").onclick=backOverview;$("grReplayShare").onclick=shareRide;$("grReplayShareClose").onclick=closeReplayShare;$("grReplayNative").onclick=nativeReplayShare;$("grReplayWhatsapp").onclick=whatsappReplayShare;$("grReplayCopy").onclick=copyReplayShare;modal.querySelectorAll("[data-replay-speed]").forEach(function(b){b.onclick=function(){setSpeed(Number(b.getAttribute("data-replay-speed")))}});new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});scan()
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install);else install();
window.GaZonReplay={open:open,scan:scan,diagnostics:function(ride){return routeIntegrity(ride||currentRide)},cameraDiagnostics:function(){return {type:"continuous-route-axis-orbit",frames:orbitFrames,railPoints:orbitRail.length,orbitDegrees:orbitTotalDegrees,latest:orbitLatest,mode:using3d?"3d":"classic"}}};
})();