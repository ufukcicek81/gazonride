"use strict";
// Tour engine scenarios on a synthetic road network (no Google needed).
const test=require("node:test");
const assert=require("node:assert/strict");
const E=require("../gazon-tour-engine.js");
const {buildNetwork,buildTreeNetwork,dist}=require("./helpers/road-network.js");

const SEEDS=[3,7,19];
const networks=new Map();
function network(seed){if(!networks.has(seed))networks.set(seed,buildNetwork({seed}));return networks.get(seed)}

for(const km of [50,100,150]){
 for(const style of E.STYLES){
  test(`${km} km ${style}: closed loops without gir-çık on several road networks`,async()=>{
   for(const seed of SEEDS){
    const net=network(seed);
    const result=await E.planTours({origin:net.origin,targetKm:km,style,router:net.router});
    assert.ok(result.options.length>=2,`seed ${seed}: at least two alternatives (got ${result.options.length})`);
    assert.ok(result.requests<=30,"API budget respected");
    const best=result.options[0];
    assert.equal(best.level,0,`seed ${seed}: best option is a strict loop`);
    for(const o of result.options){
     const first=o.points[0],last=o.points[o.points.length-1];
     assert.ok(dist(first,net.origin)<.6,"starts at the rider");
     assert.ok(dist(last,net.origin)<.6,"returns to the rider");
     if(o.level===0){
      assert.ok(Math.abs(o.km-km)/km<=.10,`seed ${seed}: ${o.km.toFixed(1)} km within 10% of ${km}`);
      assert.ok(o.maxBacktrackKm<.45,`seed ${seed}: no dead-end excursion (${o.maxBacktrackKm} km)`);
      assert.ok(o.overlap<=.19,"little reused road");
     }
     assert.ok(o.middle.length>=4&&o.middle.length<=7,"4-7 loop corners (Android accepts 8 stops)");
     const stops=E.navigationStops(o);
     assert.equal(stops.length,o.middle.length+1,"navigation receives every preview corner + origin");
     assert.deepEqual(stops.at(-1),{lat:Math.round(net.origin.lat*1e6)/1e6,lon:Math.round(net.origin.lon*1e6)/1e6});
     assert.ok(E.distanceKm(stops[0],net.origin)>1,"first stop is not at the start (no instant arrival)");
     assert.ok(o.token,"route token kept for native navigation");
    }
    // Alternatives must be genuinely different roads.
    for(let i=0;i<result.options.length;i++)for(let j=i+1;j<result.options.length;j++)
     assert.ok(E.similarity(E.cellsOf(result.options[i].points),E.cellsOf(result.options[j].points))<=.72,"distinct alternatives");
   }
  });
 }
}

test("style ordering: very curvy prefers bends, fast prefers speed",async()=>{
 const net=network(7);
 const curvy=await E.planTours({origin:net.origin,targetKm:100,style:"verycurvy",router:net.router});
 const fast=await E.planTours({origin:net.origin,targetKm:100,style:"fast",router:net.router});
 const sorted=(r,style)=>r.options.every((o,i,a)=>i===0||o.level>a[i-1].level||E.score(a[i-1],style,100)>=E.score(o,style,100));
 assert.ok(sorted(curvy,"verycurvy"));
 assert.ok(sorted(fast,"fast"));
});

test("tree-shaped region: degrades to labelled fallback instead of no route",async()=>{
 const tree=buildTreeNetwork({lat:40.875,lon:30.95});
 const r=await E.planTours({origin:{lat:40.875,lon:30.95},targetKm:100,style:"balanced",router:tree.router});
 assert.ok(r.options.length>=1,"rider still gets an option");
 assert.ok(r.options.every(o=>o.relaxed&&o.warning),"each option warns about shared roads");
});

test("router failures: clear error, no crash",async()=>{
 const r=await E.planTours({origin:{lat:40.875,lon:30.95},targetKm:50,style:"fast",router:async()=>{throw new Error("quota")}});
 assert.equal(r.options.length,0);
 assert.equal(r.error,"router-unavailable");
 const none=await E.planTours({origin:{lat:40.875,lon:30.95},targetKm:50,style:"fast",router:async()=>null});
 assert.equal(none.error,"router-unavailable");
 const bad=await E.planTours({origin:null,targetKm:50,router:async()=>null});
 assert.equal(bad.error,"invalid-input");
});

test("partial router failures are tolerated",async()=>{
 const net=network(7);let n=0;
 const flaky=req=>(++n%3===0?Promise.reject(new Error("timeout")):net.router(req));
 const r=await E.planTours({origin:net.origin,targetKm:100,style:"balanced",router:flaky});
 assert.ok(r.options.length>=1);
 assert.ok(r.failures>0);
});

test("cancellation stops API calls",async()=>{
 const net=network(7);let calls=0,stop=false;
 const r=await E.planTours({origin:net.origin,targetKm:150,style:"fast",cancelled:()=>stop,
  router:req=>{calls++;stop=true;return net.router(req)}});
 assert.ok(calls<=3,"only the in-flight batch runs");
 assert.ok(r.options.length<=1);
});

test("rider living on a dead-end street is not rejected",()=>{
 const home={lat:40.875,lon:30.95};
 const junction=E.offset(home,0,1.2);
 const loop=[home,junction,E.offset(junction,60,15),E.offset(junction,0,20),E.offset(junction,-60,15),junction,home];
 const q=E.loopQuality(loop,60);
 assert.ok(q.homeAccessKm>.3,"home access road detected");
 assert.equal(q.ok,true,"loop accepted");
 assert.ok(q.maxBacktrackKm<.45,"home access is not a gir-çık");
});

test("dead-end spur inside a long loop is detected and repaired",()=>{
 const home={lat:40.875,lon:30.95};
 const e11=E.offset(home,90,11),e22=E.offset(home,90,22),n22=E.offset(home,0,22);
 const ne={lat:n22.lat,lon:e22.lon},tip={lat:e11.lat+.015,lon:e11.lon};
 const points=[home,e11,tip,e11,e22,ne,n22,home];
 const q=E.loopQuality(points,92);
 assert.equal(q.ok,false);
 assert.ok(q.spurs.length>=1);
 const corners=[tip,ne,n22];
 const fixed=E.repairSpurs({points},corners,q,home,0);
 assert.ok(fixed,"repair proposed");
 assert.ok(E.distanceKm(fixed.middle[0],e11)<.4,"corner moved back to the spur junction");
 assert.deepEqual(fixed.middle.slice(1),corners.slice(1),"other corners untouched");
});

test("out-and-back on one road is never strict",()=>{
 const home={lat:40.875,lon:30.95},n=k=>E.offset(home,0,k);
 const q=E.loopQuality([home,n(5),n(15),n(30),n(15),n(5),home],60);
 assert.equal(q.ok,false);
 assert.ok(q.overlap>.6);
 assert.equal(E.grade(q,60,60),2,"only usable as labelled fallback");
});

test("shapes: corners scale with target and form a loop through the origin",()=>{
 const o={lat:40.875,lon:30.95};
 for(const km of [50,100,150]){
  const s=E.shapes(o,km,"auto","balanced",8);
  assert.equal(s.length,8);
  const radius=km/(2*Math.PI*1.3);
  s.forEach(shape=>shape.middle.forEach(p=>assert.ok(E.distanceKm(o,p)<=2*radius+.01,"inside the loop circle")));
  // corners are spread to both sides of the heading (real area)
  s.forEach(shape=>{
   const side=shape.middle.map(p=>Math.sign(((E.bearing(o,p)-shape.head+540)%360)-180));
   assert.ok(side.includes(1)&&side.includes(-1));
  });
 }
 const north=E.shapes(o,100,"north","fast",1)[0];
 const centre=north.middle.reduce((a,p)=>({lat:a.lat+p.lat/north.middle.length,lon:a.lon+p.lon/north.middle.length}),{lat:0,lon:0});
 assert.ok(centre.lat>o.lat+.05,"north tours go north");
});
