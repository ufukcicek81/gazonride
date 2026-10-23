"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const M=require("../gazon-myroutes.js");
const t0=1791614911000;
function ride(){ // 10 min ride, 6 min stop at a café in the middle, 1 min wait at the end
 const t=[];let la=40.80,ts=t0;
 for(let i=0;i<60;i++){t.push([la,31.1,100,ts]);la+=0.0004;ts+=5000}
 for(let i=0;i<36;i++){t.push([la+(i%3)*0.00002,31.1+(i%2)*0.00002,100,ts]);ts+=10000} // stopped, GPS jitter
 for(let i=0;i<60;i++){la+=0.0004;t.push([la,31.1,100,ts]);ts+=5000}
 for(let i=0;i<6;i++){t.push([la,31.1,100,ts]);ts+=10000}
 return t;
}
test("detectStops: a 6 min café stop is found, short waits and the end are not",()=>{
 const s=M.detectStops(ride());
 assert.equal(s.length,1);
 assert.ok(s[0].sec>=340&&s[0].sec<=420,"about 6 minutes: "+s[0].sec);
 assert.ok(Math.abs(s[0].lat-(40.80+59*0.0004))<0.001);
 assert.deepEqual(M.detectStops([]),[]);
});
test("buildRequest: start, via points, rest stops as stopovers, avoid options",()=>{
 const r=M.buildRequest([{lat:40,lon:31,type:"start"},{lat:40.5,lon:31.2,type:"via"},{lat:40.7,lon:31.3,type:"rest"},{lat:41,lon:31.5,type:"end"}],{avoidHighways:true});
 assert.deepEqual(r.origin,{lat:40,lng:31});assert.deepEqual(r.destination,{lat:41,lng:31.5});
 assert.equal(r.intermediates.length,2);
 assert.equal(r.intermediates[0].via,true);assert.equal(r.intermediates[1].vehicleStopover,true);
 assert.deepEqual(r.routeModifiers,{avoidHighways:true,avoidTolls:false});
 assert.equal(M.buildRequest([{lat:1,lon:1}]),null);
});
test("rideToRoute: start, via points along the track, rest stops in order, end",()=>{
 const rd={destination:"Abant",track:ride(),marks:[{type:"rest",lat:40.8,lng:31.1}]};
 rd.stops=M.detectStops(rd.track);
 const r=M.rideToRoute(rd);
 assert.equal(r.points[0].type,"start");assert.equal(r.points[r.points.length-1].type,"end");
 const rests=r.points.filter(p=>p.type==="rest");
 assert.equal(rests.length,2,"detected stop + the rider's own Mola mark");
 assert.ok(r.points.indexOf(rests[0])<r.points.indexOf(rests[1]),"in track order");
 assert.equal(r.name,"Abant rotası");
});
