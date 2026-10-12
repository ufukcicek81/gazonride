"use strict";
const assert=require("node:assert/strict");
const {Engine}=require("./gazon-nav-progress.js");
const gps=new Engine(),now=Date.now();
const a={lat:40.875,lon:30.95},b={lat:40.8755,lon:30.951},c={lat:40.876,lon:30.952};
gps.initialize([a,b,c],[{distance:100,end:b},{distance:100,end:c}],.4,60);
assert.ok(gps.update(a,now-5000,8).valid,"initial GPS is accepted");
const before=gps.state().progressMeters;
assert.ok(gps.heartbeat(a,now,8),"fresh stationary GPS accepted");
assert.equal(gps.state().progressMeters,before,"heartbeat must not advance navigation");
assert.ok(gps.age()<3000,"GPS is not reported lost while stopped");
assert.equal(gps.heartbeat(a,now+10000,8),false,"future GPS rejected");
assert.equal(gps.heartbeat(a,now+100,130),false,"inaccurate GPS rejected");
assert.ok(gps.age()<3000,"invalid fix does not damage fresh GPS state");
// Regression: on a return-to-start tour, the last polyline point is closer
// to current GPS than Google's first road-snapped point. Starting must not
// jump to the FINAL step with "Varış" and zero kilometers remaining.
const tour=new Engine();
const start={lat:40.875,lon:30.95};
const first={lat:40.87535,lon:30.95035};
const east={lat:40.875,lon:30.99};
const northEast={lat:40.905,lon:30.99};
const northWest={lat:40.905,lon:30.95};
const loop=[first,east,northEast,northWest,start];
const steps=[
 {distance:4000,end:east,instruction:{maneuver:"STRAIGHT"}},
 {distance:3500,end:northEast,instruction:{maneuver:"TURN_LEFT"}},
 {distance:3500,end:northWest,instruction:{maneuver:"TURN_LEFT"}},
 {distance:4000,end:start,instruction:{maneuver:"DESTINATION"}}
];
tour.initialize(loop,steps,15,1800);
const firstFix=tour.update(start,now,8);
assert.ok(firstFix.valid,"initial GPS near route start should be accepted");
assert.ok(firstFix.progressMeters<120,"first GPS fix must not match the last segment of a loop");
assert.ok(firstFix.remainingMeters>14000,"full circular tour remains at departure");
assert.ok(firstFix.stepIndex<steps.length-1,"initial maneuver must not be destination");
const nearRoad={lat:40.87534,lon:30.95070};
const secondFix=tour.update(nearRoad,now+2000,8);
assert.ok(secondFix.progressMeters<300,"follow-up GPS cannot teleport to end of circular tour");
assert.ok(secondFix.remainingMeters>14000,"distance must not become 0 immediately");
assert.ok(secondFix.stepIndex<steps.length-1,"arrival announcement is not shown until route completion");
// If GPS is at the endpoint but nowhere near the planned FIRST road section,
// the trip must wait for a real start rather than mark itself completed.
const farStart=new Engine();
const farFirst={lat:40.880,lon:30.950};
farStart.initialize([farFirst,east,northEast,northWest,start],steps,15,1800);
const strayFix=farStart.update(start,now,7);
assert.equal(strayFix.valid,false,"GPS cannot start a loop from its endpoint alone");
assert.equal(strayFix.progressMeters,0,"invalid startup GPS must retain zero driven meters");
assert.ok(strayFix.remainingMeters>14000,"invalid startup GPS cannot complete the tour");
console.log("PASS: fresh GPS heartbeat and circular tour startup / arrival regression");
