/* Weather for riders (Open-Meteo, no key).
 * - Route weather: points every ~25 km along the chosen route, each with the
 *   forecast for the hour the rider gets there (ETA from the route time),
 *   plus motorcycle warnings (rain, strong wind, ice risk, fog, storm).
 * - Current weather chip on the home screen (where the rider is now).
 * Pure parts (sampling, hour pick, warnings) are tested in test/weather.test.js.
 */
(function(root){
"use strict";
var API="https://api.open-meteo.com/v1/forecast";
var HOURLY="temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,visibility";

function hav(a,b){var r=Math.PI/180,x=Math.sin((b.lat-a.lat)*r/2),y=Math.sin(((b.lon!=null?b.lon:b.lng)-(a.lon!=null?a.lon:a.lng))*r/2);return 12742*Math.asin(Math.sqrt(x*x+Math.cos(a.lat*r)*Math.cos(b.lat*r)*y*y))}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}

// WMO weather code -> Turkish label + Material Symbols icon.
function describe(code){
 code=Number(code);
 if(code===0)return {label:"Açık",icon:"sunny"};
 if(code<=2)return {label:"Parçalı bulutlu",icon:"partly_cloudy_day"};
 if(code===3)return {label:"Kapalı",icon:"cloud"};
 if(code===45||code===48)return {label:"Sis",icon:"foggy"};
 if(code>=51&&code<=57)return {label:"Çisenti",icon:"rainy_light"};
 if(code>=61&&code<=67)return {label:"Yağmur",icon:"rainy"};
 if(code>=71&&code<=77)return {label:"Kar",icon:"weather_snowy"};
 if(code>=80&&code<=82)return {label:"Sağanak",icon:"rainy_heavy"};
 if(code===85||code===86)return {label:"Kar sağanağı",icon:"weather_snowy"};
 if(code>=95)return {label:"Fırtına",icon:"thunderstorm"};
 return {label:"—",icon:"cloud"};
}

/* Points along the route every ~stepKm (start and end included, at most
 * maxN), each with its distance and arrival time. pts: [{lat,lon}],
 * km/sec: route length and time, startMs: departure. */
function sampleRoute(pts,km,sec,startMs,stepKm,maxN){
 pts=(pts||[]).filter(function(p){return p&&isFinite(p.lat)&&isFinite(p.lon!=null?p.lon:p.lng)});
 if(pts.length<2)return [];
 stepKm=stepKm||25;maxN=maxN||12;
 var cum=[0];for(var i=1;i<pts.length;i++)cum.push(cum[i-1]+hav(pts[i-1],pts[i]));
 var total=cum[cum.length-1]||Number(km)||0;if(total<=0)return [];
 var n=Math.max(2,Math.min(maxN,Math.round(total/stepKm)+1)),out=[],j=0;
 for(var k=0;k<n;k++){
  var d=total*k/(n-1);while(j<cum.length-1&&cum[j+1]<d)j++;
  var p=pts[j];
  out.push({lat:+p.lat,lon:+(p.lon!=null?p.lon:p.lng),km:d,eta:startMs+(total>0?d/total:0)*(Number(sec)||total/60*3600)*1000});
 }
 return out;
}

// Hourly forecast entry closest to time t (ms). h: Open-Meteo "hourly" block
// with unix seconds in h.time (timeformat=unixtime).
function atTime(h,t){
 if(!h||!Array.isArray(h.time)||!h.time.length)return null;
 var best=0,bd=Infinity;
 for(var i=0;i<h.time.length;i++){var d=Math.abs(h.time[i]*1000-t);if(d<bd){bd=d;best=i}}
 if(bd>3*3600*1000)return null;
 function v(k){return h[k]&&h[k][best]!=null?Number(h[k][best]):null}
 return {time:h.time[best]*1000,temp:v("temperature_2m"),pop:v("precipitation_probability"),rain:v("precipitation"),code:v("weather_code"),
  wind:v("wind_speed_10m"),gust:v("wind_gusts_10m"),vis:v("visibility")};
}

// Motorcycle warnings for one forecast hour.
function warnings(w){
 var out=[];if(!w)return out;
 if(w.code!=null&&w.code>=95)out.push({id:"storm",text:"Fırtına",icon:"thunderstorm"});
 if((w.pop!=null&&w.pop>=50)||(w.rain!=null&&w.rain>=.5)||(w.code>=61&&w.code<=67)||(w.code>=80&&w.code<=82))out.push({id:"rain",text:"Yağmur"+(w.pop!=null?" %"+Math.round(w.pop):""),icon:"rainy"});
 if(w.gust!=null&&w.gust>=50)out.push({id:"wind",text:"Sert rüzgar "+Math.round(w.gust)+" km/sa",icon:"air"});
 if(w.temp!=null&&w.temp<=3)out.push({id:"ice",text:"Buzlanma riski",icon:"ac_unit"});
 if((w.vis!=null&&w.vis<1000)||w.code===45||w.code===48)out.push({id:"fog",text:"Sis",icon:"foggy"});
 if(w.code>=71&&w.code<=77||w.code===85||w.code===86)out.push({id:"snow",text:"Kar",icon:"weather_snowy"});
 return out;
}
// The first place on the route where each warning starts.
function routeWarnings(rows){
 var seen={},out=[];
 rows.forEach(function(r){warnings(r.w).forEach(function(x){if(!seen[x.id]){seen[x.id]=1;out.push({id:x.id,text:x.text,icon:x.icon,km:r.km,eta:r.eta})}})});
 return out;
}

/* ---------- network ---------- */
var cache={};
function fetchPoints(points){
 var key=points.map(function(p){return p.lat.toFixed(2)+","+p.lon.toFixed(2)}).join("|");
 var c=cache[key];if(c&&Date.now()-c.at<15*60000)return Promise.resolve(c.data);
 var url=API+"?latitude="+points.map(function(p){return p.lat.toFixed(4)}).join(",")+"&longitude="+points.map(function(p){return p.lon.toFixed(4)}).join(",")+
  "&hourly="+HOURLY+"&current="+HOURLY.replace("precipitation_probability,","")+"&timeformat=unixtime&timezone=auto&forecast_days=3&wind_speed_unit=kmh";
 return fetch(url).then(function(r){if(!r.ok)throw new Error("weather "+r.status);return r.json()}).then(function(j){
  var arr=Array.isArray(j)?j:[j];cache[key]={at:Date.now(),data:arr};return arr;
 });
}
function routeWeather(route,startMs){
 var pts=sampleRoute(route.pts,route.km,route.sec,startMs||Date.now());
 if(!pts.length)return Promise.resolve([]);
 return fetchPoints(pts).then(function(arr){
  return pts.map(function(p,i){return {km:p.km,eta:p.eta,lat:p.lat,lon:p.lon,w:atTime(arr[i]&&arr[i].hourly,p.eta)}});
 });
}

/* ---------- UI ---------- */
function hm(ms){var d=new Date(ms);return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0")}
function chip(r,i,last){
 var w=r.w;if(!w)return '<div class="gr-wx-pt"><small>'+Math.round(r.km)+' km</small><span class="mi">cloud_off</span><b>—</b></div>';
 var dsc=describe(w.code),bad=warnings(w).length>0;
 return '<div class="gr-wx-pt'+(bad?' bad':'')+'" title="'+esc(dsc.label)+'"><small>'+(i===0?"Başlangıç":last?"Varış":Math.round(r.km)+" km")+' · '+hm(r.eta)+'</small>'+
  '<span class="mi">'+dsc.icon+'</span><b>'+Math.round(w.temp)+'°</b>'+
  '<em>'+(w.pop!=null&&w.pop>=20?'<span class="mi">water_drop</span>%'+Math.round(w.pop)+' ':'')+'<span class="mi">air</span>'+Math.round(w.wind||0)+'</em></div>';
}
var routeSeq=0;
function renderRoute(host,route){
 if(!host||!route||!route.pts)return;
 var box=host.querySelector(".gr-wx-route");
 if(!box){box=document.createElement("div");box.className="gr-wx-route";var t=host.querySelector(".gr-route-chooser-title");(t?t.parentNode:host).insertBefore(box,t?t.nextSibling:host.firstChild)}
 var seq=++routeSeq;
 box.innerHTML='<div class="gr-wx-head"><span class="mi">partly_cloudy_day</span> Rotadaki hava <small>yükleniyor…</small></div>';
 routeWeather(route,Date.now()).then(function(rows){
  if(seq!==routeSeq)return;
  if(!rows.length){box.innerHTML="";return}
  var warn=routeWarnings(rows);
  box.innerHTML='<div class="gr-wx-head"><span class="mi">partly_cloudy_day</span> Rotadaki hava <small>şimdi yola çıkarsan · varış saatine göre</small></div>'+
   (warn.length?'<div class="gr-wx-warn">'+warn.map(function(x){return '<span><span class="mi">'+x.icon+'</span>'+esc(x.text)+' · '+(x.km<1?"başlangıçta":Math.round(x.km)+". km")+' ('+hm(x.eta)+')</span>'}).join("")+'</div>':
    '<div class="gr-wx-ok"><span class="mi">check_circle</span> Rota boyunca belirgin bir hava riski yok</div>')+
   '<div class="gr-wx-strip">'+rows.map(function(r,i){return chip(r,i,i===rows.length-1)}).join("")+'</div>'+
   '<div class="gr-wx-src">Hava verisi: Open-Meteo</div>';
 }).catch(function(){if(seq===routeSeq)box.innerHTML='<div class="gr-wx-head"><span class="mi">cloud_off</span> Rotadaki hava alınamadı <small>internet bağlantısını kontrol et</small></div>'});
}
// Home screen chip: current weather where the rider is, refreshed every 15 min.
function here(){var c=root.GaZonMapContext,p=c&&c.getCurrentPoint&&c.getCurrentPoint();return p&&isFinite(p.lat)?{lat:p.lat,lon:p.lon}:null}
var nowTimer=null,nowAt=0;
function renderNow(){
 var p=here(),hero=document.querySelector(".homeHero");if(!p||!hero)return false;
 var el=document.getElementById("grWxNow");
 if(!el){el=document.createElement("button");el.type="button";el.id="grWxNow";el.className="gr-wx-now";el.setAttribute("aria-label","Hava durumu");var t=hero.firstElementChild;(t||hero).appendChild(el)}
 if(Date.now()-nowAt<14*60000&&el.innerHTML)return true;
 nowAt=Date.now();
 fetchPoints([p]).then(function(arr){
  var cur=arr[0]&&arr[0].current;if(!cur)return;
  var w={temp:cur.temperature_2m,code:cur.weather_code,wind:cur.wind_speed_10m,gust:cur.wind_gusts_10m,rain:cur.precipitation,vis:cur.visibility};
  var dsc=describe(w.code),warn=warnings(w);
  el.classList.toggle("bad",warn.length>0);
  el.innerHTML='<span class="mi">'+dsc.icon+'</span><b>'+Math.round(w.temp)+'°</b><small>'+esc(warn.length?warn[0].text:dsc.label)+' · <span class="mi">air</span>'+Math.round(w.wind||0)+' km/sa</small>';
  el.title=dsc.label+" · rüzgar "+Math.round(w.wind||0)+" km/sa (hamle "+Math.round(w.gust||0)+")";
 }).catch(function(){nowAt=0});
 return true;
}
function install(){
 var tries=0;(function wait(){if(renderNow()||++tries>40)return;setTimeout(wait,1500)})();
 nowTimer=setInterval(renderNow,15*60000);
 document.addEventListener("visibilitychange",function(){if(!document.hidden)renderNow()});
}
var api={describe:describe,sampleRoute:sampleRoute,atTime:atTime,warnings:warnings,routeWarnings:routeWarnings,routeWeather:routeWeather,renderRoute:renderRoute,renderNow:renderNow};
root.GaZonWeather=api;
if(typeof module!=="undefined"&&module.exports)module.exports=api;
if(typeof document!=="undefined"){if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install);else install()}
})(typeof window!=="undefined"?window:globalThis);
