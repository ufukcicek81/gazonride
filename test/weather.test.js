"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const W=require("../gazon-weather.js");
// ~100 km straight north, 2 h
const pts=[];for(let i=0;i<=100;i++)pts.push({lat:40+i*0.009,lon:31});
test("sampleRoute: start/end included, ~25 km apart, arrival time per point",()=>{
 const t0=Date.UTC(2026,9,23,8,0);
 const s=W.sampleRoute(pts,100,7200,t0);
 assert.equal(s.length,5);
 assert.equal(s[0].km,0);assert.equal(s[0].eta,t0);
 assert.ok(Math.abs(s[4].km-s[4].km)<1e-9&&Math.abs(s[4].eta-(t0+7200e3))<1000,"arrives after 2 h");
 assert.ok(Math.abs(s[2].eta-(t0+3600e3))<60e3,"half way after ~1 h");
 assert.ok(W.sampleRoute(pts,100,7200,t0,1,8).length<=8,"capped");
 assert.deepEqual(W.sampleRoute([{lat:1,lon:1}],0,0,t0),[]);
});
test("atTime picks the forecast hour closest to arrival",()=>{
 const base=Date.UTC(2026,9,23,0,0)/1000,h={time:[],temperature_2m:[],precipitation_probability:[],weather_code:[],wind_speed_10m:[],wind_gusts_10m:[],precipitation:[],visibility:[]};
 for(let i=0;i<24;i++){h.time.push(base+i*3600);h.temperature_2m.push(i);h.precipitation_probability.push(i*4);h.weather_code.push(0);h.wind_speed_10m.push(10);h.wind_gusts_10m.push(20);h.precipitation.push(0);h.visibility.push(20000)}
 const w=W.atTime(h,Date.UTC(2026,9,23,9,20));
 assert.equal(w.temp,9);assert.equal(w.pop,36);
 assert.equal(W.atTime(h,Date.UTC(2026,9,26,0,0)),null,"too far from any hour");
});
test("motorcycle warnings",()=>{
 assert.deepEqual(W.warnings({temp:18,pop:10,code:1,wind:12,gust:25,vis:20000,rain:0}),[]);
 const ids=W.warnings({temp:2,pop:70,code:95,wind:40,gust:62,vis:600,rain:2}).map(x=>x.id);
 assert.deepEqual(ids,["storm","rain","wind","ice","fog"]);
 const first=W.routeWarnings([{km:0,eta:1,w:{temp:15,pop:0,code:0}},{km:40,eta:2,w:{temp:12,pop:80,code:61}},{km:80,eta:3,w:{temp:11,pop:90,code:63}}]);
 assert.equal(first.length,1);assert.equal(first[0].km,40,"first place the rain starts");
 assert.equal(W.describe(0).label,"Açık");assert.equal(W.describe(63).label,"Yağmur");
});
