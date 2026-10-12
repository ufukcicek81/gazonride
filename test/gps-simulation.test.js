"use strict";
// Simulated motorcycle GPS traces through the navigation pipeline:
// GpsFilter -> progress engine -> off-route detector.
const test=require("node:test");
const assert=require("node:assert/strict");
const {GpsFilter,zoomForSpeed,interpolate,course}=require("../gazon-camera.js");
const {Engine,OffRouteDetector}=require("../gazon-nav-progress.js");
const E=require("../gazon-tour-engine.js");

function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296}}
function gauss(r){return Math.sqrt(-2*Math.log(r()+1e-12))*Math.cos(2*Math.PI*r())}
const home={lat:40.875,lon:30.95};
// 20 km closed loop with bends.
function loopRoute(){
 const pts=[];
 for(let i=0;i<=400;i++){const t=i/400*2*Math.PI;
  pts.push(E.offset(E.offset(home,90,3.2),270+t*180/Math.PI,3.2+.25*Math.sin(5*t)))}
 pts[0]=pts[pts.length-1];
 return pts;
}
// Drive along a polyline at speedMs, 1 Hz fixes with noise.
function drive(route,speedMs,seed,noiseM){
 const r=rng(seed),m=E.measure(route),fixes=[];let t=Date.now()-3600e3;
 for(let at=0;at<=m.total;at+=speedMs/1000){
  const p=E.pointAt(m,at),n=noiseM||4;
  const q=E.offset(p,360*r(),Math.abs(gauss(r))*n/1000)||p;
  const ahead=E.pointAt(m,Math.min(m.total,at+.02));
  fixes.push({lat:q.lat,lon:q.lon,ts:t,accuracy:6+4*r(),speed:speedMs,heading:course(p,ahead),trueAt:at});
  t+=1000;
 }
 return {fixes,total:m.total};
}

test("noisy loop ride: monotonic progress, no false arrival at the start, live remaining km",()=>{
 const route=loopRoute(),filter=GpsFilter(),nav=new Engine();
 const steps=[{distance:5000,instruction:{maneuver:"TURN_LEFT"}},{distance:5000,instruction:{maneuver:"TURN_RIGHT"}},{distance:5000,instruction:{maneuver:"STRAIGHT"}},{distance:5000,instruction:{maneuver:"DESTINATION"}}];
 const m=E.measure(route);
 nav.initialize(route,steps,m.total,m.total/15);
 const {fixes}=drive(route,15,11,5);
 let last=-1,remainingPrev=Infinity;
 fixes.forEach((f,i)=>{
  const g=filter.accept(f);assert.ok(g.accepted,"clean fix accepted");
  const s=nav.update(g.point,f.ts,f.accuracy);
  assert.ok(s.progressMeters>=last,"progress never goes backwards");
  last=s.progressMeters;
  if(i<30){
   assert.ok(s.remainingMeters>m.total*1000-600,"no 0 km at departure of a loop");
   assert.ok(s.stepIndex<steps.length-1,"no arrival maneuver at departure");
  }
  if(i%60===0){assert.ok(s.remainingMeters<=remainingPrev);remainingPrev=s.remainingMeters}
 });
 const end=nav.state();
 assert.ok(end.remainingMeters<250,"arrives only at the end of the loop");
 assert.equal(end.stepIndex,steps.length-1);
});

test("GPS jumps (multipath) are rejected; a tunnel exit is accepted",()=>{
 const route=loopRoute(),filter=GpsFilter();
 const {fixes}=drive(route,20,5,3);
 let rejected=0;
 fixes.slice(0,200).forEach((f,i)=>{
  let fix=f;
  if(i%25===10){const j=E.offset(f,45,.35);fix=Object.assign({},f,{lat:j.lat,lon:j.lon})} // 350 m spike
  const r=filter.accept(fix);
  if(i%25===10){assert.equal(r.accepted,false,"spike "+i+" rejected");rejected++}
 });
 assert.ok(rejected>=7);
 // Tunnel: 45 s without fixes, then the rider appears 900 m further.
 const before=fixes[200],after=fixes[245];
 const r=filter.accept(after);
 assert.ok(r.accepted,"plausible after a gap ("+((after.ts-before.ts)/1000)+" s)");
 // Inaccurate and invalid fixes
 assert.equal(filter.accept(Object.assign({},fixes[246],{accuracy:140})).reason,"accuracy");
 assert.equal(filter.accept({lat:NaN,lon:1,ts:1,accuracy:5}).reason,"invalid");
 assert.equal(filter.accept(Object.assign({},fixes[100])).reason,"stale","old timestamp");
});

test("persistent jump means the rider really moved (filter recovers)",()=>{
 const f=GpsFilter(),t=Date.now();
 assert.ok(f.accept({lat:40.875,lon:30.95,ts:t,accuracy:5,speed:0}).accepted);
 let ok=false;
 for(let i=1;i<=6;i++){const r=f.accept({lat:40.9,lon:30.95,ts:t+i*1000,accuracy:5});if(r.accepted){ok=true;break}}
 assert.ok(ok,"does not get stuck forever");
});

test("heading: smooth, wraps over north, frozen while stopped",()=>{
 const f=GpsFilter(),t=Date.now();let p={lat:40.875,lon:30.95};
 const step=(deg,i,speed)=>{p=E.offset(p,deg,(speed||14)/1000)||p;return f.accept({lat:p.lat,lon:p.lon,ts:t+i*1000,accuracy:5,speed:speed==null?14:speed,heading:deg})};
 step(350,0);let h;
 for(let i=1;i<8;i++)h=step(i%2?355:5,i).heading;
 assert.ok(h>340||h<20,"stays around north, no 360° spin: "+h);
 const before=f.heading;
 const parked=f.accept({lat:p.lat+.00001,lon:p.lon,ts:t+20000,accuracy:5,speed:0,heading:180});
 assert.equal(parked.heading,before,"no rotation at a traffic light");
});

test("off-route: reroute after clear deviation only",()=>{
 const d=OffRouteDetector(),t=Date.now();
 assert.equal(d.update(160,8,t),false);
 assert.equal(d.update(30,8,t+1000),false,"back on road resets");
 assert.equal(d.update(180,90,t+2000),false,"inaccurate fix ignored");
 let fired=false;
 for(let i=0;i<10&&!fired;i++)fired=d.update(150+i*20,8,t+3000+i*1000);
 assert.ok(fired,"real detour triggers reroute");
 assert.equal(d.update(400,8,t+14000),false,"no reroute storm");
});

test("off-route on a simulated wrong turn",()=>{
 const route=loopRoute(),nav=new Engine(),det=OffRouteDetector(),m=E.measure(route);
 nav.initialize(route,[],m.total,1000);
 const {fixes}=drive(route,15,3,3);
 for(const f of fixes.slice(0,60))nav.update(f,f.ts,f.accuracy);
 // Wrong turn: ride straight away from the road for 40 s.
 let p=fixes[59],fired=false,t=fixes[59].ts;
 for(let i=1;i<=40&&!fired;i++){
  p=E.offset(p,course(fixes[58],fixes[59])+90,.015);t+=1000;
  const s=nav.update(p,t,6);
  fired=det.update(s.accuracyMeters,6,t);
 }
 assert.ok(fired,"wrong turn detected and rerouted");
});

test("camera helpers: zoom by speed, interpolation never spins",()=>{
 assert.ok(zoomForSpeed(3,"3d")>zoomForSpeed(30,"3d"),"zoom out when fast");
 assert.ok(zoomForSpeed(10,"3d")>zoomForSpeed(10,"2d"));
 const a={lat:0,lon:0,heading:350,zoom:17,tilt:55},b={lat:1,lon:1,heading:10,zoom:16,tilt:55};
 const mid=interpolate(a,b,.5);
 assert.ok(mid.heading<1||mid.heading>359,"350 -> 10 goes through north: "+mid.heading);
 assert.equal(interpolate(a,b,2).lat,1,"clamped");
});
