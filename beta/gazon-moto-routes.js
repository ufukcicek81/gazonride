/* Keşfet → "Moto Rotalar": curated motorcycle roads (passes, coastal and
 * mountain roads, plateaus, canyons, loops), mostly in Türkiye plus classic
 * routes abroad. Data: gazon-moto-routes.json (photos and start/via/end
 * coordinates are added and checked by scripts/enrich-moto-routes.js).
 * Replaces the generic "81 İl Gezi Rehberi" chip.
 */
(function(){
"use strict";
var $=function(id){return document.getElementById(id)};
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
var routes=[],loaded=false,filterArea="all",filterType="all";
var TYPES=[["all","Tümü"],["Geçit","Geçitler"],["Sahil yolu","Sahil"],["Dağ yolu","Dağ"],["Viraj yolu","Viraj"],["Yayla yolu","Yayla"],["vadi","Vadi · Kanyon"],["Tur rotası","Tur"]];
var DIFF={1:["Kolay","#16A34A"],2:["Orta","#D97706"],3:["Zor","#DC2626"]};
function km(a,b){var R=6371,p=Math.PI/180,x=Math.sin((b.lat-a.lat)*p/2),y=Math.sin((b.lng-a.lng)*p/2);return 2*R*Math.asin(Math.sqrt(x*x+Math.cos(a.lat*p)*Math.cos(b.lat*p)*y*y))}
function startOf(r){var p=r.points&&r.points[0];return p&&p.lat!=null?p:null}
function here(){var c=window.GaZonMapContext,p=c&&c.getCurrentPoint&&c.getCurrentPoint();return p?{lat:p.lat,lng:p.lon}:null}
function typeMatch(r){
 if(filterType==="all")return true;
 if(filterType==="vadi")return r.type==="Vadi yolu"||r.type==="Kanyon";
 if(filterType==="Dağ yolu")return r.type==="Dağ yolu"||r.type==="Orman yolu";
 if(filterType==="Tur rotası")return r.type==="Tur rotası"||r.type==="Göl turu"||r.type==="Tarih rotası";
 return r.type===filterType;
}
function list(){
 var me=here();
 return routes.filter(function(r){return (filterArea==="all"||(filterArea==="tr"?r.cc==="TR":r.cc!=="TR"))&&typeMatch(r)})
  .map(function(r){var s=startOf(r);return {r:r,d:me&&s?km(me,s):null}})
  .sort(function(a,b){if(a.d==null&&b.d==null)return a.r.id-b.r.id;if(a.d==null)return 1;if(b.d==null)return -1;return a.d-b.d});
}
function mapsUrl(r){
 var pts=(r.points||[]).filter(function(p){return p.lat!=null});
 function c(p){return p.lat+","+p.lng}
 if(pts.length>=2)return "https://www.google.com/maps/dir/?api=1&origin="+c(pts[0])+"&destination="+c(pts[pts.length-1])+(pts.length>2?"&waypoints="+encodeURIComponent(pts.slice(1,-1).map(c).join("|")):"")+"&travelmode=driving";
 return "https://www.google.com/maps/dir/?api=1&origin="+encodeURIComponent(r.start)+"&destination="+encodeURIComponent(r.end)+"&travelmode=driving";
}
function card(x){
 var r=x.r,d=DIFF[r.difficulty]||DIFF[2];
 return '<article class="gr-moto-card">'+
  '<div class="gr-moto-photo">'+((r.photo||r.image)?'<img loading="lazy" decoding="async" src="'+esc(r.photo||r.image)+'" alt="'+esc(r.name)+'" onerror="this.remove()">':'')+
   '<span class="gr-moto-type">'+esc(r.type)+'</span>'+(r.cc!=="TR"?'<span class="gr-moto-flag">'+esc(r.country)+'</span>':'')+
   (r.imageCredit?'<a class="gr-moto-credit" href="'+esc(r.imageCredit)+'" target="_blank" rel="noopener noreferrer" aria-label="Fotoğraf kaynağı">©</a>':'')+'</div>'+
  '<div class="gr-moto-body"><b>'+esc(r.name)+'</b><small>'+esc(r.region)+' · '+esc(r.cc==="TR"?r.city:r.country)+(x.d!=null?' · sana '+Math.round(x.d)+' km':'')+'</small>'+
   '<div class="gr-moto-badges"><span style="--c:'+d[1]+'">'+d[0]+'</span><span>'+esc(r.km)+' km</span><span>'+esc(r.season)+'</span><span>'+esc(r.surface)+'</span></div>'+
   '<p>'+esc(r.desc)+'</p>'+
   '<div class="gr-moto-actions"><button type="button" data-moto-go="'+r.id+'"><span class="mi">two_wheeler</span> Rotaya başla</button>'+
   '<a href="'+esc(mapsUrl(r))+'" target="_blank" rel="noopener noreferrer"><span class="mi">map</span> Haritada gör</a></div></div></article>';
}
function render(){
 var box=$("grMotoRoutes");if(!box)return;
 if(!loaded){box.innerHTML='<div class="gr-moto-empty">Rotalar yükleniyor…</div>';return}
 var items=list(),tr=routes.filter(function(r){return r.cc==="TR"}).length;
 box.innerHTML='<div class="gr-moto-head"><b>Moto Rotalar</b><small>'+tr+' Türkiye · '+(routes.length-tr)+' yurt dışı · geçitler, sahil ve dağ yolları</small></div>'+
  '<div class="gr-moto-filters" role="group" aria-label="Bölge">'+[["all","Hepsi"],["tr","Türkiye"],["abroad","Yurt dışı"]].map(function(a){return '<button type="button" data-moto-area="'+a[0]+'" class="'+(filterArea===a[0]?'on':'')+'">'+a[1]+'</button>'}).join("")+'</div>'+
  '<div class="gr-moto-filters types" role="group" aria-label="Rota türü">'+TYPES.map(function(t){return '<button type="button" data-moto-type="'+t[0]+'" class="'+(filterType===t[0]?'on':'')+'">'+t[1]+'</button>'}).join("")+'</div>'+
  (items.length?'<div class="gr-moto-list">'+items.map(card).join("")+'</div>':'<div class="gr-moto-empty">Bu filtrede rota yok.</div>');
 box.querySelectorAll("[data-moto-area]").forEach(function(b){b.onclick=function(){filterArea=b.getAttribute("data-moto-area");render()}});
 box.querySelectorAll("[data-moto-type]").forEach(function(b){b.onclick=function(){filterType=b.getAttribute("data-moto-type");render()}});
 box.querySelectorAll("[data-moto-go]").forEach(function(b){b.onclick=function(){go(Number(b.getAttribute("data-moto-go")))}});
}
// Start the route in GazOnRide: through all known points (start → via → end)
// so the scenic road is used, not the fastest one; names as a fallback.
function go(id){
 var r=routes.filter(function(x){return x.id===id})[0];if(!r)return;
 var N=window.GaZonNavigation,pts=(r.points||[]).filter(function(p){return p.lat!=null});
 if(N&&N.openCommunityRoute&&pts.length>=2){N.openCommunityRoute({title:r.name,track:pts.map(function(p){return [p.lat,p.lng]})},false);return}
 if(N&&N.launchCardDestination){var s=startOf(r);N.launchCardDestination(s?{destination:r.start,title:r.name+" · başlangıç",lat:s.lat,lon:s.lng}:{destination:r.start,title:r.name+" · başlangıç"})}
}
function select(on){
 document.body.classList.toggle("gr-moto-active",on);
 var chip=$("grMotoChip");if(chip)chip.classList.toggle("active",on);
 if(on){
  document.querySelectorAll(".discoverTabs .chip").forEach(function(c){if(c!==chip)c.classList.remove("active")});
  document.body.classList.remove("gr-travel-active","gr-discover-mine","gr-discover-home");
  render();
  var box=$("grMotoRoutes");if(box)box.scrollIntoView({block:"start",behavior:"smooth"});
 }
}
function load(){
 fetch("gazon-moto-routes.json?v=20261014-brand1",{cache:"no-cache"}).then(function(r){return r.json()}).then(function(d){
  routes=Array.isArray(d&&d.routes)?d.routes:[];loaded=true;render();
 }).catch(function(){loaded=true;routes=[];var b=$("grMotoRoutes");if(b)b.innerHTML='<div class="gr-moto-empty">Rotalar yüklenemedi. İnternet bağlantını kontrol et.</div>'});
}
function install(){
 var tabs=document.querySelector(".discoverTabs");if(!tabs){setTimeout(install,300);return}
 if($("grMotoChip"))return;
 var chip=document.createElement("button");chip.type="button";chip.className="chip";chip.id="grMotoChip";chip.textContent="Moto Rotalar";
 var mine=$("grMyRidesChip"),first=tabs.querySelector('[data-discover="discover"]');
 (mine||first)?(mine||first).insertAdjacentElement("afterend",chip):tabs.prepend(chip);
 chip.addEventListener("click",function(){select(true)});
 tabs.addEventListener("click",function(e){var c=e.target.closest(".chip");if(c&&c!==chip)select(false)});
 var box=document.createElement("section");box.id="grMotoRoutes";box.className="gr-moto";
 var after=$("grMyRides")||tabs;after.insertAdjacentElement("afterend",box);
 load();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install);else install();
window.GaZonMotoRoutes={select:select,render:render};
})();
