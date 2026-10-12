"use strict";
// UI-side tour helpers. Planning scenarios live in test/tour-engine.test.js.
const assert=require("node:assert/strict");
const Tour=require("./gazon-tour.js");
const home={lat:40.875,lon:30.95};
function distance(a,b){
 const r=Math.PI/180;
 const dlat=(b.lat-a.lat)*r,dlon=(b.lon-a.lon)*r;
 const h=Math.sin(dlat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dlon/2)**2;
 return 12742.0176*Math.asin(Math.min(1,Math.sqrt(h)));
}
(async()=>{
 const middle=[Tour.offset(home,20,12),Tour.offset(home,100,15),Tour.offset(home,200,11)];
 const u=new URL(Tour.externalUrl({origin:home,middle}));
 assert.equal(u.origin,"https://www.google.com");
 assert.equal(u.searchParams.get("origin"),"40.875000,30.950000");
 assert.equal(u.searchParams.get("destination"),"40.875000,30.950000","return to start");
 assert.equal(u.searchParams.get("waypoints").split("|").length,3,"all stops preserved");
 assert.equal(Tour.offset(null,90,20),null);
 assert.ok(Math.abs(distance(home,Tour.offset(home,65,12))-12)<.01);
 assert.equal(Tour.extractSteps({legs:[{steps:[{distanceMeters:250,maneuver:"TURN_LEFT",endLocation:{lat:40,lon:31}}]}]}).length,1);
 // Google adapter: request shape and parsed response.
 let sent=null;
 const Route={computeRoutes:async req=>{sent=req;return {routes:[{path:[{lat:()=>40.875,lng:()=>30.95},{lat:40.9,lng:31},{lat:40.875,lng:30.95}],
  distanceMeters:51200,durationMillis:3600000,legs:[{steps:[{distanceMeters:51200,maneuver:"STRAIGHT",endLocation:{lat:40.875,lng:30.95}}]}]}]}}};
 const route=await Tour.googleRouter(Route)({origin:home,destination:home,intermediates:middle,avoidHighways:true});
 assert.equal(sent.travelMode,"DRIVING");
 assert.equal(sent.routingPreference,"TRAFFIC_AWARE","same preference as the route token request");
 assert.equal(sent.intermediates.length,3);
 assert.deepEqual(sent.routeModifiers,{avoidHighways:true});
 assert.equal(route.km,51.2);
 assert.equal(route.points.length,3);
 assert.equal(route.steps.length,1);
 assert.equal(await Tour.googleRouter({computeRoutes:async()=>({routes:[]})})({origin:home,destination:home,intermediates:[]}),null);
 const bent=[home,Tour.offset(home,0,1),Tour.offset(Tour.offset(home,0,1),90,1),Tour.offset(home,90,1)];
 assert.ok(Tour.curvature(bent,3)>Tour.curvature([home,Tour.offset(home,0,1),Tour.offset(home,0,2)],2));
 console.log("PASS: tour UI helpers, Google adapter, external fallback URL");
})().catch(e=>{console.error(e);process.exit(1)});
