/* GazOnRide navigation camera + GPS jump filter.
 * - rejects impossible GPS jumps (multipath in cities / tunnels)
 * - smooths heading on the circle (no 359° -> 0° spins), ignores heading
 *   while stopped so the map does not rotate at traffic lights
 * - glides camera and rider arrow between fixes at display frame rate with
 *   one moveCamera() call per frame, instead of a panTo/setHeading pair
 *   every 650 ms (the source of the old shaking)
 * - 2D (north/heading-up, flat) and 3D (tilted, closer) views
 */
(function(root){
"use strict";
var R=6371008.8;
function finite(v){var n=Number(v);return v!==null&&v!==undefined&&v!==""&&isFinite(n)?n:null}
function meters(a,b){
 var r=Math.PI/180,x=(b.lat-a.lat)*r,y=(b.lon-a.lon)*r;
 var s=Math.sin(x/2)*Math.sin(x/2)+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(y/2)*Math.sin(y/2);
 return 2*R*Math.asin(Math.min(1,Math.sqrt(s)));
}
function course(a,b){
 var r=Math.PI/180,l1=a.lat*r,l2=b.lat*r,dl=(b.lon-a.lon)*r;
 return (Math.atan2(Math.sin(dl)*Math.cos(l2),Math.cos(l1)*Math.sin(l2)-Math.sin(l1)*Math.cos(l2)*Math.cos(dl))*180/Math.PI+360)%360;
}
function angleDelta(from,to){return ((to-from+540)%360)-180}

/* GPS filter: accept(fix) -> {accepted, reason, point, speed, heading} */
function GpsFilter(opts){
 opts=opts||{};
 var maxAccuracy=opts.maxAccuracy||65,maxSpeed=opts.maxSpeed||75; // m/s ≈ 270 km/h
 var last=null,heading=null,rejectStreak=0;
 function accept(fix){
  var lat=finite(fix&&fix.lat),lon=finite(fix&&fix.lon),ts=finite(fix&&fix.ts),acc=finite(fix&&fix.accuracy);
  if(lat==null||lon==null||ts==null||Math.abs(lat)>90||Math.abs(lon)>180)return {accepted:false,reason:"invalid"};
  if(acc==null||acc<=0||acc>maxAccuracy)return {accepted:false,reason:"accuracy"};
  var p={lat:lat,lon:lon},speed=finite(fix.speed),gpsHeading=finite(fix.heading);
  if(last){
   var dt=(ts-last.ts)/1000;
   if(dt<=0)return {accepted:false,reason:"stale"};
   var d=meters(last.p,p),implied=d/dt;
   // A jump faster than any motorcycle, beyond both accuracy circles, is a
   // multipath error. After several consistent rejections the receiver has
   // genuinely moved (e.g. after a tunnel): accept and restart from there.
   var slack=(acc+last.acc)*1.5;
   if(d>slack&&implied>maxSpeed&&dt<120&&rejectStreak<4){rejectStreak++;return {accepted:false,reason:"jump"}}
   if(speed==null)speed=implied;
   if(d>=6&&speed>=2.2)gpsHeading=gpsHeading!=null&&speed>=4?gpsHeading:course(last.p,p);
  }
  rejectStreak=0;
  if(speed!=null&&speed>=2.2&&gpsHeading!=null&&gpsHeading>=0&&gpsHeading<360){
   if(heading==null)heading=gpsHeading;
   else{
    // Faster smoothing when moving fast (real turns), slower when slow.
    var k=speed>12?.45:speed>6?.32:.2;
    heading=(heading+angleDelta(heading,gpsHeading)*k+360)%360;
   }
  }
  last={p:p,ts:ts,acc:acc};
  return {accepted:true,point:p,speed:speed==null?0:speed,heading:heading,accuracy:acc,ts:ts};
 }
 function reset(){last=null;heading=null;rejectStreak=0}
 return {accept:accept,reset:reset,get heading(){return heading}};
}

// Zoom by speed: close in town, wider on fast roads (Google-like).
function zoomForSpeed(speed,mode){
 var kmh=(speed||0)*3.6,z=kmh<25?18:kmh<50?17.5:kmh<80?17:kmh<110?16.4:15.9;
 return mode==="3d"?z+.3:z-.4;
}
function lerp(a,b,t){return a+(b-a)*t}
function interpolate(from,to,t){
 t=Math.max(0,Math.min(1,t));
 return {lat:lerp(from.lat,to.lat,t),lon:lerp(from.lon,to.lon,t),
  heading:(from.heading+angleDelta(from.heading,to.heading)*t+360)%360,
  zoom:lerp(from.zoom,to.zoom,t),tilt:lerp(from.tilt,to.tilt,t)};
}

/* Camera(map, {marker}) drives a google.maps.Map. Call fix() with each
 * accepted GPS fix and start()/stop() with guidance. */
function Camera(map,opts){
 opts=opts||{};
 var mode="3d",active=false,frame=0,from=null,to=null,start=0,duration=1000,lastDraw=0,lastIcon=null;
 var raf=root.requestAnimationFrame?root.requestAnimationFrame.bind(root):function(f){return setTimeout(function(){f(Date.now())},33)};
 var caf=root.cancelAnimationFrame?root.cancelAnimationFrame.bind(root):clearTimeout;
 function state(){return to||from}
 function target(f){
  var heading=f.heading!=null?f.heading:(state()?state().heading:0);
  return {lat:f.point.lat,lon:f.point.lon,heading:mode==="2d-north"?0:heading,
   zoom:zoomForSpeed(f.speed,mode),tilt:mode==="3d"?55:0};
 }
 function draw(now){
  frame=0;
  if(!active||!from||!to)return;
  // ~30 fps is smooth for a map and saves battery compared to 60 fps.
  if(now-lastDraw>=30){
   lastDraw=now;
   var c=interpolate(from,to,(now-start)/duration);
   try{
    map.moveCamera({center:{lat:c.lat,lng:c.lon},heading:c.heading,tilt:c.tilt,zoom:c.zoom});
   }catch(e){}
   var marker=opts.marker&&opts.marker();
   if(marker){
    try{
     marker.setPosition({lat:c.lat,lng:c.lon});
     // In heading-up modes the arrow points up; re-style only on change.
     var rot=Math.round(mode==="2d-north"?to.heading:(opts.headingFor?opts.headingFor(c):c.heading));
     if(opts.icon&&rot!==lastIcon){lastIcon=rot;marker.setIcon(opts.icon(rot))}
    }catch(e){}
   }
  }
  if(now-start<duration)frame=raf(draw);
 }
 function fix(f){
  if(!f||!f.point)return;
  var next=target(f),now=Date.now();
  from=from&&to?interpolate(from,to,(now-start)/duration):next;
  to=next;start=now;
  // Glide over the expected time to the next fix (GPS ~1 Hz).
  duration=Math.max(400,Math.min(1600,opts.interval||1000));
  if(active&&!frame)frame=raf(draw);
 }
 function startCam(){active=true;if(from&&!frame)frame=raf(draw)}
 function stopCam(){active=false;if(frame){caf(frame);frame=0}}
 function setMode(m){mode=m==="2d"||m==="2d-north"?m:"3d";if(to)to=Object.assign({},to,{tilt:mode==="3d"?55:0,heading:mode==="2d-north"?0:to.heading});if(active&&!frame){start=Date.now();frame=raf(draw)}}
 return {fix:fix,start:startCam,stop:stopCam,setMode:setMode,get mode(){return mode},get active(){return active}};
}
var api={GpsFilter:GpsFilter,Camera:Camera,zoomForSpeed:zoomForSpeed,interpolate:interpolate,meters:meters,course:course,angleDelta:angleDelta};
root.GaZonCamera=api;
if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
