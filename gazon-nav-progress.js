/* GaZonRide Navigation Progress Engine v1.
   Uses only fresh GPS fixes and projected distance along the selected road polyline.
   Does not infer travel when GPS is stale, and does not affect the replay camera. */
(function(root){
 "use strict";
 function finite(v){var n=Number(v);return Number.isFinite(n)?n:null}
 function pnt(v){
  if(!v)return null;
  var lat=typeof v.lat==="function"?v.lat():v.lat;
  var lng=typeof v.lng==="function"?v.lng():v.lng;
  if(lng==null){lng=typeof v.lon==="function"?v.lon():v.lon}
  if((lat==null||lng==null)&&v.location)return pnt(v.location);
  lat=finite(lat);lng=finite(lng);
  return lat!=null&&lng!=null&&Math.abs(lat)<=90&&Math.abs(lng)<=180?{lat:lat,lon:lng}:null
 }
 function hav(a,b){
  if(!a||!b)return Infinity;
  var r=Math.PI/180,dl=(b.lon-a.lon)*r,dp=(b.lat-a.lat)*r;
  var v=Math.sin(dp/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dl/2)**2;
  return 12742000*Math.asin(Math.min(1,Math.sqrt(Math.max(0,v))))
 }
 function pointSegment(p,a,b){
  var latRad=(p.lat+a.lat+b.lat)/3*Math.PI/180;
  var mx=111195*Math.cos(latRad),my=111195;
  var dx=(b.lon-a.lon)*mx,dy=(b.lat-a.lat)*my;
  var px=(p.lon-a.lon)*mx,py=(p.lat-a.lat)*my;
  var q=dx*dx+dy*dy,t=q>0?Math.max(0,Math.min(1,(px*dx+py*dy)/q)):0;
  var x=px-t*dx,y=py-t*dy;
  return {t:t,offMeters:Math.hypot(x,y)}
 }
 function Engine(){
  var points=[],cumulative=[],measured=0,routeMeters=0,plannedSeconds=0,steps=[],turnDistances=[];
  var progress=0,previousTime=0,hasProgress=false,lastGPS=0,lastOff=Infinity,valid=false,resetCount=0;
  function closest(point,restrict){
   if(!point||points.length<2)return null;
   var best=null,score=Infinity;
   for(var i=0;i<points.length-1;i++){
    var m=pointSegment(point,points[i],points[i+1]),along=cumulative[i]+m.t*(cumulative[i+1]-cumulative[i]);
    var penalty=0;
    // When the road crosses itself, prefer the nearby segment in ride order.
    if(hasProgress&&restrict){
     var behind=Math.max(0,progress-along-55);
     penalty+=Math.min(400,behind*.12);
     var dt=Math.max(1,(lastGPS?Date.now()-lastGPS:0)/1000);
     var tooFar=Math.max(0,along-progress-Math.max(160,dt*65));
     penalty+=Math.min(400,tooFar*.18)
    }
    var value=m.offMeters+penalty;
    if(value<score){score=value;best={alongMeters:along,offMeters:m.offMeters,segment:i,scoring:value}}
   }
   return best
  }
  function initialize(path,navSteps,km,sec){
   points=(Array.isArray(path)?path:[]).map(pnt).filter(Boolean);
   cumulative=[0];measured=0;
   for(var i=1;i<points.length;i++){
    var d=hav(points[i-1],points[i]);
    if(!Number.isFinite(d)||d>15000)d=0;
    measured+=d;cumulative.push(measured)
   }
   routeMeters=finite(km)!=null&&Number(km)>0?Number(km)*1000:measured;
   plannedSeconds=Math.max(0,finite(sec)||0);
   steps=Array.isArray(navSteps)?navSteps:[];
   turnDistances=[];
   var stepsDistance=steps.reduce(function(sum,s){return sum+Math.max(0,finite(s.distance)||0)},0),running=0,last=0;
   for(var j=0;j<steps.length;j++){
    var st=steps[j];
    running+=Math.max(0,finite(st.distance)||0);
    var fallback=stepsDistance>0?measured*(running/stepsDistance):measured*(j+1)/Math.max(1,steps.length);
    var chosen=fallback,ep=pnt(st.end);
    if(ep&&points.length>1){
     var result=closest(ep,false);
     if(result&&result.offMeters<110&&result.alongMeters>=last-20)chosen=result.alongMeters
    }
    chosen=Math.max(last,Math.min(measured,chosen));
    turnDistances.push(chosen);last=chosen
   }
   progress=0;lastGPS=0;lastOff=Infinity;previousTime=0;hasProgress=false;valid=false;resetCount++;
   return state()
  }
  function update(position,when,accuracy){
   var p=pnt(position);
   var stamp=finite(when)||Date.now();
   if(stamp<1e12)stamp=Date.now(); // GPS timestamp normally Unix epoch milliseconds
   var acc=finite(accuracy);
   if(!p)return state();
   var near=closest(p,true);
   if(!near)return state();
   lastOff=near.offMeters;lastGPS=stamp;
   // Do not advance the drive along an unrelated road or unreliable GPS fix.
   if(near.offMeters>140||(acc!=null&&acc>125)){
    valid=false;return state()
   }
   var next=near.alongMeters;
   if(hasProgress){
    var elapsed=Math.max(0,(stamp-previousTime)/1000),limit=Math.max(90,elapsed*65);
    next=Math.min(next,progress+limit);
    // GPS may wander slightly backwards: progress must not decrease.
    next=Math.max(progress,next)
   }
   progress=Math.max(0,Math.min(measured,next));
   hasProgress=true;valid=true;previousTime=stamp;
   return state()
  }
  function state(){
   var completion=measured>0?Math.min(1,Math.max(0,progress/measured)):0;
   var metersLeft=Math.max(0,routeMeters*(1-completion));
   var secsLeft=Math.max(0,plannedSeconds*(1-completion));
   var idx=0;
   while(idx<turnDistances.length-1&&progress>=turnDistances[idx]-25)idx++;
   var turnDistance=turnDistances.length?Math.max(0,turnDistances[Math.min(idx,turnDistances.length-1)]-progress):null;
   return {
    valid:valid,hasProgress:hasProgress,lastGPS:lastGPS,accuracyMeters:lastOff,
    routeMeters:routeMeters,measuredMeters:measured,progressMeters:progress,
    fraction:completion,remainingMeters:metersLeft,remainingSeconds:secsLeft,
    stepIndex:idx,nextTurnMeters:turnDistance,
    stepsAvailable:steps.length,resetCount:resetCount
   }
  }
  function age(){return lastGPS?Math.max(0,Date.now()-lastGPS):Infinity}
  return {initialize:initialize,update:update,state:state,age:age,normalize:pnt,closest:closest}
 }
 root.GaZonNavProgress=Engine();
 if(typeof module!=="undefined"&&module.exports)module.exports={Engine:Engine}
})(typeof window!=="undefined"?window:globalThis);
