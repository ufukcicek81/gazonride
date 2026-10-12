"use strict";
/* Synthetic road network used to test tour planning without Google.
 * - a road grid (2.5 km spacing) with some missing links
 * - straight fast highways every 8th row / column
 * - winding mountain roads (zig-zag geometry, slow)
 * - MANY dead-end side roads: a waypoint dropped into the countryside snaps
 *   to their tip, which reproduces the real "gir-çık" bug in Google routes.
 * The router snaps each waypoint to the nearest node and runs Dijkstra on
 * travel time, like a real routing engine.
 */
const R=6371.0088;
function rng(seed){
 let a=seed>>>0;
 return function(){a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296};
}
function dist(a,b){
 const r=Math.PI/180,x=(b.lat-a.lat)*r,y=(b.lon-a.lon)*r;
 const s=Math.sin(x/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(y/2)**2;
 return 2*R*Math.asin(Math.min(1,Math.sqrt(s)));
}
class Heap{
 constructor(){this.a=[]}
 push(k,v){const a=this.a;a.push([k,v]);let i=a.length-1;while(i>0){const p=(i-1)>>1;if(a[p][0]<=a[i][0])break;[a[p],a[i]]=[a[i],a[p]];i=p}}
 pop(){const a=this.a,top=a[0],last=a.pop();if(a.length){a[0]=last;let i=0;for(;;){const l=2*i+1,r=l+1;let m=i;if(l<a.length&&a[l][0]<a[m][0])m=l;if(r<a.length&&a[r][0]<a[m][0])m=r;if(m===i)break;[a[m],a[i]]=[a[i],a[m]];i=m}}return top}
 get size(){return this.a.length}
}
function buildNetwork(opts){
 opts=opts||{};
 const origin=opts.origin||{lat:40.875,lon:30.95};
 const rand=rng(opts.seed||7);
 const spacingKm=opts.spacingKm||2.5,half=opts.halfCells||28;
 const dLat=spacingKm/111.195,dLon=spacingKm/(111.195*Math.cos(origin.lat*Math.PI/180));
 const nodes=[],adj=[];
 function addNode(p){nodes.push(p);adj.push([]);return nodes.length-1}
 function addEdge(a,b,geom,speed,name){
  let km=0;for(let i=1;i<geom.length;i++)km+=dist(geom[i-1],geom[i]);
  adj[a].push({to:b,geom,km,speed,name});
  adj[b].push({to:a,geom:geom.slice().reverse(),km,speed,name});
 }
 const id=(i,j)=>(i+half)*(2*half+1)+(j+half);
 for(let i=-half;i<=half;i++)for(let j=-half;j<=half;j++)
  addNode({lat:origin.lat+i*dLat,lon:origin.lon+j*dLon});
 function geometry(a,b,kind){
  const p=nodes[a],q=nodes[b];
  if(kind==="highway")return [p,q];
  // Perpendicular zig-zag in local kilometre space.
  const ky=111.195,kx=111.195*Math.cos(origin.lat*Math.PI/180);
  const vx=(q.lon-p.lon)*kx,vy=(q.lat-p.lat)*ky,len=Math.hypot(vx,vy);
  const ux=-vy/len,uy=vx/len,n=kind==="mountain"?12:5,amp=kind==="mountain"?.045:.03,geom=[p];
  for(let k=1;k<n;k++){
   const t=k/n,w=(k%2?1:-1)*amp*(.6+.4*rand())*spacingKm;
   geom.push({lat:p.lat+(q.lat-p.lat)*t+uy*w/ky,lon:p.lon+(q.lon-p.lon)*t+ux*w/kx});
  }
  geom.push(q);return geom;
 }
 const missing=opts.missingLinks==null?.12:opts.missingLinks;
 for(let i=-half;i<=half;i++)for(let j=-half;j<=half;j++){
  for(const [di,dj] of [[1,0],[0,1]]){
   const ni=i+di,nj=j+dj;if(ni>half||nj>half)continue;
   const highway=(di===0&&(i+20)%8===3)||(dj===0&&(j+20)%8===5);
   if(!highway&&rand()<missing)continue;
   const mountain=!highway&&(Math.abs(i-6)<6&&Math.abs(j+5)<7||Math.abs(i+9)<5&&Math.abs(j-8)<6||rand()<.18);
   const kind=highway?"highway":mountain?"mountain":"road";
   addEdge(id(i,j),id(ni,nj),geometry(id(i,j),id(ni,nj),kind),kind==="highway"?95:kind==="mountain"?42:62,kind);
  }
 }
 // Dead-end side roads pointing into each block (village access roads).
 const spurRate=opts.spurRate==null?.55:opts.spurRate;
 for(let i=-half;i<half;i++)for(let j=-half;j<half;j++){
  if(rand()>spurRate)continue;
  const base=id(i,j),p=nodes[base],len=.35+.25*rand();
  const tip=addNode({lat:p.lat+dLat*len,lon:p.lon+dLon*len*(.7+.6*rand())});
  addEdge(base,tip,[p,{lat:(p.lat+nodes[tip].lat)/2+dLat*.03,lon:(p.lon+nodes[tip].lon)/2},nodes[tip]],35,"spur");
 }
 // Google snaps a waypoint to the closest road SEGMENT, not to a junction.
 const edges=[];
 adj.forEach((list,a)=>list.forEach(e=>{if(a<e.to)edges.push({a,b:e.to,e})}));
 const ky=111.195,kx=111.195*Math.cos(origin.lat*Math.PI/180);
 function snap(p){
  let best=null,bd=Infinity;
  for(const ed of edges){
   const g=ed.e.geom;let along=0;
   for(let k=1;k<g.length;k++){
    const A=g[k-1],B=g[k],vx=(B.lon-A.lon)*kx,vy=(B.lat-A.lat)*ky,px=(p.lon-A.lon)*kx,py=(p.lat-A.lat)*ky;
    const L=vx*vx+vy*vy,t=L>0?Math.max(0,Math.min(1,(px*vx+py*vy)/L)):0,d=Math.hypot(px-t*vx,py-t*vy),seg=Math.sqrt(L);
    if(d<bd){bd=d;best={edge:ed,seg:k,t,at:along+t*seg}}
    along+=seg;
   }
  }
  const g=best.edge.e.geom,P={lat:g[best.seg-1].lat+(g[best.seg].lat-g[best.seg-1].lat)*best.t,lon:g[best.seg-1].lon+(g[best.seg].lon-g[best.seg-1].lon)*best.t};
  best.point=P;best.frac=best.at/Math.max(1e-9,best.edge.e.km);
  return best;
 }
 function edgeSpeed(e,avoid){return avoid&&e.name==="highway"?20:e.speed}
 // Geometry of edge a->b from fraction f0 to f1 (0 = a end).
 function partial(ed,f0,f1){
  const g=ed.e.geom,total=ed.e.km,pts=[];
  const at=f=>{let need=f*total,acc=0;for(let k=1;k<g.length;k++){const s=dist(g[k-1],g[k]);if(acc+s>=need){const t=s>0?(need-acc)/s:0;return {lat:g[k-1].lat+(g[k].lat-g[k-1].lat)*t,lon:g[k-1].lon+(g[k].lon-g[k-1].lon)*t,k}}acc+=s}return {lat:g[g.length-1].lat,lon:g[g.length-1].lon,k:g.length-1}};
  const s=at(Math.min(f0,f1)),e=at(Math.max(f0,f1));
  pts.push({lat:s.lat,lon:s.lon});for(let k=s.k;k<e.k;k++)pts.push(g[k]);pts.push({lat:e.lat,lon:e.lon});
  return f0<=f1?pts:pts.reverse();
 }
 function leg(from,to,avoid){
  const time=new Float64Array(nodes.length).fill(Infinity),prev=new Int32Array(nodes.length).fill(-1),via=new Array(nodes.length);
  const h=new Heap(),fe=from.edge,te=to.edge,fs=edgeSpeed(fe.e,avoid),ts=edgeSpeed(te.e,avoid);
  time[fe.a]=fe.e.km*from.frac/fs;h.push(time[fe.a],fe.a);
  const tb=fe.e.km*(1-from.frac)/fs;if(tb<time[fe.b]){time[fe.b]=tb;h.push(tb,fe.b)}
  let bestT=Infinity,bestEnd=-1;
  if(fe===te){bestT=Math.abs(to.frac-from.frac)*fe.e.km/fs;bestEnd=-2}
  while(h.size){
   const [t,u]=h.pop();if(t>time[u])continue;if(t>=bestT)break;
   const cost=u===te.a?te.e.km*to.frac/ts:u===te.b?te.e.km*(1-to.frac)/ts:Infinity;
   if(t+cost<bestT){bestT=t+cost;bestEnd=u}
   for(const e of adj[u]){
    const nt=t+e.km/edgeSpeed(e,avoid);
    if(nt<time[e.to]){time[e.to]=nt;prev[e.to]=u;via[e.to]=e;h.push(nt,e.to)}
   }
  }
  if(bestEnd===-1)return null;
  if(bestEnd===-2)return {points:partial(fe,from.frac,to.frac),km:Math.abs(to.frac-from.frac)*fe.e.km,sec:bestT*3600,steps:[]};
  const chain=[];for(let v=bestEnd;prev[v]!==-1;v=prev[v])chain.push(via[v]);chain.reverse();
  let start=bestEnd;for(let v=bestEnd;prev[v]!==-1;v=prev[v])start=prev[v];
  const points=partial(fe,from.frac,start===fe.a?0:1),steps=[];let km=fe.e.km*(start===fe.a?from.frac:1-from.frac);
  for(const e of chain){points.push(...e.geom.slice(1));km+=e.km;steps.push({distance:Math.round(e.km*1000),instruction:{maneuver:"STRAIGHT",instructions:e.name},end:e.geom[e.geom.length-1]})}
  const tail=partial(te,bestEnd===te.a?0:1,to.frac);points.push(...tail.slice(1));
  km+=te.e.km*(bestEnd===te.a?to.frac:1-to.frac);
  return {points,km,sec:bestT*3600,steps};
 }
 let calls=0;
 async function router(req){
  calls++;
  const stops=[req.origin].concat(req.intermediates||[],[req.destination]).map(snap);
  const points=[stops[0].point],steps=[];let km=0,sec=0;
  for(let s=1;s<stops.length;s++){
   const l=leg(stops[s-1],stops[s],req.avoidHighways);
   if(!l)return null;
   points.push(...l.points.slice(1));km+=l.km;sec+=l.sec;steps.push(...l.steps);
  }
  return {points,km,sec,steps,token:"mock-token-"+calls};
 }
 function nearest(p){return snap(p)}
 return {origin,nodes,adj,router,nearest,get calls(){return calls}};
}
// Tree-shaped network (no cycles): any "loop" must reuse roads. Used to
// test that planning degrades to labelled fallback options, never nothing.
function buildTreeNetwork(origin){
 const net={nodes:[],adj:[]};
 origin=origin||{lat:40.875,lon:30.95};
 const add=p=>{net.nodes.push(p);net.adj.push([]);return net.nodes.length-1};
 const link=(a,b)=>{const km=dist(net.nodes[a],net.nodes[b]);net.adj[a].push({to:b,km});net.adj[b].push({to:a,km})};
 const root=add(origin);
 for(const deg of [0,90,180,270]){
  let prev=root;
  for(let k=1;k<=30;k++){
   const r=Math.PI/180,km=k*2;
   const n=add({lat:origin.lat+km/111.195*Math.cos(deg*r),lon:origin.lon+km/(111.195*Math.cos(origin.lat*r))*Math.sin(deg*r)});
   link(prev,n);prev=n;
  }
 }
 function nearest(p){let b=0,d=Infinity;net.nodes.forEach((n,i)=>{const x=dist(n,p);if(x<d){d=x;b=i}});return b}
 function path(a,b){
  const prev=new Map([[a,-1]]),queue=[a];
  while(queue.length){const u=queue.shift();if(u===b)break;for(const e of net.adj[u])if(!prev.has(e.to)){prev.set(e.to,u);queue.push(e.to)}}
  const out=[];for(let v=b;v!==-1;v=prev.get(v))out.push(v);return out.reverse();
 }
 async function router(req){
  const stops=[req.origin].concat(req.intermediates||[],[req.destination]).map(nearest);
  const ids=[stops[0]];
  for(let s=1;s<stops.length;s++)ids.push(...path(stops[s-1],stops[s]).slice(1));
  const points=ids.map(i=>net.nodes[i]);let km=0;
  for(let i=1;i<points.length;i++)km+=dist(points[i-1],points[i]);
  return {points,km,sec:km/60*3600,steps:[],token:null};
 }
 return {router};
}
module.exports={buildNetwork,buildTreeNetwork,dist};
