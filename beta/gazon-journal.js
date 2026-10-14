/* GazOnRide Journal ("Günlük") + "Günün hissi" + lean calibration wizard.
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

/* ---------- Ride card v2: real map, real numbers ----------
 * Map: Google Static Maps image (the app's Maps key) with the route as an
 * encoded polyline. Underneath, an offline SVG of the route (Web Mercator)
 * shows when there is no key or the image fails to load. */
function pts3(track){
 return (Array.isArray(track)?track:[]).map(function(p){
  return Array.isArray(p)?{lat:Number(p[0]),lon:Number(p[1]),alt:p[2]==null?null:Number(p[2]),t:Number(p[3])||0}:null;
 }).filter(function(p){return p&&isFinite(p.lat)&&isFinite(p.lon)});
}
function hav(a,b){var R=6371,r=Math.PI/180,dLat=(b.lat-a.lat)*r,dLon=(b.lon-a.lon)*r,x=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLon/2)*Math.sin(dLon/2);return 2*R*Math.asin(Math.sqrt(x))}
function brg(a,b){var r=Math.PI/180,y=Math.sin((b.lon-a.lon)*r)*Math.cos(b.lat*r),x=Math.cos(a.lat*r)*Math.sin(b.lat*r)-Math.sin(a.lat*r)*Math.cos(b.lat*r)*Math.cos((b.lon-a.lon)*r);return (Math.atan2(y,x)/r+360)%360}
// Moving time, average speed, climb and curve count from the GPS track;
// stored ride fields are the fallback (old rides, no timestamps).
function metrics(r){
 var a=pts3(r&&r.track),km=Number(r&&r.km)||0,sec=0,mkm=0,climb=0,turns=0;
 for(var i=1;i<a.length;i++){
  var dt=(a[i].t-a[i-1].t)/1000,d=hav(a[i-1],a[i]);
  if(a[i].t&&a[i-1].t&&dt>0&&dt<=60){var v=d/(dt/3600);if(v>=4&&v<220){sec+=dt;mkm+=d}}
 }
 // Climb: smoothed altitude with a 3 m hysteresis against GPS noise.
 var alts=a.map(function(p){return p.alt}).filter(function(x){return x!=null&&isFinite(x)&&x!==0});
 if(alts.length>5){
  var sm=alts.map(function(_,i){var s=0,n=0;for(var j=Math.max(0,i-2);j<=Math.min(alts.length-1,i+2);j++){s+=alts[j];n++}return s/n});
  var base=sm[0];sm.forEach(function(h){if(h-base>=3){climb+=h-base;base=h}else if(h<base)base=h});
 }
 // Curves: resample every ~25 m, a curve = >=40° heading change within
 // 120 m; consecutive curves at least 80 m apart.
 if(a.length>3){
  var rs=[a[0]],acc=0;for(i=1;i<a.length;i++){acc+=hav(a[i-1],a[i]);if(acc>=.025){rs.push(a[i]);acc=0}}
  var hd=[];for(i=1;i<rs.length;i++)hd.push(brg(rs[i-1],rs[i]));
  var last=-99;
  for(i=0;i+4<hd.length;i++){
   var turn=0;for(var j=i+1;j<=i+4;j++){var dd=((hd[j]-hd[j-1]+540)%360)-180;turn+=dd}
   if(Math.abs(turn)>=40&&i-last>=3){turns++;last=i}
  }
 }
 var timed=a.filter(function(p){return p.t>0}).length>=2;
 var out={km:km,sec:Math.round(sec),climb:Math.round(climb),turns:turns};
 // Stored duration only for old rides without GPS timestamps: it counts
 // stops and a forgotten "stop" button (0.2 km shown as 1 h 31 min).
 if(!timed){var p=String(r&&r.duration||"").split(":").map(Number);var s2=Number(r&&r.durationSeconds)||(p.length===3?p[0]*3600+p[1]*60+p[2]:p.length===2?p[0]*60+p[1]:0);if(s2>0&&s2<86400)out.sec=s2}
 out.avg=out.sec>0&&(mkm||km)>0?Math.round((mkm||km)/(out.sec/3600)):0;
 if(!out.climb&&Number(r&&r.elev)>0)out.climb=Math.round(r.elev);
 if(!out.turns&&Number(r&&r.turns)>0)out.turns=Number(r.turns);
 return out;
}
function fmtDur(sec){
 sec=Math.round(Number(sec)||0);if(!sec)return "";
 var h=Math.floor(sec/3600),m=Math.round((sec%3600)/60);if(m===60){h++;m=0}
 return h?h+"sa "+m+"dk":Math.max(1,m)+"dk";
}
var MONTHS=["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
var DAYS=["Pazar","Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"];
function rideDate(r){
 var a=pts3(r&&r.track);if(a.length&&a[0].t)return new Date(a[0].t);
 var m=String(r&&r.date||"").match(/(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})/);
 return m?new Date(+m[3],+m[2]-1,+m[1],+m[4],+m[5]):null;
}
// "12 Ekim Pazartesi · Akşam sürüşü" unless the ride had a destination.
function rideTitle(r){
 if(r&&r.destination)return String(r.destination);
 var d=rideDate(r);if(!d||isNaN(d))return "Sürüş";
 var h=d.getHours(),part=h<5?"Gece":h<11?"Sabah":h<14?"Öğle":h<18?"İkindi":h<22?"Akşam":"Gece";
 return d.getDate()+" "+MONTHS[d.getMonth()]+" "+DAYS[d.getDay()]+" · "+part+" sürüşü";
}
function rideWhen(r){
 var d=rideDate(r);if(!d||isNaN(d))return esc(r&&r.date||"");
 return d.getDate()+" "+MONTHS[d.getMonth()]+" "+String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");
}
function isDark(){try{return !document.documentElement.classList.contains("theme-light")}catch(e){return true}}
function routeSvg(track,w,h){
 var pts=points(track);w=w||640;h=h||320;if(pts.length<2)return "";
 var step=Math.max(1,Math.floor(pts.length/500)),s=[];for(var i=0;i<pts.length;i+=step)s.push(pts[i]);
 if(s[s.length-1]!==pts[pts.length-1])s.push(pts[pts.length-1]);
 function px(p,z){var n=256*Math.pow(2,z),sin=Math.sin(p.lat*Math.PI/180);return [n*(p.lon+180)/360,n*(.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))]}
 var pad=34,z=17;
 for(;z>3;z--){
  var xs=s.map(function(p){return px(p,z)}),minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  xs.forEach(function(q){minX=Math.min(minX,q[0]);maxX=Math.max(maxX,q[0]);minY=Math.min(minY,q[1]);maxY=Math.max(maxY,q[1])});
  if(maxX-minX<=w-2*pad&&maxY-minY<=h-2*pad)break;
 }
 var x0=(minX+maxX)/2-w/2,y0=(minY+maxY)/2-h/2,tiles="";
 var d=xs.map(function(q,i){return (i?"L":"M")+(q[0]-x0).toFixed(1)+" "+(q[1]-y0).toFixed(1)}).join(""),a=xs[0],b=xs[xs.length-1];
 // Zoom levels are whole numbers; scale up (max 2x, @2x tiles stay sharp)
 // so the route fills the frame.
 var f=Math.max(1,Math.min(2,(w-2*pad)/Math.max(1,maxX-minX),(h-2*pad)/Math.max(1,maxY-minY)));
 var g='<g transform="translate('+w/2+' '+h/2+') scale('+f.toFixed(3)+') translate('+(-w/2)+' '+(-h/2)+')">',ns=' vector-effect="non-scaling-stroke"',rr=(10/f).toFixed(2);
 return '<svg class="gr-j-map" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Sürüş haritası">'+
  '<rect width="'+w+'" height="'+h+'" fill="'+(isDark()?"#1d2229":"#e9edf0")+'"/>'+g+tiles+
  '<path d="'+d+'" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity=".85"'+ns+'/>'+
  '<path d="'+d+'" fill="none" stroke="#E5322D" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"'+ns+'/>'+
  '<circle cx="'+(a[0]-x0).toFixed(1)+'" cy="'+(a[1]-y0).toFixed(1)+'" r="'+rr+'" fill="#22C55E" stroke="#fff" stroke-width="3"'+ns+'/>'+
  '<circle cx="'+(b[0]-x0).toFixed(1)+'" cy="'+(b[1]-y0).toFixed(1)+'" r="'+rr+'" fill="#DC2626" stroke="#fff" stroke-width="3"'+ns+'/></g>'+
  '</svg>';
}
function mapsKey(){
 try{
  var k=root.GAZONRIDE_GOOGLE_MAPS_API_KEY||"";
  if(!k&&root.AndroidBridge&&typeof root.AndroidBridge.getGoogleMapsApiKey==="function")k=String(root.AndroidBridge.getGoogleMapsApiKey()||"");
  return k&&k.indexOf("__")!==0?k:"";
 }catch(e){return ""}
}
// Google encoded polyline (precision 5).
function encodePath(pts){
 var out="",pl=0,pg=0;
 function enc(v){v=v<0?~(v<<1):v<<1;var s="";while(v>=32){s+=String.fromCharCode((32|(v&31))+63);v>>=5}return s+String.fromCharCode(v+63)}
 pts.forEach(function(p){var la=Math.round(p.lat*1e5),lo=Math.round(p.lon*1e5);out+=enc(la-pl)+enc(lo-pg);pl=la;pg=lo});
 return out;
}
var DARK_STYLE=["element:geometry|color:0x1d2229","element:labels.text.fill|color:0x9aa4b2","element:labels.text.stroke|color:0x111418",
 "feature:road|element:geometry|color:0x3a4250","feature:road.highway|element:geometry|color:0x56606e","feature:water|element:geometry|color:0x0e2a3b",
 "feature:poi|visibility:off","feature:transit|visibility:off"];
var LIGHT_STYLE=["feature:poi|visibility:off","feature:transit|visibility:off"];
// GPS jitter makes a hand-drawn looking line: drop points closer than 8 m,
// then a light 5-point moving average (ends kept exact).
function smoothTrack(pts){
 var k=[];pts.forEach(function(p){if(!k.length||hav(k[k.length-1],p)>=.008)k.push(p)});
 if(k.length<5)return k;
 return k.map(function(p,i){
  if(i<2||i>k.length-3)return p;
  var la=0,lo=0;for(var j=i-2;j<=i+2;j++){la+=k[j].lat;lo+=k[j].lon}
  return {lat:la/5,lon:lo/5};
 });
}
function mercX(p,z){return 256*Math.pow(2,z)*(p.lon+180)/360}
function mercY(p,z){var s=Math.sin(p.lat*Math.PI/180);return 256*Math.pow(2,z)*(.5-Math.log((1+s)/(1-s))/(4*Math.PI))}
// Our own center/zoom (same fit as the SVG) so the dots can be sized in pixels.
function fitView(pts,w,h,pad){
 var minLa=Infinity,maxLa=-Infinity,minLo=Infinity,maxLo=-Infinity;
 pts.forEach(function(p){minLa=Math.min(minLa,p.lat);maxLa=Math.max(maxLa,p.lat);minLo=Math.min(minLo,p.lon);maxLo=Math.max(maxLo,p.lon)});
 var sw={lat:minLa,lon:minLo},ne={lat:maxLa,lon:maxLo},z=17;
 for(;z>3;z--)if(mercX(ne,z)-mercX(sw,z)<=w-2*pad&&mercY(sw,z)-mercY(ne,z)<=h-2*pad)break;
 return {center:{lat:(minLa+maxLa)/2,lon:(minLo+maxLo)/2},zoom:z};
}
// Filled circle as a polygon path, radius in screen pixels at zoom z.
function dotPath(p,z,px,fill){
 var m=px*156543.03392*Math.cos(p.lat*Math.PI/180)/Math.pow(2,z),pts=[];
 for(var i=0;i<=20;i++){var a=i/20*2*Math.PI;pts.push({lat:p.lat+m*Math.cos(a)/111320,lon:p.lon+m*Math.sin(a)/(111320*Math.cos(p.lat*Math.PI/180))})}
 return "path="+encodeURIComponent("color:0x00000000|weight:0|fillcolor:"+fill+"|enc:"+encodePath(pts));
}
function staticMapUrl(track,w,h,key){
 var pts=points(track);if(pts.length<2||!key)return "";
 pts=smoothTrack(pts);if(pts.length<2)return "";
 var max=300,step=Math.max(1,Math.ceil(pts.length/max)),s=[];
 for(var i=0;i<pts.length;i+=step)s.push(pts[i]);if(s[s.length-1]!==pts[pts.length-1])s.push(pts[pts.length-1]);
 var W=Math.min(640,w),H=Math.min(640,h),v=fitView(s,W,H,36),a=s[0],b=s[s.length-1],q=[
  "size="+W+"x"+H,"scale=2","maptype=roadmap","language=tr",
  "center="+v.center.lat.toFixed(6)+","+v.center.lon.toFixed(6),"zoom="+v.zoom,
  // Thin red line on a soft white halo; round start/end dots drawn as
  // filled circles (no marker pins, no external icon files).
  "path="+encodeURIComponent("color:0xFFFFFFB3|weight:6|enc:"+encodePath(s)),
  "path="+encodeURIComponent("color:0xE5322DFF|weight:3|enc:"+encodePath(s)),
  dotPath(a,v.zoom,7.5,"0xFFFFFFFF"),dotPath(a,v.zoom,5,"0x22C55EFF"),
  dotPath(b,v.zoom,7.5,"0xFFFFFFFF"),dotPath(b,v.zoom,5,"0xDC2626FF")
 ];
 (isDark()?DARK_STYLE:LIGHT_STYLE).forEach(function(x){q.push("style="+encodeURIComponent(x))});
 q.push("key="+encodeURIComponent(key));
 return "https://maps.googleapis.com/maps/api/staticmap?"+q.join("&");
}
// Story video (gazon-story.js): a plain dark map (no path, the route is
// animated on top) plus a projector from lat/lon to image pixels (scale 2).
function storyMap(track,w,h){
 var pts=smoothTrack(points(track));if(pts.length<2)return null;
 var W=Math.min(640,w),H=Math.min(640,h),v=fitView(pts,W,Math.round(H*.6),Math.round(W*.1)),key=(root.GAZONRIDE_STATIC_MAPS_KEY&&String(root.GAZONRIDE_STATIC_MAPS_KEY))||mapsKey();
 var cx=mercX(v.center,v.zoom),cy=mercY(v.center,v.zoom),x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
 pts.forEach(function(p){var x=mercX(p,v.zoom),y=mercY(p,v.zoom);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y)});
 // Zoom levels are powers of two: how much more the route could be enlarged.
 var pad=Math.round(W*.1),fit=Math.max(1,Math.min((W-2*pad)/Math.max(1,x1-x0),(Math.round(H*.6)-2*pad)/Math.max(1,y1-y0),2));
 function project(p){return [(mercX(p,v.zoom)-cx)*2+W,(mercY(p,v.zoom)-cy)*2+H]}
 var q=["size="+W+"x"+H,"scale=2","maptype=roadmap","language=tr","center="+v.center.lat.toFixed(6)+","+v.center.lon.toFixed(6),"zoom="+v.zoom];
 DARK_STYLE.forEach(function(x){q.push("style="+encodeURIComponent(x))});
 if(key)q.push("key="+encodeURIComponent(key));
 return {url:key?"https://maps.googleapis.com/maps/api/staticmap?"+q.join("&"):"",width:W*2,height:H*2,zoom:v.zoom,fit:fit,points:pts,project:project};
}
function mapView(track,w,h){
 var svg=routeSvg(track,w,h);if(!svg)return "";
 // A separate Static-Maps-only key can be set without touching the main key.
 var url=staticMapUrl(track,w||640,h||320,(root.GAZONRIDE_STATIC_MAPS_KEY&&String(root.GAZONRIDE_STATIC_MAPS_KEY))||mapsKey());
 return svg+(url?'<img class="gr-j-mapimg" loading="lazy" decoding="async" alt="Sürüş haritası" src="'+esc(url)+'" onerror="this.remove()">':'');
}
function bikeName(r){
 var m=r&&r.motor||{};
 // Rides saved with the old built-in default KTM (never chosen by the rider).
 if(m.brand==="KTM"&&m.model==="1290 Super Adventure"&&Number(m.tank)===23&&Number(m.consumption)===5.5&&!m.year)return "";
 return [m.brand,m.model].filter(Boolean).join(" ");
}
// Full card used in Keşfet / Sürüşlerim and the journal.
function rideCard(r,opts){
 opts=opts||{};var m=metrics(r||{}),mood=moodLine(r),bike=bikeName(r);
 var bits=[];if(m.sec)bits.push(fmtDur(m.sec));if(m.avg>0)bits.push("⌀ "+m.avg+" km/sa");if(m.climb>0)bits.push("↑ "+m.climb+" m");bits.push(m.turns+" viraj");
 return '<div class="gr-ride-card">'+
  '<div class="gr-ride-card-top">'+(bike?'<small class="gr-ride-bike">'+esc(bike)+'</small>':'')+'<b class="gr-ride-title">'+esc(rideTitle(r))+'</b>'+
  (mood?'<small class="gr-ride-mood">'+esc(mood)+'</small>':'')+'</div>'+
  '<div class="gr-ride-map">'+(mapView(r&&r.track,opts.w||640,opts.h||320)||'<div class="gr-ride-nomap">GPS izi yok</div>')+(opts.badge||'')+'</div>'+
  '<div class="gr-ride-stats"><b>'+(Number(m.km)||0).toFixed(1).replace(".",",")+' km</b><span>'+bits.map(esc).join(" · ")+'</span></div>'+
  '<small class="gr-ride-when">'+rideWhen(r)+'</small></div>';
}
var api={MOODS:MOODS,thumb:thumb,card:card,rideCard:rideCard,mapView:mapView,metrics:metrics,rideTitle:rideTitle,fmtDur:fmtDur,stats:stats,avgSpeed:avgSpeed,moodLine:moodLine,moodPicker:moodPicker,leanWizard:leanWizard,points:points,storyMap:storyMap};
root.GaZonJournal=api;
if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);

/* iPhone / browser lean sensor (no Android app): DeviceMotion gravity,
 * same "rotation about the bike axis" math as the Android app. iOS needs
 * DeviceMotionEvent.requestPermission() from a tap, so start() must be
 * called from a button handler. Feeds window.GaZonLean.onSensor(). */
(function(root){
"use strict";
if(typeof window==="undefined")return;
var on=false,ref=null,zeroSet=false,f=0,maxL=0,maxR=0,last=0;
var ios=/iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
function basis(g){
 var n=Math.hypot(g[0],g[1],g[2])||1,x=g[0]/n,y=g[1]/n,z=g[2]/n;
 var ax=-z*x,ay=-z*y,az=1-z*z,an=Math.hypot(ax,ay,az);
 if(an<.15){ax=-y*x;ay=1-y*y;az=-y*z;an=Math.hypot(ax,ay,az)}
 return [x,y,z,ax/an,ay/an,az/an];
}
function onMotion(e){
 var a=e.accelerationIncludingGravity;if(!a||a.x==null)return;
 // "Up" in device coordinates. iOS reports the opposite sign to Android.
 var s=ios?-1:1,g=[s*a.x,s*a.y,s*a.z];
 if(!ref)ref=basis(g);
 var r=ref,cx=r[1]*g[2]-r[2]*g[1],cy=r[2]*g[0]-r[0]*g[2],cz=r[0]*g[1]-r[1]*g[0];
 var deg=Math.atan2(cx*r[3]+cy*r[4]+cz*r[5],r[0]*g[0]+r[1]*g[1]+r[2]*g[2])*180/Math.PI;
 deg=Math.max(-90,Math.min(90,deg));
 var d=deg-f;if(Math.abs(d)>22&&zeroSet)return; // vibration spike
 zeroSet=true;f+=(Math.abs(d)>8?.10:.07)*d;if(Math.abs(f)<.7)f=0;
 if(f<0)maxL=Math.max(maxL,-f);else maxR=Math.max(maxR,f);
 var now=Date.now();if(now-last<90)return;last=now;
 if(root.GaZonLean&&root.GaZonLean.onSensor)root.GaZonLean.onSensor(f,maxL,maxR);
}
var api={
 available:function(){return "DeviceMotionEvent" in window},
 start:function(){
  if(on||!api.available())return Promise.resolve(on);
  var ask=window.DeviceMotionEvent&&typeof DeviceMotionEvent.requestPermission==="function"?DeviceMotionEvent.requestPermission():Promise.resolve("granted");
  return Promise.resolve(ask).then(function(state){
   if(state!=="granted")return false;
   window.addEventListener("devicemotion",onMotion);on=true;return true;
  },function(){return false});
 },
 calibrate:function(){ref=null;zeroSet=false;f=0;maxL=0;maxR=0},
 stop:function(){window.removeEventListener("devicemotion",onMotion);on=false},
 get active(){return on}
};
root.GaZonWebLean=api;
})(typeof window!=="undefined"?window:globalThis);
