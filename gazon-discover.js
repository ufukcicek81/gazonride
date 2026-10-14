/* Keşfet (Discover) cleanup + "Sürüşlerim".
 * - Keşfet opens with the rider's own latest rides (horizontal strip), then
 *   the route recommendations.
 * - New "Sürüşlerim" chip lists every saved ride; tapping a ride opens the
 *   3D replay.
 * - The duplicate "Navigasyonu Aç / Intercom" row and the floating music
 *   button are hidden here (both live on the Rota and Sürüş tabs). Their
 *   elements stay in the DOM because other buttons forward clicks to them.
 */
(function(){
"use strict";
var $=function(id){return document.getElementById(id)};
var J=function(){return window.GaZonJournal};
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function rides(){try{var a=JSON.parse(localStorage.getItem("gazon_rides")||"[]");return Array.isArray(a)?a:[]}catch(e){return []}}

function rideTile(r,i,wide){
 var j=J(),badge='<span class="gr-myride-play"><span class="mi">3d_rotation</span> 3D Tekrar</span>';
 var body=j&&j.rideCard?j.rideCard(r,{w:640,h:wide?320:300,badge:badge}):esc(r.destination||"Sürüş")+" · "+Number(r.km||0).toFixed(1)+" km";
 return '<div class="gr-myride-wrap'+(wide?' wide':'')+'"><button type="button" class="gr-myride'+(wide?' wide':'')+'" data-myride="'+i+'" aria-label="3D tekrarı aç">'+body+'</button>'+
  '<button type="button" class="gr-myride-del" data-myride-del="'+i+'" aria-label="Bu sürüşü sil" title="Sürüşü sil"><span class="mi">delete</span></button>'+
  '<button type="button" class="gr-myride-pub" data-myride-pub="'+i+'" aria-label="Keşfet\'e gönder" title="Keşfet\'e gönder (admin onayı)"><span class="mi">public</span></button></div>';
}
function bind(box){
 box.querySelectorAll("[data-myride]").forEach(function(b){b.onclick=function(){
  var r=rides()[Number(b.getAttribute("data-myride"))];
  if(r&&window.GaZonReplay)GaZonReplay.open(r);
 }});
 box.querySelectorAll("[data-myride-del]").forEach(function(b){b.onclick=function(e){
  e.stopPropagation();
  if(typeof window.GaZonDeleteRide==="function")window.GaZonDeleteRide(Number(b.getAttribute("data-myride-del")));
 }});
 box.querySelectorAll("[data-myride-pub]").forEach(function(b){b.onclick=function(e){
  e.stopPropagation();publish(Number(b.getAttribute("data-myride-pub")));
 }});
 var all=box.querySelector("[data-myrides-all]");if(all)all.onclick=function(){select(true)};
 var go=box.querySelector("[data-myrides-start]");if(go)go.onclick=function(){var t=document.querySelector('.bottom [data-page="ride"]');if(t)t.click()};
}
// Send a saved ride to Keşfet: the existing route form (photos, rest stops,
// description) stores it as a "pending" submission; it appears for everyone
// only after an admin approves it in admin.html.
function publish(i){
 var A=window.GaZonAuth;
 if(!A||!A.state||!A.state.user){
  var go=function(){location.href="login.html?next="+encodeURIComponent(location.href)};
  if(window.GaZonDialog)GaZonDialog.confirm({icon:"login",title:"Giriş gerekli",text:"Sürüşünü Keşfet'te paylaşmak için üye girişi yapmalısın.",ok:"Giriş yap"}).then(function(v){if(v)go()});
  else if(confirm("Sürüşünü Keşfet'te paylaşmak için üye girişi gerekli. Giriş sayfasına gidilsin mi?"))go();
  return;
 }
 if(window.GaZonRideSocial&&GaZonRideSocial.routeForm)GaZonRideSocial.routeForm(i);
}
function empty(){
 return '<div class="gr-myrides-empty"><span class="mi">two_wheeler</span><div><b>Henüz sürüş kaydın yok</b><small>Sürüş sekmesinde BAŞLAT’a bas; bittiğinde sürüşün burada 3D tekrarıyla görünür.</small></div>'+
  '<button type="button" data-myrides-start>Sürüşe başla</button></div>';
}
// strip: on Keşfet (latest 6). full: the Sürüşlerim tab.
function render(full){
 var box=$("grMyRides");if(!box)return;
 var rs=rides();
 if(full){
  box.innerHTML='<div class="gr-myrides-head"><div><b>Sürüşlerim</b><small>'+rs.length+' kayıtlı sürüş · dokun, 3D tekrarı izle</small></div></div>'+
   (rs.length?'<div class="gr-myrides-list">'+rs.map(function(r,i){return rideTile(r,i,true)}).join("")+'</div>':empty());
 }else{
  box.innerHTML='<div class="gr-myrides-head"><div><b>Son sürüşlerim</b><small>Dokun, 3D tekrarı izle</small></div>'+(rs.length>1?'<button type="button" data-myrides-all>Tümü</button>':'')+'</div>'+
   (rs.length?'<div class="gr-myrides-strip">'+rs.slice(0,6).map(function(r,i){return rideTile(r,i,false)}).join("")+'</div>':empty());
 }
 bind(box);
}
var mine=false;
function select(on){
 mine=on;
 document.body.classList.toggle("gr-discover-mine",on);
 var chip=$("grMyRidesChip");if(chip)chip.classList.toggle("active",on);
 if(on){
  document.querySelectorAll(".discoverTabs .chip").forEach(function(c){if(c!==chip)c.classList.remove("active")});
  document.body.classList.remove("gr-travel-active");
 }
 render(on);
 var box=$("grMyRides");if(on&&box)box.scrollIntoView({block:"start",behavior:"smooth"});
}
function install(){
 var tabs=document.querySelector(".discoverTabs");if(!tabs||$("grMyRidesChip"))return;
 var chip=document.createElement("button");chip.type="button";chip.className="chip";chip.id="grMyRidesChip";chip.textContent="Sürüşlerim";
 var first=tabs.querySelector('[data-discover="discover"]');
 if(first)first.insertAdjacentElement("afterend",chip);else tabs.prepend(chip);
 chip.addEventListener("click",function(){select(true)});
 // Any other chip leaves "Sürüşlerim"; Keşfet shows the strip again.
 tabs.addEventListener("click",function(e){
  var c=e.target.closest(".chip");if(!c||c===chip)return;
  if(mine)select(false);
  document.body.classList.toggle("gr-discover-home",c.getAttribute("data-discover")==="discover");
 });
 var box=document.createElement("section");box.id="grMyRides";box.className="gr-myrides";
 tabs.insertAdjacentElement("afterend",box);
 document.body.classList.add("gr-discover-home");
 render(false);
 // Refresh whenever Keşfet is opened (a ride may have been saved meanwhile).
 new MutationObserver(function(){
  var on=document.body.classList.contains("mode-discover");
  if(on&&!install._was)render(mine);
  install._was=on;
 }).observe(document.body,{attributes:true,attributeFilter:["class"]});
 window.addEventListener("storage",function(e){if(e.key==="gazon_rides")render(mine)});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install);else install();
window.GaZonDiscover={render:render,select:select};
})();
