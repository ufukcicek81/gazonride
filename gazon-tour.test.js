"use strict";
const assert=require("node:assert/strict");
const Tour=require("./gazon-tour.js");
const home={lat:40.875,lon:30.95};
function distance(a,b){
 const r=Math.PI/180;
 const dlat=(b.lat-a.lat)*r,dlon=(b.lon-a.lon)*r;
 const h=Math.sin(dlat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dlon/2)**2;
 return 12742.0176*Math.asin(Math.min(1,Math.sqrt(h)));
}
for(const direction of ["auto","north","east","south","west"]){
 const routes=Tour.candidates(home,100,direction);
 assert.equal(routes.length,3,"3 tour shape candidates");
 routes.forEach(r=>{
  assert.equal(r.middle.length,2,"2 intermediate waypoints");
  r.middle.forEach(p=>{
   assert.ok(Number.isFinite(p.lat)&&Number.isFinite(p.lon),"geographic waypoint");
   assert.ok(distance(home,p)>8&&distance(home,p)<40,"waypoint in sensible 100-km search radius");
  });
  const url=Tour.externalUrl({origin:home,middle:r.middle});
  const u=new URL(url);
  assert.equal(u.origin,"https://www.google.com");
  assert.equal(u.searchParams.get("origin"),"40.875000,30.950000");
  assert.equal(u.searchParams.get("destination"),"40.875000,30.950000","return to start");
  assert.equal(u.searchParams.get("waypoints").split("|").length,2,"both stops preserved");
  assert.equal(u.searchParams.get("travelmode"),"driving");
 });
}
for(const km of [50,100,150]){
 const points=Tour.candidates(home,km,"auto");
 const avg=points.flatMap(c=>c.middle.map(p=>distance(home,p))).reduce((a,b)=>a+b,0)/6;
 assert.ok(avg>km/5&&avg<km/3.5,"waypoint radius follows target");
}
assert.equal(Tour.offset(null,90,20),null);
assert.equal(Tour.offset(home,90,-1),null);
assert.ok(distance(home,Tour.offset(home,65,12))-12<.01);
console.log("PASS: tour bearings, route distances, 3 alternatives, round-trip Google Maps links");
