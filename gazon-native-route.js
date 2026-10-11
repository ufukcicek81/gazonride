/* GaZonRide native-route handoff.
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
 // Short local routes need no extra waypoints.
 const viaCount=total<2500?0:total<10000?2:total<25000?3:Math.min(5,Math.max(1,Number(maxVia)||4));
 const result=[],gap=Math.max(300,Math.min(1800,total/(viaCount+2)*.16));
 for(let n=1;n<=viaCount;n++){
  const target=total*n/(viaCount+1);
  let j=1;while(j<distances.length-1&&distances[j]<target)j++;
  const a=clean[j-1],b=clean[j],length=distances[j]-distances[j-1];
  const fraction=length>0?(target-distances[j-1])/length:0;
  const p={lat:a.lat+(b.lat-a.lat)*fraction,lon:a.lon+(b.lon-a.lon)*fraction};
  const preceding=result.length?result[result.length-1]:clean[0];
  if(distance(preceding,p)<gap||distance(p,final)<gap)continue;
  result.push(p);
 }
 result.push(final);
 return result.map(p=>({lat:Math.round(p.lat*1e6)/1e6,lon:Math.round(p.lon*1e6)/1e6}));
}
const api={point,distance,routeStops};
root.GaZonNativeRoute=api;
if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
