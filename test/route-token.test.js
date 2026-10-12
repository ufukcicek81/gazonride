"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const T=require("../gazon-route-token.js");

function encode(points){
 let out="",pl=0,pg=0;
 const enc=v=>{v=v<0?~(v<<1):v<<1;let s="";while(v>=32){s+=String.fromCharCode((32|(v&31))+63);v>>=5}return s+String.fromCharCode(v+63)};
 for(const p of points){const la=Math.round(p.lat*1e5),lo=Math.round(p.lon*1e5);out+=enc(la-pl)+enc(lo-pg);pl=la;pg=lo}
 return out;
}
const home={lat:40.875,lon:30.95},dest={lat:40.95,lon:31.2};
const roadA=Array.from({length:60},(_,i)=>({lat:home.lat+(dest.lat-home.lat)*i/59,lon:home.lon+(dest.lon-home.lon)*i/59}));
const roadB=Array.from({length:60},(_,i)=>({lat:home.lat+(dest.lat-home.lat)*i/59+.05*Math.sin(Math.PI*i/59),lon:home.lon+(dest.lon-home.lon)*i/59}));

test("polyline decoder round-trips",()=>{
 const d=T.decode(encode(roadA));
 assert.equal(d.length,roadA.length);
 d.forEach((p,i)=>{assert.ok(Math.abs(p.lat-roadA[i].lat)<1e-5);assert.ok(Math.abs(p.lon-roadA[i].lon)<1e-5)});
});

test("request body keeps identical stop order and token-compatible options",()=>{
 const mids=[{lat:41,lon:31},{lat:41.1,lon:31.2}];
 const b=T.body({origin:home,destination:home,intermediates:mids,avoidHighways:true});
 assert.equal(b.travelMode,"DRIVE");
 assert.equal(b.routingPreference,"TRAFFIC_AWARE");
 assert.equal(b.intermediates.length,2);
 assert.equal(b.intermediates[1].location.latLng.latitude,41.1);
 assert.ok(!b.intermediates.some(x=>x.via),"no via waypoints (not allowed with tokens)");
 assert.equal(b.computeAlternativeRoutes,false,"alternatives impossible with intermediates");
 assert.deepEqual(b.routeModifiers,{avoidTolls:false,avoidHighways:true});
 assert.equal(T.body({origin:null,destination:home}),null);
});

test("selects the token of the alternative the rider chose",async()=>{
 let sent=null;
 const fetch=async(url,init)=>{sent={url,init};return {ok:true,json:async()=>({routes:[
  {routeToken:"tokA",distanceMeters:24000,polyline:{encodedPolyline:encode(roadA)}},
  {routeToken:"tokB",distanceMeters:27000,polyline:{encodedPolyline:encode(roadB)}}]})}};
 const r=await T.fetchToken({origin:home,destination:dest,alternatives:true,matchPoints:roadB,matchKm:27},{key:"k",fetch});
 assert.equal(r.token,"tokB");
 assert.match(sent.url,/routes\.googleapis\.com/);
 assert.equal(sent.init.headers["X-Goog-Api-Key"],"k");
 assert.match(sent.init.headers["X-Goog-FieldMask"],/routes\.routeToken/);
 assert.equal(JSON.parse(sent.init.body).computeAlternativeRoutes,true);
});

test("never uses a token for a different road",async()=>{
 const fetch=async()=>({ok:true,json:async()=>({routes:[{routeToken:"tokA",distanceMeters:24000,polyline:{encodedPolyline:encode(roadA)}}]})});
 assert.equal(await T.fetchToken({origin:home,destination:dest,matchPoints:roadB,matchKm:27},{key:"k",fetch}),null);
});

test("errors, HTTP failures and missing key fall back to null",async()=>{
 assert.equal(await T.fetchToken({origin:home,destination:dest},{key:"k",fetch:async()=>({ok:false})}),null);
 assert.equal(await T.fetchToken({origin:home,destination:dest},{key:"k",fetch:async()=>{throw new Error("cors")}}),null);
 assert.equal(await T.fetchToken({origin:home,destination:dest},{key:"",fetch:async()=>({ok:true})}),null);
});
