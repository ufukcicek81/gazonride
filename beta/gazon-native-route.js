/* GazOnRide native-route handoff.
 * Samples *road geometry* selected by the rider into intermediate Google
 * Navigation SDK waypoints. Google may still choose a different legal road;
 * this is a best-effort route-preservation mechanism, not polyline injection.
 */
(function(root){
"use strict";
const R=6371008.8;
function point(raw){
 if(!raw)return null;
 const lat=Number(typeof raw.lat==="function"?raw.lat():raw.lat);
 const val=raw.lon!==undefined?raw.lon:(typeof raw.lng==="function"?raw.lng():raw.lng);
 const lon=Number(val);
 return Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180?{lat,lon}:null;
}
function distance(a,b){
 const x=Math.PI/180,dl=(b.lat-a.lat)*x,dn=(b.lon-a.lon)*x;
 const h=Math.sin(dl/2)**2+Math.cos(a.lat*x)*Math.cos(b.lat*x)*Math.sin(dn/2)**2;
 return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));
}
function routeStops(points,destination,maxVia){
 const clean=(Array.isArray(points)?points:[]).map(point).filter(Boolean);
 const final=point(destination)||clean[clean.length-1];
 if(!final)return [];
 if(clean.length<3)return [final];
 const distances=[0];let total=0;
 for(let i=1;i<clean.length;i++){
  total+=distance(clean[i-1],clean[i]);
  distances.push(total);
 }
 if(total<=0)return [final];
 const viaCount=total<2500?0:total<10000?2:total<25000?3:Math.min(7,Math.max(1,Number(maxVia)||4));
 if(viaCount===0)return [final];
 const sampleAt=function(at){
  at=Math.max(0,Math.min(total,at));
  let j=1;
  while(j<distances.length-1&&distances[j]<at)j++;
  const a=clean[j-1],b=clean[j],len=distances[j]-distances[j-1],t=len>0?(at-distances[j-1])/len:0;
  return {point:{lat:a.lat+(b.lat-a.lat)*t,lon:a.lon+(b.lon-a.lon)*t},at};
 };
 const chosen=[],minGap=Math.min(2000,Math.max(450,total/(viaCount+2)*.13));
 for(let n=1;n<=viaCount;n++){
  const target=total*n/(viaCount+1);
  let best=null,bestPenalty=Infinity;
  // Select a point ALONG the Google road geometry, preferably on a calm
  // section. An ambiguous road crossing or sharp hairpin as a forced
  // Navigation SDK stop can make Google leave the route and U-turn.
  for(const shift of [0,650,-650,1400,-1400,2200,-2200]){
   const p=sampleAt(target+shift),c=p.point;
   if(distance(clean[0],c)<minGap||distance(c,final)<minGap)continue;
   if(chosen.some(other=>distance(other.point,c)<minGap))continue;
   const before=sampleAt(p.at-220).point,after=sampleAt(p.at+220).point;
   const direct=distance(before,after);
   const travel=distance(before,c)+distance(c,after);
   // A small direct/travel ratio implies an extremely sharp corner or
   // hairpin. Do not lock a native waypoint at that turn.
   const sharpness=travel>0?1-direct/travel:0;
   let ambiguity=0;
   for(let j=0;j<clean.length;j+=2){
    if(Math.abs(distances[j]-p.at)<2300)continue;
    if(distance(clean[j],c)<160){ambiguity++;if(ambiguity>=3)break}
   }
   const penalty=Math.abs(shift)/4000+sharpness*6+ambiguity*8;
   if(penalty<bestPenalty){best=p;bestPenalty=penalty}
  }
  if(best)chosen.push(best);
 }
 chosen.push({point:final});
 return chosen.map(o=>({
  lat:Math.round(o.point.lat*1e6)/1e6,
  lon:Math.round(o.point.lon*1e6)/1e6
 }));
}
const api={point,distance,routeStops};
root.GaZonNativeRoute=api;
if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
