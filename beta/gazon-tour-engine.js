/* GazOnRide Tour Engine v2
 * Pure, router-agnostic planner for closed motorcycle loops. The browser
 * passes a Google Routes adapter; tests pass a synthetic road network.
 *
 * Pipeline per candidate shape:
 *   1. place 3-4 loop corners on a circle that passes through the origin
 *   2. route origin -> corners -> origin on the real road network
 *   3. repair dead-end "gir-çık" spurs by moving the offending corner back
 *      to the junction where the spur starts, then re-route
 *   4. scale the shape towards the target kilometre and re-route
 *   5. grade the result (strict / relaxed / fallback) instead of discarding
 * Options are graded, deduplicated and sorted by the rider's style.
 */
(function(global){
"use strict";
var EARTH_KM=6371.0088;
var STYLES=["fast","balanced","curvy","verycurvy"];
var DIRECTIONS={auto:null,north:0,east:90,south:180,west:270};
// Typical road length / straight polygon perimeter ratio in Turkey.
var ROAD_FACTOR=1.3;
var LEVELS=[
 // strict: a real loop, near the target, no spur over 450 m
 {name:"strict",maxDev:.10,maxOverlap:.19,maxBacktrack:.45,maxReverseRatio:.045,minArea:.0035,maxReach:.48},
 // relaxed: small shared sections allowed, labelled to the rider
 {name:"relaxed",maxDev:.18,maxOverlap:.32,maxBacktrack:1.2,maxReverseRatio:.10,minArea:.0018,maxReach:.55},
 // fallback: still returns home on real roads; shown with a warning
 {name:"fallback",maxDev:.35,maxOverlap:1,maxBacktrack:Infinity,maxReverseRatio:1,minArea:0,maxReach:1}
];

function point(p){
 if(!p)return null;
 var lat=Number(typeof p.lat==="function"?p.lat():p.lat);
 var raw=p.lon!=null?p.lon:(typeof p.lng==="function"?p.lng():p.lng);
 var lon=Number(raw);
 return Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180?{lat:lat,lon:lon}:null;
}
function distanceKm(a,b){
 var r=Math.PI/180,x=(b.lat-a.lat)*r,y=(b.lon-a.lon)*r;
 var s=Math.sin(x/2)*Math.sin(x/2)+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(y/2)*Math.sin(y/2);
 return 2*EARTH_KM*Math.asin(Math.min(1,Math.sqrt(s)));
}
function bearing(a,b){
 var r=Math.PI/180,l1=a.lat*r,l2=b.lat*r,dl=(b.lon-a.lon)*r;
 return Math.atan2(Math.sin(dl)*Math.cos(l2),Math.cos(l1)*Math.sin(l2)-Math.sin(l1)*Math.cos(l2)*Math.cos(dl))*180/Math.PI;
}
function offset(origin,deg,km){
 var p=point(origin);if(!p||!Number.isFinite(deg)||!Number.isFinite(km)||km<=0)return null;
 var r=Math.PI/180,a=p.lat*r,b=p.lon*r,t=deg*r,d=km/EARTH_KM;
 var lat=Math.asin(Math.sin(a)*Math.cos(d)+Math.cos(a)*Math.sin(d)*Math.cos(t));
 var lon=b+Math.atan2(Math.sin(t)*Math.sin(d)*Math.cos(a),Math.cos(d)-Math.sin(a)*Math.sin(lat));
 return {lat:lat/r,lon:((lon/r+540)%360)-180};
}
function round6(p){return {lat:Math.round(p.lat*1e6)/1e6,lon:Math.round(p.lon*1e6)/1e6}}

// Cumulative distance helper for a road polyline.
function measure(points){
 var pts=(Array.isArray(points)?points:[]).map(point).filter(Boolean),cum=[0],total=0;
 for(var i=1;i<pts.length;i++){total+=distanceKm(pts[i-1],pts[i]);cum.push(total)}
 return {pts:pts,cum:cum,total:total};
}
function pointAt(m,at){
 if(!m.pts.length)return null;
 at=Math.max(0,Math.min(m.total,at));
 var lo=1,hi=m.cum.length-1;
 while(lo<hi){var mid=(lo+hi)>>1;if(m.cum[mid]<at)lo=mid+1;else hi=mid}
 var j=Math.max(1,lo),a=m.pts[j-1],b=m.pts[j]||a,len=m.cum[j]-m.cum[j-1],t=len>0?(at-m.cum[j-1])/len:0;
 return {lat:a.lat+(b.lat-a.lat)*t,lon:a.lon+(b.lon-a.lon)*t};
}
// Closest along-route distance of p, searching only after `from` km so that
// waypoints are matched in ride order on a loop that passes itself.
function project(m,p,from){
 var best=Infinity,bestAt=0,step=Math.max(1,Math.floor(m.pts.length/1500));
 for(var i=0;i<m.pts.length;i+=step){
  if(m.cum[i]<(from||0))continue;
  var d=distanceKm(m.pts[i],p);
  if(d<best){best=d;bestAt=m.cum[i]}
 }
 return {at:bestAt,offKm:best};
}

// Detect reused road and dead-end excursions. Samples the road every 120 m
// and looks for a later sample travelling the opposite way on the same road.
function loopQuality(points,reportedKm){
 var src=(Array.isArray(points)?points:[]).map(point).filter(Boolean);
 var empty={overlap:1,area:0,reach:0,areaRatio:0,homeAccessKm:0,maxBacktrackKm:0,reverseKm:0,spurCount:0,spurs:[],ok:false};
 if(src.length<3)return empty;
 var origin=src[0],rad=Math.PI/180,cos=Math.cos(origin.lat*rad);
 var sampled=[{p:src[0],at:0}],travelled=0;
 for(var i=1;i<src.length;i++){
  var a=src[i-1],b=src[i],len=distanceKm(a,b);
  if(!Number.isFinite(len)||len<=0)continue;
  var start=travelled;travelled+=len;
  var at=Math.floor(start/.12)*.12+.12;
  while(at<travelled){
   var t=Math.min(1,(at-start)/len);
   sampled.push({p:{lat:a.lat+(b.lat-a.lat)*t,lon:a.lon+(b.lon-a.lon)*t},at:at});
   at+=.12;
  }
 }
 if(travelled<=.1)return empty;
 sampled.push({p:src[src.length-1],at:travelled});
 var km=Number.isFinite(reportedKm)&&reportedKm>0?reportedKm:travelled;
 // Riders often live on a side street: leaving and returning on the same
 // access road near home is unavoidable and must not reject every loop.
 var grace=Math.min(1.6,Math.max(.4,km*.012));
 var cell=.16,bins=new Map(),repeated=new Set(),maxReach=0,shoelace=0;
 var currentReverseKm=0,maxBacktrackKm=0,reverseKm=0,lastReverseAt=-10,spurs=[],spur=null;
 var coords=sampled.map(function(s){return {x:(s.p.lon-origin.lon)*111.195*cos,y:(s.p.lat-origin.lat)*111.195}});
 for(i=0;i<sampled.length;i++){
  var c=coords[i],p=sampled[i],bx=Math.floor(c.x/cell),by=Math.floor(c.y/cell);
  var r=Math.hypot(c.x,c.y);
  maxReach=Math.max(maxReach,r);
  if(i>0)shoelace+=coords[i-1].x*c.y-c.x*coords[i-1].y;
  var prev=coords[Math.max(0,i-1)],next=coords[Math.min(coords.length-1,i+1)];
  var hx=next.x-prev.x,hy=next.y-prev.y,hlen=Math.hypot(hx,hy),reversed=false,matchAt=0;
  if(r>grace){
   for(var dx=-1;dx<=1&&!reversed;dx++)for(var dy=-1;dy<=1&&!reversed;dy++){
    var prior=bins.get((bx+dx)+":"+(by+dy))||[];
    for(var k=0;k<prior.length;k++){
     var j=prior[k];
     if(p.at-sampled[j].at<.55)continue;
     var q=coords[j];
     if((c.x-q.x)*(c.x-q.x)+(c.y-q.y)*(c.y-q.y)>.075*.075)continue;
     var before=coords[Math.max(0,j-1)],after=coords[Math.min(coords.length-1,j+1)];
     var vx=after.x-before.x,vy=after.y-before.y,vlen=Math.hypot(vx,vy);
     if(hlen>.02&&vlen>.02&&(hx*vx+hy*vy)/(hlen*vlen)<-.76){
      reversed=true;matchAt=sampled[j].at;repeated.add(i);repeated.add(j);break;
     }
    }
   }
  }
  if(reversed){
   var inc=lastReverseAt>=0?Math.min(.15,p.at-lastReverseAt):.12;
   if(p.at-lastReverseAt>.22){
    currentReverseKm=0;
    spur={outStart:matchAt,outEnd:matchAt,backStart:p.at,backEnd:p.at,km:0};spurs.push(spur);
   }
   currentReverseKm+=inc;reverseKm+=inc;
   maxBacktrackKm=Math.max(maxBacktrackKm,currentReverseKm);
   spur.km=currentReverseKm;spur.backEnd=p.at;
   spur.outStart=Math.min(spur.outStart,matchAt);spur.outEnd=Math.max(spur.outEnd,matchAt);
   lastReverseAt=p.at;
  }else if(p.at-lastReverseAt>.22)currentReverseKm=0;
  var key=bx+":"+by;
  if(!bins.has(key))bins.set(key,[]);
  bins.get(key).push(i);
 }
 // The rider's own access road (leave home, come back the same street) is
 // reported separately and tolerated up to max(3 km, 4%) of the tour.
 var homeAccessKm=0,allowance=Math.max(3,km*.04),tail=sampled[sampled.length-1].at;
 spurs=spurs.filter(function(s){
  var home=s.outStart<=grace+.4&&s.backEnd>=tail-grace-.4&&s.km<=allowance;
  if(home){homeAccessKm+=s.km;reverseKm-=s.km}
  return !home;
 });
 maxBacktrackKm=spurs.reduce(function(m,s){return Math.max(m,s.km)},0);
 var overlap=Math.max(0,repeated.size/sampled.length-homeAccessKm*2/Math.max(.1,tail)),area=Math.abs(shoelace)/2;
 var reach=maxReach/km,areaRatio=area/(km*km);
 var result={overlap:overlap,area:area,reach:reach,areaRatio:areaRatio,homeAccessKm:homeAccessKm,
  maxBacktrackKm:maxBacktrackKm,reverseKm:Math.max(0,reverseKm),spurCount:spurs.length,
  spurs:spurs.filter(function(s){return s.km>=.3})};
 result.ok=passes(result,LEVELS[0],0,km);
 return result;
}
function passes(q,level,deviation,km){
 var reverseRatio=q.reverseKm/Math.max(.1,km||1);
 return deviation<=level.maxDev&&q.overlap<=level.maxOverlap&&q.maxBacktrackKm<level.maxBacktrack&&
  reverseRatio<=level.maxReverseRatio&&q.areaRatio>=level.minArea&&q.reach<=level.maxReach;
}
function grade(q,km,target){
 var dev=Math.abs(km-target)/Math.max(1,target);
 for(var i=0;i<LEVELS.length;i++)if(passes(q,LEVELS[i],dev,km))return i;
 return -1;
}

// Turn units per 10 km measured on ~90 m samples (ignores polyline noise).
function curvature(points,km){
 if(!Array.isArray(points)||points.length<3||!Number.isFinite(km)||km<=0)return 0;
 var sample=[points[0]],last=points[0],travel=0;
 for(var i=1;i<points.length;i++){
  var p=points[i];if(!p)continue;
  travel+=distanceKm(last,p);last=p;
  if(travel>=.09){sample.push(p);travel=0}
 }
 if(sample.length<3)return 0;
 var sum=0;
 for(i=2;i<sample.length;i++){
  var b1=bearing(sample[i-2],sample[i-1]),b2=bearing(sample[i-1],sample[i]);
  var delta=Math.abs(((b2-b1+540)%360)-180);
  if(delta>=18&&delta<=155)sum+=Math.min(90,delta)/45;
 }
 return Math.round(sum/Math.max(1,km)*10*10)/10;
}
function score(o,style,target){
 var dev=Math.abs(o.km-target)/Math.max(target,1);
 var hours=Math.max(.01,o.sec/3600),speed=o.km/hours;
 var loop=(1-Math.min(1,Number(o.overlap)||0))*3-Math.min(3,(Number(o.maxBacktrackKm)||0)*2);
 var curve=Number(o.curveScore)||0;
 if(style==="fast")return speed/12-dev*4+loop;
 if(style==="curvy")return curve*.15-dev*2.5-hours*.04+loop;
 if(style==="verycurvy")return curve*.25-dev*1.8-hours*.015+loop;
 return -dev*4+curve*.05+speed/45+loop;
}

// Loop corners lie on a circle through the origin. Corner angles are spread
// so the polygon has real area: a thin wedge would force the same road home.
function shapes(origin,km,direction,style,count){
 var o=point(origin);if(!o)return [];
 var fixed=DIRECTIONS.hasOwnProperty(direction)?DIRECTIONS[direction]:null;
 var heads=fixed==null?[20,140,260,80,200,320,50,170,290,110,230,350]:
  [0,-35,35,-65,65,-15,15,-95,95,-130,130,180].map(function(d){return fixed+d});
 count=Math.max(1,Math.min(heads.length,count||8));
 var radius=km/(2*Math.PI*ROAD_FACTOR);
 var avoid=style==="curvy"||style==="verycurvy";
 var baseCorners=km<=60?4:km<=110?5:6;
 var out=[];
 for(var i=0;i<count;i++){
  // Denser corners keep each leg short, so the fastest leg follows the
  // loop instead of running out and back along the same main road.
  var corners=baseCorners+(i%2);
  var head=heads[i],arc=[];
  for(var c=1;c<=corners;c++)arc.push(-180+c*360/(corners+1));
  var center=offset(o,head,radius);
  var middle=arc.map(function(a){
   // bearing seen from the circle centre; the origin sits at head+180
   return offset(center,head+a,radius);
  });
  out.push({id:"s"+i,head:head,radius:radius,middle:middle,
   avoidHighways:avoid?i%3!==2:(style==="balanced"&&i%4===3),
   name:["Halkalı keşif","Farklı dönüş yolu","Geniş tur","Sakin yollar"][i%4]});
 }
 return out;
}
function scaleShape(origin,middle,factor){
 return middle.map(function(p){
  var d=distanceKm(origin,p),b=bearing(origin,p);
  return d>0?offset(origin,b,d*factor):p;
 });
}

// Repair dead-end excursions ("gir-çık"): the corner responsible for an
// out-and-back stretch is moved back to the junction where the road started
// repeating. If a long excursion survives two cuts, the corner is rotated
// around the origin so the router finds a different road in that sector.
// Returns {middle, removedKm} or null when nothing could be repaired.
function repairSpurs(route,middle,quality,origin,attempt){
 if(!quality.spurs||!quality.spurs.length)return null;
 var m=measure(route.points);if(m.total<=0)return null;
 var home=point(origin)||m.pts[0];
 var from=0,ats=middle.map(function(p){var r=project(m,p,from);from=r.at;return r.at});
 var changed=false,fixed=middle.slice(),removed=0,used={};
 // Neighbouring reversals belong to ONE excursion (out on a road, back on
 // the same road); merge them so the corner is moved to the first junction.
 var spurs=quality.spurs.slice().sort(function(a,b){return a.backStart-b.backStart}),merged=[];
 spurs.forEach(function(s){
  var last=merged[merged.length-1];
  if(last&&s.backStart-last.backEnd<1&&s.outEnd<=last.outStart+1){
   last.outStart=Math.min(last.outStart,s.outStart);last.backEnd=Math.max(last.backEnd,s.backEnd);last.km+=s.km;
  }else merged.push({outStart:s.outStart,outEnd:s.outEnd,backStart:s.backStart,backEnd:s.backEnd,km:s.km});
 });
 merged.forEach(function(s){
  var lo=s.outStart-.35,hi=s.backEnd+.35,hit=-1,best=Infinity,mid=(s.outEnd+s.backStart)/2;
  for(var i=0;i<ats.length;i++){
   var d=Math.abs(ats[i]-mid);
   if(ats[i]>=lo&&ats[i]<=hi&&d<best){best=d;hit=i}
  }
  if(hit<0){
   // The router itself created the reversal (e.g. a U-turn between two
   // corners): treat the closest corner as responsible when near enough.
   for(i=0;i<ats.length;i++){var e=Math.abs(ats[i]-mid);if(e<best&&e<s.km+3){best=e;hit=i}}
  }
  if(hit<0||used[hit])return;
  used[hit]=true;
  var tried=(attempt||0)>=2&&s.km>2.5;
  if(!tried){
   // Cut the excursion: the corner moves to where the road started repeating.
   var junction=pointAt(m,Math.max(0,s.outStart-.25));
   if(junction){fixed[hit]=junction;removed+=2*s.km;changed=true}
  }else{
   // Still repeating after a cut: look for another road in that sector.
   var dist=distanceKm(home,fixed[hit]),dir=bearing(home,fixed[hit]);
   fixed[hit]=offset(home,dir+(hit%2?-28:28),dist);removed+=s.km;changed=true;
  }
 });
 return changed?{middle:fixed,removedKm:removed}:null;
}

function cellsOf(points){
 var set=new Set();
 for(var i=0;i<points.length;i+=Math.max(1,Math.floor(points.length/400))){
  var p=points[i];set.add(Math.round(p.lat*80)+":"+Math.round(p.lon*80));
 }
 return set;
}
function similarity(a,b){
 var inter=0;a.forEach(function(k){if(b.has(k))inter++});
 return inter/Math.max(1,Math.min(a.size,b.size));
}

function limiter(concurrency){
 var active=0,queue=[];
 function next(){
  if(active>=concurrency||!queue.length)return;
  active++;var job=queue.shift();
  Promise.resolve().then(job.fn).then(job.resolve,job.reject).then(function(){active--;next()});
 }
 return function(fn){return new Promise(function(resolve,reject){queue.push({fn:fn,resolve:resolve,reject:reject});next()})};
}

/* planTours(settings) -> Promise<{options, level, requests, error}>
 * settings.router({origin,destination,intermediates,avoidHighways}) must
 * resolve {points,km,sec,steps,token?} or null. */
function planTours(settings){
 var origin=point(settings&&settings.origin),target=Number(settings&&settings.targetKm);
 var style=STYLES.indexOf(settings&&settings.style)>=0?settings.style:"balanced";
 var router=settings&&settings.router;
 var maxRequests=Math.max(3,Number(settings&&settings.maxRequests)||30);
 var wanted=Math.max(1,Number(settings&&settings.wanted)||3);
 var cancelled=settings&&settings.cancelled||function(){return false};
 var progress=settings&&settings.onProgress||function(){};
 if(!origin||!(target>0)||typeof router!=="function")
  return Promise.resolve({options:[],level:-1,requests:0,error:"invalid-input"});
 var requests=0,failures=0,run=limiter(Math.max(1,Number(settings.concurrency)||3));
 var found=[];
 function call(middle,avoid){
  if(requests>=maxRequests||cancelled())return Promise.resolve(null);
  requests++;
  return run(function(){
   if(cancelled())return null;
   return router({origin:origin,destination:origin,intermediates:middle.map(round6),avoidHighways:!!avoid});
  }).then(function(r){
   progress({requests:requests,maxRequests:maxRequests,found:found.length});
   if(!r||!Array.isArray(r.points)||r.points.length<3||!(r.km>0)){failures++;return null}
   r.points=r.points.map(point).filter(Boolean);
   return r;
  },function(){failures++;return null});
 }
 function evaluate(shape,middle,route){
  var q=loopQuality(route.points,route.km),level=grade(q,route.km,target);
  return {name:shape.name,shapeId:shape.id,km:route.km,sec:route.sec,points:route.points,
   steps:route.steps||[],token:route.token||null,origin:origin,middle:middle.map(round6),
   avoidHighways:!!shape.avoidHighways,overlap:q.overlap,maxBacktrackKm:q.maxBacktrackKm,
   area:q.area,quality:q,level:level,curveScore:curvature(route.points,route.km)};
 }
 function better(a,b){
  if(!b)return true;
  if(a.level<0)return false;if(b.level<0)return true;
  if(a.level!==b.level)return a.level<b.level;
  return score(a,style,target)>score(b,style,target);
 }
 // Continuous cost used while refining one shape: excursions weigh more
 // than kilometre deviation because a 150 km loop with a 5 km out-and-back
 // is worse than one that is 15 km short.
 function cost(o){
  var q=o.quality,dev=Math.abs(o.km-target)/target;
  return (o.level<0?40:o.level*10)+q.overlap*4+q.maxBacktrackKm*.6+dev*3;
 }
 // Hill-climb on one shape (max 6 routing rounds). Every move starts from
 // the best corners so far: cut the worst excursion, otherwise rescale.
 function refine(shape){
  var middle=shape.middle.filter(Boolean),best=null,bestRoute=null,stale=0,lastMove="";
  if(middle.length<2)return Promise.resolve(null);
  function step(current,round){
   return call(current,shape.avoidHighways).then(function(route){
    if(!route)return best;
    var o=evaluate(shape,current,route);
    if(settings.debug)settings.debug(shape.id,round,o);
    if(!best||cost(o)<cost(best)){best=o;bestRoute=route;stale=0}else stale++;
    if(round>=6||best.level===0||requests>=maxRequests||stale>=3)return best;
    var dev=(best.km-target)/target;
    var repair=(lastMove!=="repair"||stale===0)?repairSpurs(bestRoute,best.middle,best.quality,origin,stale):null;
    var next=null;
    if(repair){next=repair.middle;lastMove="repair"}
    else if(Math.abs(dev)>.05){
     // Road length scales roughly linearly with the polygon size.
     next=scaleShape(origin,best.middle,Math.max(.6,Math.min(1.6,target/best.km)));lastMove="scale";
    }else if(best.quality.spurs.length){
     next=repairSpurs(bestRoute,best.middle,best.quality,origin,2+stale);
     next=next&&next.middle;lastMove="rotate";
    }
    if(!next)return best;
    return step(next,round+1);
   });
  }
  return step(middle,1);
 }
 var all=shapes(origin,target,settings.direction||"auto",style,Number(settings.shapeCount)||8);
 function enough(){return found.filter(function(o){return o.level===0}).length>=wanted}
 function addResult(o){
  if(!o||o.level<0)return;
  var cells=cellsOf(o.points);o._cells=cells;
  for(var i=0;i<found.length;i++){
   if(similarity(cells,found[i]._cells)>.72){
    if(better(o,found[i]))found[i]=o;
    return;
   }
  }
  found.push(o);
  if(settings.onOption)try{settings.onOption(o)}catch(e){}
 }
 // Shapes are processed in waves so a good early answer saves API calls.
 function wave(index){
  if(index>=all.length||enough()||requests>=maxRequests||cancelled())return Promise.resolve();
  var batch=all.slice(index,index+3);
  return Promise.all(batch.map(refine)).then(function(results){
   results.forEach(addResult);
   return wave(index+3);
  });
 }
 return wave(0).then(function(){
  found.sort(function(a,b){return a.level!==b.level?a.level-b.level:score(b,style,target)-score(a,style,target)});
  // Never pad good loops with poor ones: a "fallback" (shared road) option
 // is shown only when fewer than two better loops exist.
 var good=found.filter(function(o){return o.level<2}).length;
 var pool=good>=2?found.filter(function(o){return o.level<2}):found;
 var options=pool.slice(0,wanted).map(function(o){
   delete o._cells;
   o.relaxed=o.level>0;
   o.warning=o.level===0?"":o.level===1?
    "Kısmen aynı yoldan geçen veya hedeften biraz farklı uzunlukta tur":
    "Bu bölgede tam halka bulunamadı; tur bazı yolları iki yönde kullanır";
   return o;
  });
  var level=options.length?options[0].level:-1;
  return {options:options,level:level,requests:requests,failures:failures,
   error:options.length?"":(failures>=requests?"router-unavailable":"no-loop")};
 });
}

// Stops sent to Google Navigation SDK: the SAME corners used to compute the
// preview, then the origin. Keeping them identical makes a route token valid.
function navigationStops(option){
 if(!option||!Array.isArray(option.middle)||!option.origin)return [];
 return option.middle.map(round6).concat([round6(option.origin)]);
}

var api={STYLES:STYLES,LEVELS:LEVELS,point:point,distanceKm:distanceKm,bearing:bearing,offset:offset,
 measure:measure,pointAt:pointAt,project:project,loopQuality:loopQuality,grade:grade,curvature:curvature,
 score:score,shapes:shapes,scaleShape:scaleShape,repairSpurs:repairSpurs,planTours:planTours,
 navigationStops:navigationStops,similarity:similarity,cellsOf:cellsOf};
global.GaZonTourEngine=api;
if(typeof module==="object"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
