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
 assert.equal(routes.length,12,"12 diversified tour shape candidates");
 routes.forEach(r=>{
  assert.ok(r.middle.length>=2&&r.middle.length<=3,"2-3 intermediate waypoints make a polygon");
  r.middle.forEach(p=>{
   assert.ok(Number.isFinite(p.lat)&&Number.isFinite(p.lon),"geographic waypoint");
   assert.ok(distance(home,p)>8&&distance(home,p)<40,"waypoint in sensible 100-km search radius");
  });
  const url=Tour.externalUrl({origin:home,middle:r.middle});
  const u=new URL(url);
  assert.equal(u.origin,"https://www.google.com");
  assert.equal(u.searchParams.get("origin"),"40.875000,30.950000");
  assert.equal(u.searchParams.get("destination"),"40.875000,30.950000","return to start");
  assert.equal(u.searchParams.get("waypoints").split("|").length,r.middle.length,"all stops preserved");
  assert.equal(u.searchParams.get("travelmode"),"driving");
 });
}
for(const km of [50,100,150]){
 const points=Tour.candidates(home,km,"auto");
 const radii=points.flatMap(c=>c.middle.map(p=>distance(home,p)));
 const avg=radii.reduce((a,b)=>a+b,0)/radii.length;
 assert.ok(avg>km/9&&avg<km/3.5,"waypoint radius follows target");
}
assert.equal(Tour.offset(null,90,20),null);
assert.equal(Tour.offset(home,90,-1),null);
assert.ok(Math.abs(distance(home,Tour.offset(home,65,12))-12)<.01);
const straight=[{lat:40.875,lon:30.95},{lat:40.875,lon:30.953},{lat:40.875,lon:30.956},{lat:40.875,lon:30.959}];
const bending=[{lat:40.875,lon:30.95},{lat:40.878,lon:30.95},{lat:40.878,lon:30.954},{lat:40.874,lon:30.954},{lat:40.874,lon:30.959}];
assert.ok(Tour.curvature(bending,2)>Tour.curvature(straight,2),"turning road scores above straight road");
const a={km:102,sec:5200,curveScore:9},b={km:100,sec:4800,curveScore:1};
assert.ok(Tour.score(b,"fast",100)>Tour.score(a,"fast",100),"fast prefers lower time");
assert.ok(Tour.score(a,"verycurvy",100)>Tour.score(b,"verycurvy",100),"very curvy prefers bends");
assert.equal(Tour.extractSteps({legs:[{steps:[{distanceMeters:250,maneuver:"TURN_LEFT",endLocation:{lat:40,lon:31}}]}]}).length,1);
const north=(km)=>Tour.offset(home,0,km);
const roundTrip=[home,north(5),north(15),north(30),north(15),north(5),home];
const bad=Tour.loopQuality(roundTrip,60);
assert.equal(bad.ok,false,"out-and-back route must be rejected");
assert.ok(bad.overlap>.6,"returning on same road has high repeated-road fraction");
const closed=[home,Tour.offset(home,0,20),Tour.offset(home,90,20),Tour.offset(home,180,20),Tour.offset(home,270,20),home];
const good=Tour.loopQuality(closed,120);
assert.equal(good.ok,true,"geographically distinct closed loop must be accepted");
assert.ok(good.overlap<.22,"loop has little road repetition");
assert.ok(good.areaRatio>.0035,"loop encloses meaningful geographical area");
const sameRoadButWide=[home,north(10),Tour.offset(home,45,18),north(10),home];
assert.equal(Tour.loopQuality(sameRoadButWide,90).ok,false,"road retracing is not hidden by a scenic waypoint");
assert.equal(Tour.loopQuality([],150).ok,false,"empty road geometry is rejected");
// A long loop with a small detour down a dead-end and straight back MUST
// be rejected even if only ~3-5% of the total 90 km overlaps.
const east11=Tour.offset(home,90,11),east22=Tour.offset(home,90,22);
const north22=Tour.offset(home,0,22),northEast={lat:north22.lat,lon:east22.lon};
const spurTip={lat:east11.lat+.015,lon:east11.lon};
const deadEndLoop=[home,east11,spurTip,east11,east22,northEast,north22,home];
const excursion=Tour.loopQuality(deadEndLoop,92);
assert.ok(excursion.overlap<.19,"small spur has low TOTAL percentage of reused road");
assert.ok(excursion.maxBacktrackKm>.9,"reversed roadside spur is detected");
assert.equal(excursion.ok,false,"small dead-end excursion is not a valid scenic loop");
const smoothLoop=[home,east22,northEast,north22,home];
const smooth=Tour.loopQuality(smoothLoop,90);
assert.equal(smooth.ok,true,"clean polygon loop must be allowed");
assert.ok(smooth.maxBacktrackKm<.45,"clean route has no repeated backwards road");
console.log("PASS: 12 candidates, distance goals, reject tiny out-and-back spurs, keep clean loops and navigation steps");
