"use strict";
// keepNearRaw lives inside replay.js (browser IIFE): load just those functions.
const test=require("node:test");
const assert=require("node:assert/strict");
const src=require("fs").readFileSync(require("path").join(__dirname,"..","replay.js"),"utf8");
function grab(n){const i=src.indexOf("function "+n+"(");let d=0,j=src.indexOf("{",i);for(;;j++){if(src[j]==="{")d++;else if(src[j]==="}"){d--;if(!d)break}}return (src.slice(Math.max(0,i-6),i)==="async "?"async ":"")+src.slice(i,j+1)}
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
test("replay: dense road matching in chunks, failed chunk keeps the rider's GPS",async()=>{
 const names=["geoKm","interpolate","pathLength","resamplePath","appendUniquePath","thinForMatch","chunkMatchOk","matchOsrmChunk","matchDenseOsrm"];
 const urls=[];let call=0;
 const fakeFetch=async url=>{
  urls.push(url);call++;
  if(call===2)return {ok:false,status:429,json:async()=>({})};
  const coords=url.split("/driving/")[1].split("?")[0].split(";").map(c=>c.split(",").map(Number));
  // "road" 8 m east of the GPS points
  return {ok:true,json:async()=>({matchings:[{geometry:{coordinates:coords.map(([lng,lat])=>[lng+0.0001,lat])}}]})};
 };
 const make=new Function("fetch","AbortController",names.map(grab).join("\n")+";return matchDenseOsrm");
 const matchDenseOsrm=make(fakeFetch,AbortController);
 const raw=[];const t0=Date.UTC(2026,9,10,16,0)/1000*1000;
 for(let i=0;i<400;i++)raw.push({lat:40.8+i*0.0002,lng:31.1,alt:0,time:t0+i*2000});
 const r=await matchDenseOsrm(raw);
 assert.ok(urls.length>=2,"split into chunks");
 assert.ok(urls.every(u=>/radiuses=25;/.test(u)),"25 m radius");
 assert.ok(/timestamps=\d+;\d+/.test(urls[0]),"GPS times sent");
 assert.ok(urls[0].split("/driving/")[1].split("?")[0].split(";").length<=90,"max 90 points per request");
 assert.equal(r.ok,urls.length-1,"one chunk failed");
 const onGps=r.path.filter(p=>Math.abs(p.lng-31.1)<0.00002).length,onRoad=r.path.filter(p=>Math.abs(p.lng-31.1001)<0.00002).length;
 assert.ok(onGps>0&&onRoad>0,"failed chunk kept as GPS, others snapped");
});
