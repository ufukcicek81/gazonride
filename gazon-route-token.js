/* GaZonRide route token bridge.
 * Google Navigation SDK can drive EXACTLY the route chosen on the map when it
 * receives a Routes API "route token" for the same waypoints. This module asks
 * the Routes REST API for that token. Any failure returns null and the caller
 * falls back to waypoint-only native navigation (older behaviour).
 * Token rules: travelMode DRIVE, routingPreference TRAFFIC_AWARE, no via
 * waypoints, and the native app must use the identical stop list.
 */
(function(root){
"use strict";
var ENDPOINT="https://routes.googleapis.com/directions/v2:computeRoutes";
var FIELDS="routes.routeToken,routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline";
function point(p){
 if(!p)return null;
 var lat=Number(typeof p.lat==="function"?p.lat():p.lat);
 var raw=p.lon!=null?p.lon:(typeof p.lng==="function"?p.lng():p.lng);
 var lon=Number(raw);
 return isFinite(lat)&&isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180?{lat:lat,lon:lon}:null;
}
function decode(str){
 var out=[],index=0,lat=0,lng=0;
 str=String(str||"");
 while(index<str.length){
  var b,shift=0,result=0;
  do{b=str.charCodeAt(index++)-63;result|=(b&31)<<shift;shift+=5}while(b>=32&&index<str.length);
  lat+=(result&1)?~(result>>1):(result>>1);
  shift=0;result=0;
  do{b=str.charCodeAt(index++)-63;result|=(b&31)<<shift;shift+=5}while(b>=32&&index<str.length);
  lng+=(result&1)?~(result>>1):(result>>1);
  out.push({lat:lat/1e5,lon:lng/1e5});
 }
 return out;
}
function cells(points){
 var set=new Set();
 (points||[]).forEach(function(p){p=point(p);if(p)set.add(Math.round(p.lat*200)+":"+Math.round(p.lon*200))});
 return set;
}
function overlap(a,b){
 var inter=0;a.forEach(function(k){if(b.has(k))inter++});
 return inter/Math.max(1,Math.min(a.size,b.size));
}
function location(p){return {location:{latLng:{latitude:p.lat,longitude:p.lon}}}}
function apiKey(){
 var key=root.GAZONRIDE_GOOGLE_MAPS_API_KEY||"";
 try{if(!key&&root.AndroidBridge&&typeof root.AndroidBridge.getGoogleMapsApiKey==="function")key=String(root.AndroidBridge.getGoogleMapsApiKey()||"")}catch(e){}
 return key&&key.indexOf("__")!==0?key:"";
}
// Build the REST body. Exported for tests: the native app must receive the
// same origin / intermediates / destination order.
function body(req){
 var origin=point(req.origin),destination=point(req.destination);
 if(!origin||!destination)return null;
 var mids=(req.intermediates||[]).map(point);
 if(mids.some(function(p){return !p}))return null;
 var b={origin:location(origin),destination:location(destination),
  intermediates:mids.map(location),travelMode:"DRIVE",routingPreference:"TRAFFIC_AWARE",
  computeAlternativeRoutes:!!req.alternatives&&!mids.length,languageCode:"tr-TR",units:"METRIC"};
 if(req.avoidTolls||req.avoidHighways)b.routeModifiers={avoidTolls:!!req.avoidTolls,avoidHighways:!!req.avoidHighways};
 return b;
}
/* fetchToken({origin,destination,intermediates,avoidTolls,avoidHighways,
 *   alternatives,matchPoints,matchKm}) -> Promise<{token,km,match}|null>
 * With matchPoints the returned route must share most of its road with the
 * route the rider selected; otherwise no token is used. */
function fetchToken(req,opts){
 opts=opts||{};
 var key=opts.key||apiKey(),doFetch=opts.fetch||root.fetch;
 var b=body(req||{});
 if(!key||!b||typeof doFetch!=="function")return Promise.resolve(null);
 var timeout=null,controller=typeof AbortController!=="undefined"?new AbortController():null;
 if(controller)timeout=setTimeout(function(){try{controller.abort()}catch(e){}},opts.timeoutMs||8000);
 return Promise.resolve(doFetch(ENDPOINT,{method:"POST",
  headers:{"Content-Type":"application/json","X-Goog-Api-Key":key,"X-Goog-FieldMask":FIELDS},
  body:JSON.stringify(b),signal:controller?controller.signal:undefined}))
 .then(function(res){if(!res||!res.ok)return null;return res.json()})
 .then(function(json){
  var routes=json&&Array.isArray(json.routes)?json.routes:[];
  var target=req.matchPoints?cells(req.matchPoints):null,best=null,bestScore=-1;
  routes.forEach(function(r){
   if(!r||!r.routeToken)return;
   var km=Number(r.distanceMeters||0)/1000,score=1;
   if(target){
    score=overlap(target,cells(decode(r.polyline&&r.polyline.encodedPolyline)));
    if(req.matchKm>0)score-=Math.min(.5,Math.abs(km-req.matchKm)/req.matchKm);
   }
   if(score>bestScore){bestScore=score;best={token:String(r.routeToken),km:km,match:score}}
  });
  // A token for a DIFFERENT road would make native guidance disagree with
  // the map preview; reject anything under 80% shared road.
  if(!best||(target&&bestScore<.8))return null;
  return best;
 })
 .catch(function(){return null})
 .then(function(r){if(timeout)clearTimeout(timeout);return r});
}
var api={fetchToken:fetchToken,body:body,decode:decode,cells:cells,overlap:overlap};
root.GaZonRouteToken=api;
if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
