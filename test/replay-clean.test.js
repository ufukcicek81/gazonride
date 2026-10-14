"use strict";
// keepNearRaw lives inside replay.js (browser IIFE): load just those functions.
const test=require("node:test");
const assert=require("node:assert/strict");
const src=require("fs").readFileSync(require("path").join(__dirname,"..","replay.js"),"utf8");
function grab(n){const i=src.indexOf("function "+n+"(");let d=0,j=src.indexOf("{",i);for(;;j++){if(src[j]==="{")d++;else if(src[j]==="}"){d--;if(!d)break}}return src.slice(i,j+1)}
const keepNearRaw=new Function(grab("geoKm")+grab("segDistKm")+grab("keepNearRaw")+";return keepNearRaw")();
test("replay: matched path keeps the real road, drops side-road detours",()=>{
 const raw=[];for(let i=0;i<300;i++)raw.push({lat:40.8+i*0.00015,lng:31.1+i*0.00005});
 const onRoad=p=>Math.abs(p.lng-(31.1+(p.lat-40.8)/0.00015*0.00005))<0.0004;
 // other carriageway (~12 m) everywhere + a ~120 m detour at 100..110
 const m=raw.map((p,i)=>({lat:p.lat,lng:p.lng+0.00014+(i>=100&&i<=110?0.0014*Math.sin((i-100)/10*Math.PI):0)}));
 const out=keepNearRaw(raw,m,.03);
 assert.ok(out.every(onRoad),"no detour points left");
 assert.ok(out.length>=285,"road points kept");
});
