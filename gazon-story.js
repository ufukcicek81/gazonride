/* Story video: a 1080x1920 (9:16) clip of a saved ride for Instagram /
 * WhatsApp stories. Rendered on a canvas in the app (dark Google static map,
 * the route drawing itself, counting stats, GazOnRide branding) and recorded
 * with MediaRecorder; MP4 where the WebView supports it, WebM otherwise.
 * Android: the file goes to the native share sheet / gallery through
 * AndroidBridge.fileBegin/fileAppend/shareFile/saveToGallery.
 * Browsers: navigator.share({files}) or a download.
 */
(function(root){
"use strict";
var W=1080,H=1920,FPS=30;
var T_INTRO=1.4,T_DRAW=7.6,T_OUTRO=3.2,TOTAL=T_INTRO+T_DRAW+T_OUTRO;
var RED="#E8322E";
// Map background styles: text and fades follow the map's brightness.
var STYLES={
 dark:{label:"Karanlık",bg:"#14181d",fade:"8,10,13",ink:"#fff",ink2:"rgba(255,255,255,.62)",grid:"rgba(255,255,255,.05)",ghost:"rgba(255,255,255,.16)",card:"rgba(255,255,255,.08)",over:"#0b0e12",overA:.72},
 light:{label:"Açık",bg:"#eef1f4",fade:"250,251,252",ink:"#111827",ink2:"rgba(17,24,39,.6)",grid:"rgba(0,0,0,.06)",ghost:"rgba(17,24,39,.18)",card:"rgba(17,24,39,.06)",over:"#f8fafc",overA:.8},
 satellite:{label:"Uydu",bg:"#1b2016",fade:"6,8,10",ink:"#fff",ink2:"rgba(255,255,255,.7)",grid:"rgba(255,255,255,.05)",ghost:"rgba(255,255,255,.3)",card:"rgba(0,0,0,.38)",over:"#06080a",overA:.62}
};
var P=STYLES.dark;

function clamp(x,a,b){return Math.max(a,Math.min(b,x))}
function ease(t){t=clamp(t,0,1);return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2}
function easeOut(t){t=clamp(t,0,1);return 1-Math.pow(1-t,3)}

function pickMime(){
 var R=root.MediaRecorder;if(!R||!R.isTypeSupported)return "";
 var list=["video/mp4;codecs=avc1.42E01E","video/mp4;codecs=avc1","video/mp4","video/webm;codecs=vp9","video/webm;codecs=vp8","video/webm"];
 for(var i=0;i<list.length;i++)if(R.isTypeSupported(list[i]))return list[i];
 return "";
}
function supported(){
 try{var c=document.createElement("canvas");return !!(c.captureStream&&root.MediaRecorder&&pickMime())}catch(e){return false}
}
function loadImage(src,cors){
 return new Promise(function(res){
  if(!src){res(null);return}
  var img=new Image();if(cors)img.crossOrigin="anonymous";
  var done=false,t=setTimeout(function(){if(!done){done=true;res(null)}},8000);
  img.onload=function(){if(!done){done=true;clearTimeout(t);res(img)}};
  img.onerror=function(){if(!done){done=true;clearTimeout(t);res(null)}};
  img.src=src;
 });
}

// Everything the frames need, computed once.
function prepare(ride,style){
 style=STYLES[style]?style:"dark";
 var J=root.GaZonJournal;if(!J||!J.storyMap)return null;
 var view=J.storyMap(ride&&ride.track,360,640,style);if(!view)return null;
 var k=W/view.width,src=view.points,step=Math.max(1,Math.ceil(src.length/1500)),xy=[];
 for(var i=0;i<src.length;i+=step){var q=view.project(src[i]);xy.push([q[0]*k,q[1]*k])}
 var last=view.project(src[src.length-1]);xy.push([last[0]*k,last[1]*k]);
 var cum=[0];for(i=1;i<xy.length;i++)cum.push(cum[i-1]+Math.hypot(xy[i][0]-xy[i-1][0],xy[i][1]-xy[i-1][1]));
 var m=J.metrics?J.metrics(ride):{},km=Number(ride.km)||m.km||0;
 return {pal:STYLES[style],view:view,xy:xy,cum:cum,len:cum[cum.length-1]||1,base:Math.min(1.4,view.fit||1),
  title:J.rideTitle?J.rideTitle(ride):(ride.destination||"Motosiklet sürüşü"),
  km:km,sec:m.sec||0,avg:m.avg||0,max:Math.round(Number(ride.max)||0),turns:m.turns||0,climb:m.climb||0,
  fmtDur:J.fmtDur||function(s){return Math.round(s/60)+"dk"}};
}

/* ---------- drawing ---------- */
function roundRect(g,x,y,w,h,r){g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath()}
function font(px,weight){return (weight||700)+" "+px+"px system-ui,-apple-system,'Segoe UI',Roboto,sans-serif"}
function background(g,map,zoom){
 g.fillStyle=P.bg;g.fillRect(0,0,W,H);
 g.save();g.translate(W/2,H/2);g.scale(zoom,zoom);g.translate(-W/2,-H/2);
 if(map)g.drawImage(map,0,0,W,H);
 else{ // no map: subtle grid so the route is not floating in the void
  g.strokeStyle=P.grid;g.lineWidth=2;
  for(var x=0;x<=W;x+=90){g.beginPath();g.moveTo(x,0);g.lineTo(x,H);g.stroke()}
  for(var y=0;y<=H;y+=90){g.beginPath();g.moveTo(0,y);g.lineTo(W,y);g.stroke()}
 }
 g.restore();
 // Readability: dark fades at the top and bottom (story UI sits there too).
 var a=g.createLinearGradient(0,0,0,560);a.addColorStop(0,"rgba("+P.fade+",.92)");a.addColorStop(1,"rgba("+P.fade+",0)");g.fillStyle=a;g.fillRect(0,0,W,560);
 var b=g.createLinearGradient(0,H-720,0,H);b.addColorStop(0,"rgba("+P.fade+",0)");b.addColorStop(1,"rgba("+P.fade+",.95)");g.fillStyle=b;g.fillRect(0,H-720,W,720);
}
function pointAt(d,s){
 var a=d.cum,lo=0,hi=a.length-1;if(s<=0)return {i:0,p:d.xy[0]};if(s>=d.len)return {i:a.length-1,p:d.xy[a.length-1]};
 while(hi-lo>1){var mid=(lo+hi)>>1;if(a[mid]<=s)lo=mid;else hi=mid}
 var f=(s-a[lo])/Math.max(1e-6,a[hi]-a[lo]),p=d.xy[lo],q=d.xy[hi];
 return {i:lo,p:[p[0]+(q[0]-p[0])*f,p[1]+(q[1]-p[1])*f]};
}
function route(g,d,frac,zoom){
 var s=d.len*clamp(frac,0,1),end=pointAt(d,s);
 g.save();g.translate(W/2,H/2);g.scale(zoom,zoom);g.translate(-W/2,-H/2);
 g.lineJoin="round";g.lineCap="round";
 function path(){g.beginPath();g.moveTo(d.xy[0][0],d.xy[0][1]);for(var i=1;i<=end.i;i++)g.lineTo(d.xy[i][0],d.xy[i][1]);g.lineTo(end.p[0],end.p[1])}
 // ghost of the whole ride, then the driven part with a soft glow
 g.beginPath();g.moveTo(d.xy[0][0],d.xy[0][1]);for(var i=1;i<d.xy.length;i++)g.lineTo(d.xy[i][0],d.xy[i][1]);
 g.strokeStyle=P.ghost;g.lineWidth=7;g.stroke();
 if(s>0){
  path();g.strokeStyle="rgba(255,255,255,.75)";g.lineWidth=17;g.stroke();
  path();g.shadowColor="rgba(232,50,46,.8)";g.shadowBlur=24;g.strokeStyle=RED;g.lineWidth=10;g.stroke();g.shadowBlur=0;
 }
 // start dot
 var a=d.xy[0];g.fillStyle="#fff";g.beginPath();g.arc(a[0],a[1],15,0,7);g.fill();g.fillStyle="#22C55E";g.beginPath();g.arc(a[0],a[1],10,0,7);g.fill();
 g.restore();
 return [W/2+(end.p[0]-W/2)*zoom,H/2+(end.p[1]-H/2)*zoom];
}
function rider(g,p,t){
 var pulse=(t*1.4)%1;
 g.fillStyle="rgba(232,50,46,"+(.45*(1-pulse))+")";g.beginPath();g.arc(p[0],p[1],22+40*pulse,0,7);g.fill();
 g.fillStyle="#fff";g.beginPath();g.arc(p[0],p[1],22,0,7);g.fill();
 g.fillStyle=RED;g.beginPath();g.arc(p[0],p[1],15,0,7);g.fill();
 g.fillStyle="#fff";g.beginPath();g.arc(p[0],p[1],5,0,7);g.fill();
}
function brand(g,logo,alpha,y){
 g.save();g.globalAlpha=alpha;
 var x=W/2,size=78,label="GazOnRide";
 g.font=font(58,800);var tw=g.measureText(label).width,total=size+20+tw,left=x-total/2;
 if(logo){g.save();roundRect(g,left,y-size/2,size,size,20);g.clip();g.drawImage(logo,left,y-size/2,size,size);g.restore()}
 else{g.fillStyle=RED;roundRect(g,left,y-size/2,size,size,20);g.fill()}
 g.fillStyle=P.ink;g.textBaseline="middle";g.textAlign="left";g.fillText(label,left+size+20,y+2);
 g.restore();
}
function header(g,d,alpha){
 g.save();g.globalAlpha=alpha;g.textAlign="center";g.textBaseline="alphabetic";
 g.fillStyle=P.ink;g.font=font(40,600);
 var t=d.title;while(g.measureText(t).width>W-140&&t.length>8)t=t.slice(0,-2);if(t!==d.title)t=t.replace(/\s*\S?$/,"")+"…";
 g.fillText(t,W/2,330);
 g.restore();
}
function liveStats(g,d,frac,alpha){
 g.save();g.globalAlpha=alpha;
 var y=H-420,cells=[[(d.km*frac).toFixed(1),"KM"],[d.fmtDur(Math.round(d.sec*frac))||"—","SÜRE"],[d.avg?String(d.avg):"—","ORT. KM/SA"]];
 var cw=(W-120)/3;
 cells.forEach(function(c,i){
  var cx=60+cw*i+cw/2;
  g.textAlign="center";g.fillStyle=P.ink;g.font=font(c[0].length>6?66:84,800);g.fillText(c[0],cx,y);
  g.fillStyle=P.ink2;g.font=font(30,700);g.fillText(c[1],cx,y+50);
 });
 g.restore();
}
function outro(g,d,logo,a){
 if(a<=0)return;
 g.save();g.globalAlpha=a*P.overA;g.fillStyle=P.over;g.fillRect(0,0,W,H);g.restore();
 var rise=(1-easeOut(a))*60;
 g.save();g.globalAlpha=a;g.translate(0,rise);
 var cells=[[d.km.toFixed(1),"km","Mesafe"],[d.fmtDur(d.sec)||"—","","Süre"],[d.avg?String(d.avg):"—","km/sa","Ortalama"],[d.max?String(d.max):"—","km/sa","Azami hız"],[String(d.turns),"","Viraj"],[d.climb?String(d.climb):"—",d.climb?"m":"","Tırmanış"]];
 var top=620,cw=440,ch=230,gap=40,left=(W-2*cw-gap)/2;
 g.textAlign="left";g.fillStyle=P.ink;g.font=font(64,800);g.fillText("Sürüş özeti",left,top-60);
 cells.forEach(function(c,i){
  var x=left+(i%2)*(cw+gap),y=top+Math.floor(i/2)*(ch+gap);
  g.fillStyle=P.card;roundRect(g,x,y,cw,ch,34);g.fill();
  g.fillStyle=P.ink2;g.font=font(32,700);g.fillText(c[2].toLocaleUpperCase("tr"),x+36,y+64);
  g.fillStyle=P.ink;g.font=font(c[0].length>6?70:92,800);g.fillText(c[0],x+36,y+170);
  if(c[1]){var vw=g.measureText(c[0]).width;g.fillStyle=P.ink2;g.font=font(36,700);g.fillText(c[1],x+36+vw+14,y+170)}
 });
 g.fillStyle=RED;roundRect(g,left,top+3*(ch+gap)+20,2*cw+gap,10,5);g.fill();
 g.restore();
 brand(g,logo,a,H-330);
 g.save();g.globalAlpha=a*.8;g.textAlign="center";g.fillStyle=P.ink;g.font=font(34,600);g.fillText("Motosiklet navigasyonu ve sürüş kaydı",W/2,H-250);g.restore();
}
function frame(g,d,assets,t){
 P=d.pal||STYLES.dark;
 var zoom=d.base*(1+.05*clamp(t/TOTAL,0,1));
 background(g,assets.map,zoom);
 var drawT=(t-T_INTRO)/T_DRAW,frac=ease(drawT);
 var head=route(g,d,frac,zoom);
 if(t>=T_INTRO*.6&&t<TOTAL-T_OUTRO+.6)rider(g,head,t);
 brand(g,assets.logo,easeOut(t/.6),220);
 header(g,d,easeOut((t-.3)/.6));
 var outA=easeOut((t-(TOTAL-T_OUTRO))/.7);
 liveStats(g,d,frac,easeOut((t-T_INTRO*.5)/.6)*(1-outA));
 outro(g,d,assets.logo,outA);
}

/* ---------- recording ---------- */
var busy=false;
function make(ride,opts){
 opts=opts||{};
 if(busy)return Promise.reject(new Error("busy"));
 var mime=pickMime();
 if(!mime)return Promise.reject(new Error("unsupported"));
 var d=prepare(ride,opts.style);if(!d)return Promise.reject(new Error("no-track"));
 busy=true;
 var progress=opts.onProgress||function(){};
 progress(0,"Harita hazırlanıyor…");
 return Promise.all([loadImage(d.view.url,true),loadImage(opts.logo||"icons/gazonride-logo.jpg",false)]).then(function(img){
  return new Promise(function(resolve,reject){
   var c=document.createElement("canvas");c.width=W;c.height=H;
   var g=c.getContext("2d"),assets={map:img[0],logo:img[1]};
   frame(g,d,assets,0);
   var stream=c.captureStream(FPS),chunks=[],rec;
   try{rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:8000000})}catch(e){rec=new MediaRecorder(stream)}
   rec.ondataavailable=function(e){if(e.data&&e.data.size)chunks.push(e.data)};
   rec.onerror=function(e){busy=false;reject(e&&e.error||new Error("record"))};
   rec.onstop=function(){
    busy=false;stream.getTracks().forEach(function(tr){tr.stop()});
    var type=(rec.mimeType||mime).split(";")[0],blob=new Blob(chunks,{type:type});
    if(!blob.size){reject(new Error("empty"));return}
    resolve({blob:blob,mime:type,ext:type.indexOf("mp4")>=0?"mp4":"webm",canvas:c});
   };
   var t0=0,raf=0;
   function tick(now){
    if(!t0)t0=now;
    var t=(now-t0)/1000;
    frame(g,d,assets,Math.min(t,TOTAL));
    progress(Math.min(1,t/TOTAL),"Video oluşturuluyor…");
    if(t<TOTAL+.25)raf=requestAnimationFrame(tick);else rec.stop();
   }
   rec.start(500);raf=requestAnimationFrame(tick);
  });
 }).catch(function(e){busy=false;throw e});
}

/* ---------- share / save ---------- */
function fileName(res){var n=new Date(),p=function(x){return String(x).padStart(2,"0")};return "GazOnRide-"+n.getFullYear()+p(n.getMonth()+1)+p(n.getDate())+"-"+p(n.getHours())+p(n.getMinutes())+"."+res.ext}
function hasBridge(){var B=root.AndroidBridge;return !!(B&&typeof B.fileBegin==="function"&&typeof B.fileAppend==="function")}
function toNative(res){
 if(res._native)return Promise.resolve(res._native);
 var B=root.AndroidBridge,name=fileName(res);
 return new Promise(function(resolve,reject){
  var r=new FileReader();
  r.onerror=function(){reject(new Error("read"))};
  r.onload=function(){
   var s=String(r.result),b64=s.slice(s.indexOf(",")+1),CH=393216; // multiple of 4
   if(!B.fileBegin(name)){reject(new Error("file"));return}
   for(var i=0;i<b64.length;i+=CH)if(!B.fileAppend(name,b64.slice(i,i+CH))){reject(new Error("file"));return}
   res._native=name;resolve(name);
  };
  r.readAsDataURL(res.blob);
 });
}
function download(res){
 var a=document.createElement("a"),u=URL.createObjectURL(res.blob);
 a.href=u;a.download=fileName(res);document.body.appendChild(a);a.click();a.remove();
 setTimeout(function(){URL.revokeObjectURL(u)},60000);
}
// -> "shared" | "downloaded" | "cancelled"
function share(res,text){
 if(hasBridge()&&typeof root.AndroidBridge.shareFile==="function")
  return toNative(res).then(function(name){root.AndroidBridge.shareFile(name,res.mime,text||"");return "shared"});
 var file;try{file=new File([res.blob],fileName(res),{type:res.mime})}catch(e){file=null}
 if(file&&navigator.canShare&&navigator.canShare({files:[file]}))
  return navigator.share({files:[file],text:text||""}).then(function(){return "shared"},function(e){if(e&&e.name==="AbortError")return "cancelled";download(res);return "downloaded"});
 download(res);return Promise.resolve("downloaded");
}
// -> "saved" | "downloaded" | "failed"
function save(res){
 if(hasBridge()&&typeof root.AndroidBridge.saveToGallery==="function")
  return toNative(res).then(function(name){return root.AndroidBridge.saveToGallery(name,res.mime)?"saved":"failed"});
 download(res);return Promise.resolve("downloaded");
}

root.GaZonStory={supported:supported,make:make,share:share,save:save,_frame:frame,_prepare:prepare,DURATION:TOTAL,STYLES:STYLES};
})(window);
