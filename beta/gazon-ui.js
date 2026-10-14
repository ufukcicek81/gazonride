/* GazOnRide UI v3 behaviour (pairs with gazon-ui.css).
 * - 5 tabs: Sürüş · Rota · Turlar · Keşfet · Profil (intercom moves into
 *   the ride screen as a map button)
 * - collapsible ride sheet; map buttons follow the sheet height
 * - beta channel switch (Android) and BETA badge
 * No navigation or ride logic lives here.
 */
(function(){
"use strict";
var $=function(id){return document.getElementById(id)};
function onReady(fn){if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",fn);else fn()}

function tabs(){
 document.documentElement.classList.add("gr-tabs-v3");
 // Rota and Turlar both live on the planning map; keep the tour panel in sync.
 document.querySelectorAll('.bottom [data-page="navigation"],.bottom [data-page="tours"]').forEach(function(btn){
  btn.addEventListener("click",function(){
   var tour=btn.dataset.page==="tours";
   setTimeout(function(){if(window.GaZonTour)GaZonTour.setMode(tour?"tour":"destination")},0);
  });
 });
}
// Each tab click must also highlight the tab even when the legacy nav()
// handler only knows "navigation".
function syncActiveTab(){
 var body=document.body,tour=body.classList.contains("gr-tour-mode");
 var page=body.classList.contains("mode-ride")?"ride":body.classList.contains("mode-navigation")?(tour?"tours":"navigation"):
  body.classList.contains("mode-discover")?"discover":null;
 if(!page)return;
 document.querySelectorAll(".bottom .navBtn").forEach(function(b){
  var on=b.dataset.page===page;b.classList.toggle("active",on);
  if(on)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current");
 });
}

function rideSheet(){
 var grid=document.querySelector(".content .grid");if(!grid)return;
 var handle=document.createElement("button");
 handle.type="button";handle.className="gr-sheet-handle";
 handle.setAttribute("aria-label","Sürüş ayrıntılarını aç veya kapat");
 handle.setAttribute("aria-expanded","false");
 grid.insertBefore(handle,grid.firstChild);
 var saved=false;try{saved=localStorage.getItem("gazon_ride_sheet")==="1"}catch(e){}
 function apply(open){
  document.body.classList.toggle("gr-ride-expanded",open);
  handle.setAttribute("aria-expanded",String(open));
  try{localStorage.setItem("gazon_ride_sheet",open?"1":"0")}catch(e){}
  measure();
 }
 handle.addEventListener("click",function(){apply(!document.body.classList.contains("gr-ride-expanded"))});
 apply(saved);
 function measure(){
  requestAnimationFrame(function(){
   var h=grid.getBoundingClientRect().height;
   if(h>0)document.documentElement.style.setProperty("--gr-sheet-h",Math.round(h+80)+"px");
  });
 }
 if(window.ResizeObserver)new ResizeObserver(measure).observe(grid);
 window.addEventListener("resize",measure);
}

function intercomButton(){
 var bar=document.querySelector(".mapBottom");if(!bar||$("grIntercomFab"))return;
 var b=document.createElement("button");
 b.id="grIntercomFab";b.type="button";b.className="mapBtn";
 b.setAttribute("aria-label","Intercom");b.title="Intercom";
 b.innerHTML='<span class="mi">headset_mic</span>';
 b.addEventListener("click",function(){
  var q=$("quickIntercom");if(q)q.click();
 });
 bar.appendChild(b);
}

function beta(){
 var isBeta=/\/beta\//.test(location.pathname);
 if(isBeta){
  var badge=document.createElement("div");badge.className="gr-beta-badge";badge.textContent="BETA";
  document.body.appendChild(badge);
 }
 var bridge=window.AndroidBridge;
 if(!bridge||typeof bridge.setWebChannel!=="function")return;
 // Profile screen is rendered on demand; add the switch when it appears.
 var screen=$("screen");if(!screen)return;
 new MutationObserver(function(){
  if(!screen.classList.contains("active")||$("grBetaChannel"))return;
  var title=screen.querySelector(".screenTitle");
  if(!title||!/Profil/i.test(title.textContent))return;
  var channel="stable";try{channel=bridge.getWebChannel()}catch(e){}
  var card=document.createElement("div");
  card.className="screenCard";card.id="grBetaChannel";
  card.innerHTML='<b>Test sürümü (beta)</b><div class="sub" style="margin:6px 0 10px">Yeni navigasyon ve tur özelliklerini ana sürümden önce dene. İstediğin an normal sürüme dönebilirsin.</div>'+
   '<button type="button" class="btn '+(channel==="beta"?"dark":"red")+'" style="width:100%">'+(channel==="beta"?"Normal sürüme dön":"Beta sürümüne geç")+'</button>';
  card.querySelector("button").onclick=function(){try{bridge.setWebChannel(channel==="beta"?"stable":"beta")}catch(e){}};
  screen.appendChild(card);
 }).observe(screen,{childList:true,subtree:false,attributes:true,attributeFilter:["class"]});
}

// Profile screen for guests: explain what an account adds, one tap to sign up.
function guestCard(){
 var screen=$("screen");if(!screen)return;
 new MutationObserver(function(){
  var auth=window.GaZonAuth;
  if(!auth||!auth.state||auth.state.user||!(auth.isGuest&&auth.isGuest()))return;
  var title=screen.querySelector(".screenTitle");
  if(!title||!/Profil/i.test(title.textContent)||$("grGuestCard"))return;
  var card=document.createElement("div");card.className="screenCard";card.id="grGuestCard";
  card.innerHTML='<b>Misafir olarak kullanıyorsun</b><div class="sub" style="margin:6px 0 10px">Sürüşlerin bu cihazda saklanıyor. Üye olursan sürüş geçmişin hesabına bağlanır, toplulukta paylaşım yapabilir ve gruplara katılabilirsin.</div>'+
   '<button type="button" class="btn red" style="width:100%">Üye ol / Giriş yap</button>';
  card.querySelector("button").onclick=function(){location.href="login.html?next="+encodeURIComponent(location.href)};
  var head=screen.querySelector(".screenHead");
  if(head&&head.nextSibling)screen.insertBefore(card,head.nextSibling);else screen.appendChild(card);
 }).observe(screen,{childList:true,attributes:true,attributeFilter:["class"]});
}
// Inside the Android app an external link (photo credit, Wikipedia, maps…)
// replaced the app in the WebView with no way back. Open such links in the
// phone's browser instead; app pages (same origin) still load in place.
function externalLinks(){
 var B=window.AndroidBridge;if(!B||typeof B.openExternal!=="function")return;
 document.addEventListener("click",function(e){
  var a=e.target&&e.target.closest&&e.target.closest("a[href]");if(!a)return;
  var url;try{url=new URL(a.getAttribute("href"),location.href)}catch(err){return}
  if(url.origin===location.origin||!/^(https?|mailto|tel|whatsapp|geo|intent):$/.test(url.protocol))return;
  e.preventDefault();e.stopPropagation();
  try{B.openExternal(url.href)}catch(err){}
 },true);
 var open=window.open;
 window.open=function(u){
  try{var url=new URL(String(u),location.href);if(url.origin!==location.origin){B.openExternal(url.href);return null}}catch(err){}
  return open.apply(window,arguments);
 };
}
onReady(function(){
 externalLinks();
 guestCard();
 tabs();rideSheet();intercomButton();beta();
 new MutationObserver(syncActiveTab).observe(document.body,{attributes:true,attributeFilter:["class"]});
 syncActiveTab();
});
})();
