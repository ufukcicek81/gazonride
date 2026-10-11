"use strict";
const assert=require("node:assert/strict");
const r=require("./gazon-native-route.js");
const home={lat:40.875,lon:30.95},end={lat:40.92,lon:31.12};
const line=[];
for(let i=0;i<=100;i++){
 const f=i/100;
 line.push({lat:home.lat+(end.lat-home.lat)*f+.008*Math.sin(f*Math.PI*3),
  lon:home.lon+(end.lon-home.lon)*f});
}
const stops=r.routeStops(line,end,4);
assert.ok(stops.length>=3&&stops.length<=5,"ordered intermediate points and destination");
assert.deepEqual(stops[stops.length-1],end,"final destination remains exact");
assert.notDeepEqual(stops[0],end,"first intermediate is not the destination");
stops.forEach(p=>assert.ok(Number.isFinite(p.lat)&&Number.isFinite(p.lon)));
assert.deepEqual(r.routeStops([home,end],end),[end],"two-point path has no fake via");
assert.deepEqual(r.routeStops([],null),[],"invalid target not launched");
const short=[home,{lat:home.lat+.001,lon:home.lon+.001},end={lat:home.lat+.0015,lon:home.lon+.002}];
assert.equal(r.routeStops(short,end).length,1,"short drive uses destination only");
const loop=[];
for(let i=0;i<=100;i++){
 const t=i*Math.PI*2/100;
 loop.push({lat:home.lat+.045*Math.sin(t),lon:home.lon+.07*(1-Math.cos(t))});
}
const roundTrip=r.routeStops(loop,home,5);
assert.ok(roundTrip.length>3&&roundTrip.length<=6,"roundtrip path has intermediate points");
assert.deepEqual(roundTrip[roundTrip.length-1],home,"roundtrip destination is origin");
assert.ok(roundTrip.slice(0,-1).some(x=>r.distance(x,home)>1000),"loop is not shortcut");
console.log("PASS: preserve intermediate road geometry, maintain destination and loop, reject invalid targets");
