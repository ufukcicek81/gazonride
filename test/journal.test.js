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
 assert.equal(J.rideTitle({track:t}),"12 Ekim Pazartesi · Akşam sürüşü");
 assert.equal(J.rideTitle({destination:"Abant",track:t}),"Abant");
 assert.equal(J.fmtDur(3780),"1sa 3dk");
 const svg=J.mapView(t);
 assert.match(svg,/basemaps\.cartocdn\.com/);assert.equal((svg.match(/<circle/g)||[]).length,2);
 assert.equal(J.mapView([]),"");
 assert.match(J.rideCard({destination:"<b>x</b>",track:[]}),/&lt;b&gt;x/,"escapes user text");
});
