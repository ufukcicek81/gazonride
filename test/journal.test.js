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
