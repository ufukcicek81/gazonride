"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const store={};
globalThis.localStorage={getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=String(v)}};
const M=require("../gazon-marks.js");
test("mark record from position, unknown type becomes a pin",()=>{
 const m=M.make("water",{lat:40.84123456,lon:31.16},1000);
 assert.equal(m.type,"water");assert.equal(m.lat,40.841235);assert.equal(m.lng,31.16);assert.equal(m.ts,1000);
 assert.equal(M.make("nope",{lat:1,lng:2}).type,"pin");
 assert.equal(M.make("water",null),null);
 assert.equal(M.make("water",{lat:NaN,lon:1}),null);
});
test("marks of a ride are the ones inside its time window",()=>{
 store.gazon_marks=JSON.stringify([{id:"a",ts:100},{id:"b",ts:200},{id:"c",ts:300}]);
 assert.deepEqual(M.between(150,300).map(m=>m.id),["b","c"]);
 M.remove("b");
 assert.deepEqual(M.read().map(m=>m.id),["a","c"]);
});
test("every type has label, icon and colour",()=>{
 for(const t of M.TYPES){assert.ok(t.label&&t.icon&&/^#/.test(t.color),t.id)}
 assert.ok(M.TYPES.some(t=>t.id==="rest"),"mola yeri");
});
