/* Ride markers ("İşaretle"): one tap during a ride or navigation saves the
 * current spot as good/bad asphalt, danger, rest stop, water, WC or a pin.
 * - stored locally (gazon_marks), attached to the ride when it is saved
 * - drawn on the live map and on the replay overview
 * - glove-size buttons, 5 s undo
 */
(function(root){
"use strict";
var TYPES=[
 {id:"good_road",label:"İyi asfalt",icon:"add_road",color:"#16A34A"},
 {id:"bad_road",label:"Kötü asfalt",icon:"remove_road",color:"#DC2626"},
 {id:"danger",label:"Tehlike",icon:"warning",color:"#D97706"},
 {id:"rest",label:"Mola yeri",icon:"local_cafe",color:"#EA580C"},
 {id:"water",label:"Su",icon:"water_drop",color:"#0284C7"},
 {id:"wc",label:"WC",icon:"wc",color:"#7C3AED"},
 {id:"pin",label:"Yer işaretle",icon:"push_pin",color:"#0F766E"}
];
var KEY="gazon_marks",MAX=1000;
function type(id){for(var i=0;i<TYPES.length;i++)if(TYPES[i].id===id)return TYPES[i];return TYPES[TYPES.length-1]}
function read(){try{var a=JSON.parse(root.localStorage.getItem(KEY)||"[]");return Array.isArray(a)?a:[]}catch(e){return []}}
function write(a){try{root.localStorage.setItem(KEY,JSON.stringify(a.slice(-MAX)))}catch(e){}}
function between(t0,t1){return read().filter(function(m){return m.ts>=t0&&m.ts<=t1})}
// Pure part (tested): build a mark record from a position.
function make(typeId,pos,ts){
 if(!pos||!isFinite(Number(pos.lat))||!isFinite(Number(pos.lon!=null?pos.lon:pos.lng)))return null;
 return {id:"m"+Number(ts||Date.now()).toString(36)+Math.random().toString(36).slice(2,6),type:type(typeId).id,
  lat:+Number(pos.lat).toFixed(6),lng:+Number(pos.lon!=null?pos.lon:pos.lng).toFixed(6),ts:Number(ts||Date.now())};
}

/* ---------- map drawing ---------- */
var drawn={},mapRef=null;
function markerFor(m,map){
 var t=type(m.type);
 return new google.maps.Marker({map:map,position:{lat:m.lat,lng:m.lng},title:t.label,zIndex:60,
  icon:{path:google.maps.SymbolPath.CIRCLE,scale:12,fillColor:t.color,fillOpacity:1,strokeColor:"#fff",strokeWeight:2.5},
  label:{text:t.icon,fontFamily:"Material Symbols Rounded",color:"#fff",fontSize:"15px"}});
}
function drawOn(map,marks){
 if(!map||!root.google||!google.maps)return [];
 return (marks||[]).map(function(m){try{return markerFor(m,map)}catch(e){return null}}).filter(Boolean);
}
function syncLiveMap(){
 var ctx=root.GaZonMapContext,map=ctx&&ctx.getMap&&ctx.getMap();
 if(!map||!root.google||!google.maps)return false;
 mapRef=map;
 read().slice(-300).forEach(function(m){if(!drawn[m.id])try{drawn[m.id]=markerFor(m,map)}catch(e){}});
 return true;
}

/* ---------- UI ---------- */
function $(id){return document.getElementById(id)}
function toast(text,undo){
 var el=$("grMarkToast");
 if(!el){el=document.createElement("div");el.id="grMarkToast";el.className="gr-mark-toast";el.setAttribute("role","status");document.body.appendChild(el)}
 el.innerHTML='<span>'+text+'</span>'+(undo?'<button type="button">Geri al</button>':'');
 el.classList.add("show");
 var b=el.querySelector("button");if(b)b.onclick=function(){undo();el.classList.remove("show")};
 clearTimeout(toast._t);toast._t=setTimeout(function(){el.classList.remove("show")},5000);
}
function remove(id){
 write(read().filter(function(m){return m.id!==id}));
 if(drawn[id]){try{drawn[id].setMap(null)}catch(e){}delete drawn[id]}
}
function add(typeId){
 var ctx=root.GaZonMapContext,pos=ctx&&ctx.getCurrentPoint&&ctx.getCurrentPoint();
 var m=make(typeId,pos);
 if(!m){toast("Konum henüz yok · GPS bekleniyor");return null}
 var a=read();a.push(m);write(a);
 if(syncLiveMap()===false&&mapRef)try{drawn[m.id]=markerFor(m,mapRef)}catch(e){}
 try{if(navigator.vibrate)navigator.vibrate(30)}catch(e){}
 toast(type(m.type).label+" işaretlendi",function(){remove(m.id)});
 return m;
}
function close(){var s=$("grMarkSheet");if(s)s.classList.remove("open")}
function open(){
 var s=$("grMarkSheet");
 if(!s){
  s=document.createElement("div");s.id="grMarkSheet";s.className="gr-mark-sheet";s.setAttribute("role","dialog");s.setAttribute("aria-label","Yer işaretle");
  s.innerHTML='<div class="gr-mark-panel"><div class="gr-mark-head"><b>Buraya işaret bırak</b><button type="button" class="gr-mark-x" aria-label="Kapat"><span class="mi">close</span></button></div>'+
   '<div class="gr-mark-grid">'+TYPES.map(function(t){
    return '<button type="button" data-mark="'+t.id+'" style="--mk:'+t.color+'"><span class="mi">'+t.icon+'</span><span>'+t.label+'</span></button>'}).join("")+'</div></div>';
  document.body.appendChild(s);
  s.addEventListener("click",function(e){if(e.target===s)close()});
  s.querySelector(".gr-mark-x").onclick=close;
  s.querySelectorAll("[data-mark]").forEach(function(b){b.onclick=function(){add(b.getAttribute("data-mark"));close()}});
 }
 s.classList.add("open");
}
function button(id,cls){
 var b=document.createElement("button");b.type="button";b.id=id;b.className=cls||"";
 b.setAttribute("aria-label","Yer işaretle");b.title="Yer işaretle (mola, su, asfalt…)";
 b.innerHTML='<span class="mi">add_location_alt</span>';b.onclick=open;return b;
}
function install(){
 // Ride screen: next to the other map buttons.
 var bar=document.querySelector(".mapBottom");
 if(bar&&!$("grMarkFab"))bar.appendChild(button("grMarkFab","mapBtn"));
 // Navigation (guidance) screen: in the floating button column.
 var fl=document.querySelector(".guidanceFloat");
 if(fl&&!$("grMarkNav"))fl.appendChild(button("grMarkNav",""));
 // Draw saved marks once the main map exists.
 var tries=0;(function wait(){if(syncLiveMap()||++tries>60)return;setTimeout(wait,1000)})();
}
var api={TYPES:TYPES,type:type,make:make,read:read,between:between,add:add,remove:remove,open:open,drawOn:drawOn};
root.GaZonMarks=api;
if(typeof module!=="undefined"&&module.exports)module.exports=api;
if(typeof document!=="undefined"){if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install);else install()}
})(typeof window!=="undefined"?window:globalThis);
