/* GaZonRide Journal ("Günlük") + "Günün hissi" + lean calibration wizard.
 * - offline SVG route thumbnail for each recorded ride (no map API cost)
 * - richer ride cards: km, time, avg speed, climb, curves, moods
 * - mood tags on the ride summary, stored on the ride and added to
 *   community posts
 * - step-by-step lean calibration with a live stability meter
 */
(function(root){
"use strict";
var MOODS=["Keyifli","Keşif dolu","Sakin","Manzaralı","Adrenalin","Yorucu","Grup sürüşü","Yağmurlu"];
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function points(track){
 return (Array.isArray(track)?track:[]).map(function(p){
  if(Array.isArray(p))return {lat:Number(p[0]),lon:Number(p[1])};
  return p?{lat:Number(p.lat),lon:Number(p.lon!=null?p.lon:p.lng)}:null;
 }).filter(function(p){return p&&isFinite(p.lat)&&isFinite(p.lon)});
}
// Equirectangular projection into a w x h box, aspect preserved.
function thumb(track,w,h){
 var pts=points(track);w=w||320;h=h||150;
 if(pts.length<2)return "";
 var step=Math.max(1,Math.floor(pts.length/400)),s=[];
 for(var i=0;i<pts.length;i+=step)s.push(pts[i]);
 if(s[s.length-1]!==pts[pts.length-1])s.push(pts[pts.length-1]);
 var k=Math.cos(s[0].lat*Math.PI/180),minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
 s.forEach(function(p){var x=p.lon*k,y=-p.lat;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y)});
 var pad=14,sw=Math.max(1e-9,maxX-minX),sh=Math.max(1e-9,maxY-minY),scale=Math.min((w-2*pad)/sw,(h-2*pad)/sh);
 var ox=(w-sw*scale)/2,oy=(h-sh*scale)/2;
 var xy=s.map(function(p){return [(p.lon*k-minX)*scale+ox,(-p.lat-minY)*scale+oy]});
 var d=xy.map(function(q,i){return (i?"L":"M")+q[0].toFixed(1)+" "+q[1].toFixed(1)}).join("");
 var a=xy[0],b=xy[xy.length-1];
 return '<svg class="gr-j-thumb" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Rota çizimi">'+
  '<path d="'+d+'" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>'+
  '<path d="'+d+'" fill="none" stroke="#FF5A1F" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>'+
  '<circle cx="'+a[0].toFixed(1)+'" cy="'+a[1].toFixed(1)+'" r="7" fill="#16A34A" stroke="#fff" stroke-width="2.5"/>'+
  '<circle cx="'+b[0].toFixed(1)+'" cy="'+b[1].toFixed(1)+'" r="7" fill="#DC2626" stroke="#fff" stroke-width="2.5"/></svg>';
}
function avgSpeed(r){
 var sec=Number(r&&r.durationSeconds)||0;
 if(!sec&&r&&r.duration){var p=String(r.duration).split(":").map(Number);sec=p.length===3?p[0]*3600+p[1]*60+p[2]:p[0]*60+(p[1]||0)}
 return sec>0?Math.round(Number(r.km||0)/(sec/3600)):0;
}
function stats(r){
 var bits=[Number(r.km||0).toFixed(1)+" km",esc(r.duration||"")];
 var v=avgSpeed(r);if(v>0)bits.push("⌀ "+v+" km/sa");
 if(Number(r.elev)>0)bits.push("↑ "+Math.round(r.elev)+" m");
 bits.push(Number(r.turns||0)+" viraj");
 return bits.join(" · ");
}
function moodLine(r){return r&&Array.isArray(r.moods)&&r.moods.length?"Günün hissi: "+r.moods.join(", "):""}
// Card body inserted at the top of every ride in "Sürüş Geçmişim".
function card(r){
 if(!r)return "";
 var m=moodLine(r);
 return '<div class="gr-j-card">'+thumb(r.track)+
  '<div class="gr-j-title">'+esc(r.destination||"Serbest sürüş")+'</div>'+
  '<div class="gr-j-date">'+esc(r.date||"")+'</div>'+
  '<div class="gr-j-stats">'+stats(r)+'</div>'+
  (m?'<div class="gr-j-mood">'+esc(m)+'</div>':'')+'</div>';
}
function readRides(){try{var a=JSON.parse(localStorage.getItem("gazon_rides")||"[]");return Array.isArray(a)?a:[]}catch(e){return []}}
function saveMoods(ride,moods){
 var rs=readRides();
 for(var i=0;i<rs.length;i++){
  if(rs[i]&&rs[i].date===ride.date&&Number(rs[i].km)===Number(ride.km)){rs[i].moods=moods;break}
 }
 try{localStorage.setItem("gazon_rides",JSON.stringify(rs))}catch(e){}
 ride.moods=moods;
}
// "Günün hissi" chips; returns the element to insert in the ride summary.
function moodPicker(ride){
 var box=document.createElement("div");box.className="gr-j-moods";
 var chosen=Array.isArray(ride.moods)?ride.moods.slice():[];
 box.innerHTML='<h3>GÜNÜN HİSSİ</h3><div class="gr-j-chips">'+MOODS.map(function(m){
  return '<button type="button" class="gr-j-chip'+(chosen.indexOf(m)>=0?' on':'')+'" aria-pressed="'+(chosen.indexOf(m)>=0)+'">'+esc(m)+'</button>'}).join("")+'</div>';
 box.querySelectorAll(".gr-j-chip").forEach(function(b){
  b.onclick=function(){
   var m=b.textContent,i=chosen.indexOf(m);
   if(i>=0)chosen.splice(i,1);else if(chosen.length<4)chosen.push(m);
   box.querySelectorAll(".gr-j-chip").forEach(function(x){var on=chosen.indexOf(x.textContent)>=0;x.classList.toggle("on",on);x.setAttribute("aria-pressed",String(on))});
   saveMoods(ride,chosen.slice());
  };
 });
 return box;
}

/* Lean calibration wizard. Stability = spread of the live lean angle over
 * the last 1.5 s; "Sabit" below 0.8°. Works for portrait and landscape
 * mounts (native lean is measured around the bike axis, see MainActivity). */
function leanWizard(opts){
 opts=opts||{};
 var samples=[],timer=null,el=document.createElement("div");
 el.className="gr-j-wizard";el.setAttribute("role","dialog");el.setAttribute("aria-label","Yatış kalibrasyonu");
 el.innerHTML='<div class="gr-j-wiz-card">'+
  '<div class="gr-j-wiz-head"><b>Yatış kalibrasyonu</b><button type="button" class="gr-j-x" aria-label="Kapat">✕</button></div>'+
  '<p>Yatışı ölçebilmek için önce motosikletin dik hâlini öğrenmemiz gerekiyor.</p>'+
  '<ol class="gr-j-steps"><li>Telefonu mount’a tak, oynamadığından emin ol</li><li>Motosikleti dik tut, sehpadan indir</li><li>Sabitlenince onayla</li></ol>'+
  '<div class="gr-j-stab"><div class="gr-j-stab-row"><i></i><b>Bekleniyor…</b></div><div class="gr-j-bar"><span></span></div><small>Telefon dikey veya yatay takılabilir; yön otomatik algılanır.</small></div>'+
  '<button type="button" class="gr-j-go" disabled>Onayla ve başla</button>'+
  '<button type="button" class="gr-j-skip">Kalibrasyonsuz başla</button></div>';
 document.body.appendChild(el);
 var label=el.querySelector(".gr-j-stab-row b"),dot=el.querySelector(".gr-j-stab-row i"),bar=el.querySelector(".gr-j-bar span"),go=el.querySelector(".gr-j-go");
 var lean=root.GaZonLean,original=lean&&lean.onSensor;
 // Temporarily observe the native lean stream.
 if(lean)lean.onSensor=function(a){samples.push({t:Date.now(),a:Number(a)||0});return original&&original.apply(lean,arguments)};
 if(opts.start)try{opts.start()}catch(e){}
 function tick(){
  var now=Date.now();samples=samples.filter(function(s){return now-s.t<1500});
  if(samples.length<5){label.textContent=opts.available===false?"Sensör yok":"Sensör bekleniyor…";bar.style.width="10%";go.disabled=true;return}
  var min=Infinity,max=-Infinity;samples.forEach(function(s){min=Math.min(min,s.a);max=Math.max(max,s.a)});
  var spread=max-min,stable=spread<.8;
  label.textContent=stable?"Sabit":"Sabitleniyor… ("+spread.toFixed(1)+"°)";
  el.querySelector(".gr-j-stab").classList.toggle("ok",stable);
  bar.style.width=Math.max(10,Math.min(100,100-spread*25))+"%";
  go.disabled=!stable;
 }
 timer=setInterval(tick,250);tick();
 function close(){clearInterval(timer);if(lean)lean.onSensor=original;el.remove()}
 el.querySelector(".gr-j-x").onclick=close;
 el.querySelector(".gr-j-skip").onclick=close;
 go.onclick=function(){if(opts.calibrate)try{opts.calibrate()}catch(e){}close()};
 return {close:close};
}
var api={MOODS:MOODS,thumb:thumb,card:card,stats:stats,avgSpeed:avgSpeed,moodLine:moodLine,moodPicker:moodPicker,leanWizard:leanWizard,points:points};
root.GaZonJournal=api;
if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
