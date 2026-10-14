"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const J=require("../gazon-journal.js");
test("route thumbnail: start/end markers, empty track -> no svg",()=>{
 const t=[[40.87,30.95],[40.88,30.97],[40.9,30.96],[40.87,30.95]];
 const svg=J.thumb(t);
 assert.match(svg,/^<svg/);assert.equal((svg.match(/<circle/g)||[]).length,2);
 assert.equal(J.thumb([]),"");assert.equal(J.thumb([[1,2]]),"");
});
test("ride stats and mood line",()=>{
 const r={km:26.2,duration:"01:03:00",elev:205,turns:67,moods:["Keyifli","Sakin"]};
 assert.equal(J.avgSpeed(r),25);
 assert.match(J.stats(r),/26\.2 km · 01:03:00 · ⌀ 25 km\/sa · ↑ 205 m · 67 viraj/);
 assert.equal(J.moodLine(r),"Günün hissi: Keyifli, Sakin");
 assert.equal(J.moodLine({}),"");
 assert.match(J.card({km:1,track:[],destination:"<b>x</b>"}),/&lt;b&gt;x/,"escapes user text");
});
test("ride card v2: moving time, title, map with tiles",()=>{
 const t=[];let la=40.84,lo=31.16,ts=new Date(2026,9,12,21,0).getTime();
 for(let i=0;i<120;i++){la+=.0002;t.push([la,lo,100,ts+=2000])}
 // A 90-minute stop at the end must not count as riding time.
 t.push([la,lo,100,ts+5400000]);
 const m=J.metrics({km:2.6,duration:"01:30:57",track:t});
 assert.ok(m.sec>200&&m.sec<260,"moving time only, got "+m.sec);
 assert.ok(m.avg>30&&m.avg<45,"avg "+m.avg);
 const short=[[40.84,31.16,0,1e12],[40.8405,31.16,0,1e12+20000],[40.841,31.16,0,1e12+40000],[40.841,31.16,0,1e12+5460000]];
 assert.ok(J.metrics({km:.2,duration:"01:31:00",track:short}).sec<=60,"short ride keeps its real moving time");
 assert.equal(J.metrics({km:3,duration:"00:20:00",track:[[1,2],[1.01,2]]}).sec,1200,"old rides without timestamps use stored time");
 assert.equal(J.rideTitle({track:t}),"12 Ekim Pazartesi · Akşam sürüşü");
 assert.equal(J.rideTitle({destination:"Abant",track:t}),"Abant");
 assert.equal(J.fmtDur(3780),"1sa 3dk");
 const svg=J.mapView(t);
 assert.equal((svg.match(/<circle/g)||[]).length,2);assert.doesNotMatch(svg,/<img/,"no key, no static map");
 globalThis.GAZONRIDE_GOOGLE_MAPS_API_KEY="k1";
 const withKey=J.mapView(t);delete globalThis.GAZONRIDE_GOOGLE_MAPS_API_KEY;
 assert.match(withKey,/maps\.googleapis\.com\/maps\/api\/staticmap\?/);assert.match(withKey,/enc%3A/);assert.match(withKey,/key=k1/);
 assert.equal(J.mapView([]),"");
 assert.match(J.rideCard({destination:"<b>x</b>",track:[]}),/&lt;b&gt;x/,"escapes user text");
});
test("removeSpurs: cuts an out-and-back detour, keeps a roundabout and a straight road",()=>{
 const step=0.00018; // ~20 m north per point
 const road=[];for(let i=0;i<30;i++)road.push({lat:40.8+i*step,lng:31.1});
 // detour at point 10: 60 m east into a station and the same way back
 const spur=[1,2,3,2,1].map(k=>({lat:road[10].lat,lng:31.1+k*0.00024}));
 const withSpur=road.slice(0,11).concat(spur,road.slice(10));
 const out=J.removeSpurs(withSpur);
 assert.ok(out.every(p=>p.lng<31.1001),"detour points removed");
 assert.ok(out.length>=29&&out.length<=31);
 assert.equal(J.removeSpurs(road).length,road.length,"straight road untouched");
 // roundabout: 270° around a 30 m circle -> kept
 const c={lat:40.81,lng:31.12},ring=[];
 for(let a=0;a<=270;a+=15){const r=a*Math.PI/180;ring.push({lat:c.lat+0.00027*Math.cos(r),lon:c.lng+0.00036*Math.sin(r)})}
 assert.equal(J.removeSpurs(ring).length,ring.length,"loop kept");
});
