(function(){
"use strict";
var modal,canvas,ctx,currentRide=null,anim=0,start=0,duration=9000,auto=true;
function $(id){return document.getElementById(id)}
function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function rides(){try{var a=JSON.parse(localStorage.getItem("gazon_rides")||"[]");if(!Array.isArray(a))a=[];if(window.GaZonDemoRide)a=a.concat([window.GaZonDemoRide]);return a}catch(e){return window.GaZonDemoRide?[window.GaZonDemoRide]:[]}}
function pts(ride){return (ride&&ride.track||[]).filter(function(p){return Array.isArray(p)&&p.length>=2&&isFinite(Number(p[0]))&&isFinite(Number(p[1]))}).map(function(p){return {lat:Number(p[0]),lon:Number(p[1]),alt:p[2]==null?null:Number(p[2]),time:p[3]||0}})}
function fitData(a){
 var minLat=Infinity,maxLat=-Infinity,minLon=Infinity,maxLon=-Infinity,minAlt=Infinity,maxAlt=-Infinity;
 a.forEach(function(p){minLat=Math.min(minLat,p.lat);maxLat=Math.max(maxLat,p.lat);minLon=Math.min(minLon,p.lon);maxLon=Math.max(maxLon,p.lon);if(p.alt!=null&&isFinite(p.alt)){minAlt=Math.min(minAlt,p.alt);maxAlt=Math.max(maxAlt,p.alt)}});
 if(!isFinite(minAlt)){minAlt=0;maxAlt=0}
 return {minLat:minLat,maxLat:maxLat,minLon:minLon,maxLon:maxLon,minAlt:minAlt,maxAlt:maxAlt,latSpan:Math.max(.00001,maxLat-minLat),lonSpan:Math.max(.00001,maxLon-minLon),altSpan:Math.max(1,maxAlt-minAlt)}
}
function project(p,b,w,h){
 var nx=((p.lon-b.minLon)/b.lonSpan)-.5,ny=1-((p.lat-b.minLat)/b.latSpan);
 var depth=.48+.52*ny,alt=(p.alt!=null?((p.alt-b.minAlt)/b.altSpan):0)*h*.07;
 return {x:w*.5+nx*w*.72*depth,y:h*.13+ny*h*.70-alt}
}
function roundedRect(c,x,y,w,h,r){c.beginPath();c.roundRect(x,y,w,h,r)}
function drawBackground(w,h){
 var g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,"#17202b");g.addColorStop(.45,"#0e151d");g.addColorStop(1,"#070a0e");ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
 ctx.strokeStyle="rgba(255,255,255,.055)";ctx.lineWidth=1;
 for(var i=0;i<10;i++){var y=h*.13+i*h*.075,sh=(i/10)*w*.16;ctx.beginPath();ctx.moveTo(sh,y);ctx.lineTo(w-sh,y);ctx.stroke()}
 for(var j=-5;j<=5;j++){ctx.beginPath();ctx.moveTo(w*.5+j*w*.045,h*.13);ctx.lineTo(w*.5+j*w*.12,h*.88);ctx.stroke()}
 var glow=ctx.createRadialGradient(w*.5,h*.15,10,w*.5,h*.15,w*.65);glow.addColorStop(0,"rgba(255,90,31,.15)");glow.addColorStop(1,"rgba(255,90,31,0)");ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
}
function drawFrame(progress,forExport){
 if(!canvas||!currentRide)return;
 var a=pts(currentRide),w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);drawBackground(w,h);
 if(a.length<2){ctx.fillStyle="#fff";ctx.font="700 28px system-ui";ctx.fillText("3D tekrar için rota kaydı yok",32,h*.5);return}
 var b=fitData(a),end=Math.max(1,Math.floor((a.length-1)*progress));
 ctx.lineCap="round";ctx.lineJoin="round";
 ctx.strokeStyle="rgba(0,0,0,.65)";ctx.lineWidth=15;ctx.beginPath();
 for(var i=0;i<=end;i++){var q=project(a[i],b,w,h);if(i===0)ctx.moveTo(q.x,q.y);else ctx.lineTo(q.x,q.y)}ctx.stroke();
 ctx.strokeStyle="#ff5a1f";ctx.lineWidth=8;ctx.beginPath();
 for(i=0;i<=end;i++){q=project(a[i],b,w,h);if(i===0)ctx.moveTo(q.x,q.y);else ctx.lineTo(q.x,q.y)}ctx.stroke();
 var p=project(a[end],b,w,h);ctx.shadowColor="#ff5a1f";ctx.shadowBlur=28;ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(p.x,p.y,10,0,Math.PI*2);ctx.fill();ctx.fillStyle="#ff5a1f";ctx.beginPath();ctx.arc(p.x,p.y,6,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
 var startP=project(a[0],b,w,h),endP=project(a[a.length-1],b,w,h);ctx.fillStyle="#39d98a";ctx.beginPath();ctx.arc(startP.x,startP.y,6,0,Math.PI*2);ctx.fill();ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(endP.x,endP.y,6,0,Math.PI*2);ctx.fill();
 if(forExport){
   ctx.fillStyle="rgba(5,7,11,.78)";roundedRect(ctx,24,24,w-48,110,24);ctx.fill();
   ctx.fillStyle="#fff";ctx.font="900 32px system-ui";ctx.fillText("GAZON",44,67);ctx.fillStyle="#ff5a1f";ctx.fillText("RIDE",158,67);
   ctx.fillStyle="#fff";ctx.font="800 22px system-ui";ctx.fillText((currentRide.destination||"Sürüş Tekrarı").slice(0,34),44,105);
   ctx.fillStyle="rgba(5,7,11,.82)";roundedRect(ctx,24,h-160,w-48,120,24);ctx.fill();
   ctx.fillStyle="#fff";ctx.font="800 25px system-ui";ctx.fillText(Number(currentRide.km||0).toFixed(1)+" KM",44,h-110);ctx.fillText(String(currentRide.duration||"00:00"),w*.38,h-110);ctx.fillText(Math.round(Number(currentRide.max||0))+" KM/S",w*.68,h-110);
   ctx.fillStyle="#aab1bb";ctx.font="600 15px system-ui";ctx.fillText("MESAFE",44,h-78);ctx.fillText("SÜRE",w*.38,h-78);ctx.fillText("MAX HIZ",w*.68,h-78);
 }
 var bar=$("grReplayBar");if(bar&&!forExport)bar.style.width=Math.round(progress*100)+"%";
}
function loop(ts){if(!auto)return;if(!start)start=ts;var p=((ts-start)%duration)/duration;drawFrame(p,false);anim=requestAnimationFrame(loop)}
function open(ride){
 currentRide=ride;if(!modal)install();modal.classList.add("active");document.body.style.overflow="hidden";
 $("grReplayKm").textContent=Number(ride.km||0).toFixed(1)+" km";$("grReplayTime").textContent=ride.duration||"00:00";$("grReplayMax").textContent=Math.round(Number(ride.max||0))+" km/s";$("grReplayName").textContent=ride.destination||"Sürüş Tekrarı";$("grReplayDate").textContent=ride.date||"";
 auto=true;start=0;cancelAnimationFrame(anim);anim=requestAnimationFrame(loop)
}
function close(){auto=false;cancelAnimationFrame(anim);if(modal)modal.classList.remove("active");document.body.style.overflow=""}
function toggle(){auto=!auto;$("grReplayPlay").innerHTML=auto?'<span class="mi">pause</span> Duraklat':'<span class="mi">play_arrow</span> Oynat';if(auto){start=0;anim=requestAnimationFrame(loop)}else cancelAnimationFrame(anim)}
function shareImage(){
 drawFrame(.72,true);canvas.toBlob(async function(blob){if(!blob)return;var file=new File([blob],"GaZonRide-3D-Surus.png",{type:"image/png"});try{if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({title:"GaZonRide 3D Sürüş",text:(currentRide.destination||"Sürüşüm")+" · "+Number(currentRide.km||0).toFixed(1)+" km",files:[file]});return}}catch(e){}
 var u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=file.name;a.click();setTimeout(function(){URL.revokeObjectURL(u)},2000)}, "image/png",.95)
}
async function makeVideo(){
 if(!canvas.captureStream||!window.MediaRecorder){alert("Bu cihaz 3D video kaydını desteklemiyor. 3D kare paylaşımı kullanabilirsin.");return}
 var btn=$("grReplayVideo");btn.disabled=true;btn.textContent="3D video hazırlanıyor...";
 var stream=canvas.captureStream(30),mime=MediaRecorder.isTypeSupported("video/mp4;codecs=avc1.42E01E")?"video/mp4;codecs=avc1.42E01E":(MediaRecorder.isTypeSupported("video/mp4")?"video/mp4":(MediaRecorder.isTypeSupported("video/webm;codecs=vp9")?"video/webm;codecs=vp9":"video/webm")),rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:4500000}),chunks=[];
 rec.ondataavailable=function(e){if(e.data&&e.data.size)chunks.push(e.data)};
 var done=new Promise(function(resolve){rec.onstop=resolve});rec.start(250);
 var t0=performance.now(),len=8000;
 await new Promise(function(resolve){function f(now){var p=Math.min(1,(now-t0)/len);drawFrame(p,true);if(p<1)requestAnimationFrame(f);else resolve()}requestAnimationFrame(f)});
 rec.stop();await done;stream.getTracks().forEach(function(t){t.stop()});
 var blob=new Blob(chunks,{type:mime}),ext=mime.indexOf("mp4")>=0?"mp4":"webm",file=new File([blob],"GaZonRide-3D-Surus."+ext,{type:mime});
 try{if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({title:"GaZonRide 3D Sürüş",text:(currentRide.destination||"Sürüşüm")+" · "+Number(currentRide.km||0).toFixed(1)+" km",files:[file]});}
 else{var u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=file.name;a.click();setTimeout(function(){URL.revokeObjectURL(u)},4000)}}catch(e){console.warn(e)}
 btn.disabled=false;btn.innerHTML='<span class="mi">movie</span> 3D Video Oluştur';drawFrame(.75,false)
}
function scan(){
 document.querySelectorAll("#historyList .ride").forEach(function(row,i){if(row.querySelector("[data-gr-replay]"))return;var b=document.createElement("button");b.className="mapBtn";b.setAttribute("data-gr-replay",String(i));b.title="3D Sürüş Tekrarı";b.innerHTML='<span class="mi">play_circle</span>';b.onclick=function(){var r=rides()[Number(b.getAttribute("data-gr-replay"))];if(r)open(r)};row.appendChild(b)});
 document.querySelectorAll("#screen [data-route]").forEach(function(routeBtn){var card=routeBtn.closest(".screenCard");if(!card||card.querySelector("[data-gr-screen-replay]"))return;var i=Number(routeBtn.getAttribute("data-route")),b=document.createElement("button");b.className="screenBtn";b.setAttribute("data-gr-screen-replay",String(i));b.innerHTML='<span class="mi" style="vertical-align:-5px">3d_rotation</span> 3D Sürüş Tekrarı';b.onclick=function(){var r=rides()[Number(b.getAttribute("data-gr-screen-replay"))];if(r)open(r)};routeBtn.insertAdjacentElement("afterend",b)});
}
function install(){
 modal=document.createElement("div");modal.id="grReplay";modal.className="gr-replay";modal.innerHTML='<div class="gr-replay-wrap"><div class="gr-replay-head"><b>3D Sürüş Tekrarı</b><button class="gr-replay-close" id="grReplayClose"><span class="mi">close</span></button></div><div class="gr-replay-stage"><canvas id="grReplayCanvas" width="720" height="1280"></canvas><div class="gr-replay-overlay"><div class="gr-replay-stat"><b id="grReplayKm">0 km</b><small>MESAFE</small></div><div class="gr-replay-stat"><b id="grReplayTime">00:00</b><small>SÜRE</small></div><div class="gr-replay-stat"><b id="grReplayMax">0 km/s</b><small>MAX HIZ</small></div></div><div class="gr-replay-title"><b id="grReplayName">Sürüş Tekrarı</b><small id="grReplayDate"></small><div class="gr-replay-progress"><i id="grReplayBar"></i></div></div></div><div class="gr-replay-controls"><button id="grReplayPlay"><span class="mi">pause</span> Duraklat</button><button class="primary" id="grReplayImage"><span class="mi">share</span> 3D Kare Paylaş</button><button id="grReplayVideo" style="grid-column:1/-1"><span class="mi">movie</span> 3D Video Oluştur</button></div><div class="gr-replay-note">3D tekrar GaZonRide rota kaydından üretilir. Video paylaşımı cihazın desteklediği sosyal paylaşım seçeneklerini açar; desteklenmezse video dosyası kaydedilir.</div></div>';
 document.body.appendChild(modal);canvas=$("grReplayCanvas");ctx=canvas.getContext("2d");$("grReplayClose").onclick=close;$("grReplayPlay").onclick=toggle;$("grReplayImage").onclick=shareImage;$("grReplayVideo").onclick=makeVideo;
 new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});scan()
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install);else install();
window.GaZonReplay={open:open,scan:scan};
})();