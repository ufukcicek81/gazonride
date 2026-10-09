(function(){
"use strict";
var root=null,expanded=false,state=null,duckToken=0,refreshTimer=null;
var storageKey="gazon_music_duck_on_v1";
var android=window.AndroidBridge||null;
function $(id){return document.getElementById(id)}
function supported(){return !!(android&&typeof android.getMusicStatus==="function")}
function safeCall(method,arg){
 try{
  if(!android||typeof android[method]!=="function")return false;
  if(arguments.length===1)android[method]();else android[method](arg);
  return true
 }catch(e){console.warn("GaZon music",method,e);return false}
}
function getDuckSetting(){
 try{return localStorage.getItem(storageKey)!=="off"}catch(e){return true}
}
function saveDuckSetting(on){
 try{localStorage.setItem(storageKey,on?"on":"off")}catch(e){}
 safeCall("setMusicDuckingEnabled",!!on)
}
function icon(name){return '<span class="mi" aria-hidden="true">'+name+'</span>'}
function markup(){
 return '<button type="button" class="gr-music-launch" id="grMusicLaunch" aria-label="Müzik panelini aç" aria-expanded="false">'+icon("music_note")+'<span>Müzik</span></button>'+
  '<section class="gr-music-panel" id="grMusicPanel" role="dialog" aria-label="GaZonRide müzik merkezi" aria-modal="false" hidden>'+
   '<div class="gr-music-head"><div><small>GAZONRIDE · MÜZİK</small><b>Müzik Merkezi</b></div>'+
    '<button type="button" id="grMusicClose" aria-label="Müzik panelini kapat">'+icon("close")+'</button></div>'+
   '<div class="gr-music-provider"><button type="button" id="grMusicSpotify">'+icon("open_in_new")+' Spotify</button>'+
     '<button type="button" id="grMusicYoutube">'+icon("open_in_new")+' YouTube Music</button></div>'+
   '<div class="gr-music-now"><div class="gr-music-cover">'+icon("album")+'</div><div class="gr-music-info"><small id="grMusicProvider">Müzik oynatıcı</small>'+
    '<b id="grMusicTitle">Henüz şarkı seçilmedi</b><span id="grMusicArtist">Telefonundaki müzik uygulamasından başlat</span></div></div>'+
   '<div class="gr-music-playback"><button type="button" id="grMusicPrev" aria-label="Önceki şarkı">'+icon("skip_previous")+'</button>'+
     '<button type="button" id="grMusicToggle" class="gr-music-play" aria-label="Oynat veya duraklat">'+icon("play_arrow")+'</button>'+
     '<button type="button" id="grMusicNext" aria-label="Sonraki şarkı">'+icon("skip_next")+'</button></div>'+
   '<div class="gr-music-duck"><div><b>Navigasyonda müziği kıs</b><small>Yol tarifi sesinden sonra müzik eski seviyesine döner.</small></div>'+
    '<label class="gr-music-switch"><input type="checkbox" id="grMusicDuck" checked><span class="gr-music-slider"></span></label></div>'+
   '<button type="button" class="gr-music-test" id="grMusicTest">'+icon("volume_up")+' Ses kısılmasını dene</button>'+
   '<div class="gr-music-permission" id="grMusicPermission">'+
    '<b>Android müzik kontrol izni</b>'+
    '<p>Spotify ve YouTube Music şarkılarını bu ekrandan yönetmek için bir defalık Android Bildirim erişimi izni gerekir. GaZonRide bildirim mesajlarını okumaz veya kaydetmez.</p>'+
    '<button type="button" id="grMusicGrant">'+icon("settings")+' İzin ekranını aç</button></div>'+
   '<p class="gr-music-status" id="grMusicStatus" aria-live="polite"></p>'+
   '<p class="gr-music-focus" id="grMusicFocus" aria-live="polite">Ses odağı: henüz denenmedi</p>'+
   '<p class="gr-music-foot">İlk kez şarkı seçmek için müzik uygulamasını aç, müziği başlat ve GaZonRide’a dön. Çalma kontrolleri burada kalır.</p>'+
  '</section>'
}
function update(){
 if(!root)return;
 var native=supported();
 var parsed=null;
 if(native){
  try{parsed=JSON.parse(android.getMusicStatus()||"{}")}catch(e){parsed=null}
 }
 state=parsed||{native:false,access:false,hasSession:false,playing:false,title:"",artist:"",provider:""};
 var access=!!state.access;
 var session=!!state.hasSession;
 $("grMusicTitle").textContent=state.title||(session?"Şarkı bilgisi bekleniyor":"Henüz şarkı seçilmedi");
 $("grMusicArtist").textContent=state.artist||(session?"Müzik uygulaması açık":"Spotify veya YouTube Music’ten başlat");
 $("grMusicProvider").textContent=state.provider||(native?"Android müzik oynatıcısı":"Web sürümü");
 $("grMusicToggle").innerHTML=icon(state.playing?"pause":"play_arrow");
 ["grMusicPrev","grMusicToggle","grMusicNext"].forEach(function(id){$(id).disabled=!native||!access||!session});
 var status=$("grMusicStatus"),permission=$("grMusicPermission");
 permission.hidden=native&&access;
 if(!native){
  status.textContent="Web sürümünde müzik çalmaya devam edebilirsin ancak uygulama içi kontrol ve otomatik kısılma için güncel Android APK gereklidir.";
  $("grMusicGrant").disabled=true;
 }else if(!access){
  status.textContent="Android Bildirim erişimini aç, sonra GaZonRide’a dön. İzin verilmeden diğer uygulamalar kontrol edilemez.";
  $("grMusicGrant").disabled=false;
 }else if(!session){
  status.textContent="Hazır. Spotify veya YouTube Music’i başlatıp bir şarkı aç.";
 }else{
  status.textContent=(state.playing?"Çalıyor":"Duraklatıldı")+" · "+state.provider+" · "+(state.duckEnabled?"Otomatik kısılma açık":"Otomatik kısılma kapalı");
 }
 $("grMusicDuck").checked=native?!!state.duckEnabled:getDuckSetting();
 var focus=$("grMusicFocus");
 if(focus){
  if(!native)focus.textContent="Ses odağı: web sürümünde kullanılamaz";
  else if(state.focusStatus==="granted")focus.textContent="Android ses odağı: son istek kabul edildi. Müzik yine kısılmıyorsa oynatıcı bu isteği uygulamıyor.";
  else if(state.focusStatus==="denied")focus.textContent="Android ses odağı: reddedildi. Müziğin kısılmaması bu nedenle olabilir.";
  else focus.textContent=state.nativeNarrationReady?"Ses odağı: test bekleniyor · Android sesli navigasyon hazır":state.narratorFailed?"Android sesli navigasyon başlatılamadı":"Android sesli navigasyon hazırlanıyor…";
 }
 var launch=$("grMusicLaunch");
 launch.classList.toggle("active",session&&state.playing);
 launch.title=session?(state.title||"Müzik Merkezi"):"Müzik Merkezi";
}
function setOpen(on){
 expanded=!!on;
 var panel=$("grMusicPanel"),launch=$("grMusicLaunch");
 panel.hidden=!expanded;launch.setAttribute("aria-expanded",String(expanded));
 if(expanded)update();
}
function openPlayer(provider){
 if(supported()){
  safeCall("openMusicApp",provider);
  $("grMusicStatus").textContent="Şarkını seçip GaZonRide’a dön. Panel kaldığın yerden devam eder.";
 }else{
  var url=provider==="spotify"?"https://open.spotify.com/":"https://music.youtube.com/";
  window.open(url,"_blank","noopener,noreferrer");
 }
}
function nativeSpeak(text){
 try{return !!(android&&typeof android.speakNavigation==="function"&&android.speakNavigation(text))}catch(e){return false}
}
function playDemo(){
 var message="Müzik kısılma testi başladı. Üç yüz metre sonra sağa dön. Yönlendirmeyi dinlerken müziğin sesi azalmalı. Konuşma bitince müzik eski seviyesine dönmeli.";
 if(nativeSpeak(message)){
  $("grMusicStatus").textContent="Android navigasyon sesi başlatıldı; müzikte kısılma olup olmadığını dinle.";
  setTimeout(update,650);
  return
 }
 if(!("speechSynthesis" in window)||typeof SpeechSynthesisUtterance!=="function"){
  $("grMusicStatus").textContent="Bu cihazda sesli test desteklenmiyor.";return
 }
 var id=beginSpeech();
 try{
  window.speechSynthesis.cancel();
  var speech=new SpeechSynthesisUtterance("İki yüz metre sonra sağa dön.");
  speech.lang="tr-TR";
  speech.rate=1.02;
  speech.onend=function(){endSpeech(id)};
  speech.onerror=function(){endSpeech(id)};
  window.speechSynthesis.speak(speech);
  $("grMusicStatus").textContent=supported()?"Sesli yönlendirme testi başlatıldı. Müzik çalıyorsa kısa süreli kısılması beklenir.":"Sesli test başladı; otomatik kısılma için Android APK gereklidir.";
 }catch(e){endSpeech(id);$("grMusicStatus").textContent="Sesli test başlatılamadı."}
}
function beginSpeech(){
 duckToken+=1;
 if(getDuckSetting())safeCall("beginNavSpeech");
 return duckToken
}
function endSpeech(token){
 if(token!=null&&token!==duckToken)return;
 safeCall("endNavSpeech")
}
function stopSpeech(){
 duckToken++;
 safeCall("stopNavigationSpeech");
 safeCall("endNavSpeech")
}
function install(){
 if(root||!document.body)return;
 root=document.createElement("div");root.id="grMusic";root.className="gr-music";
 root.innerHTML=markup();document.body.appendChild(root);
 $("grMusicLaunch").onclick=function(){setOpen(!expanded)};
 $("grMusicClose").onclick=function(){setOpen(false)};
 $("grMusicSpotify").onclick=function(){openPlayer("spotify")};
 $("grMusicYoutube").onclick=function(){openPlayer("youtube")};
 $("grMusicGrant").onclick=function(){safeCall("requestMusicAccess");setTimeout(update,800)};
 $("grMusicPrev").onclick=function(){safeCall("musicCommand","previous");setTimeout(update,400)};
 $("grMusicToggle").onclick=function(){safeCall("musicCommand","toggle");setTimeout(update,400)};
 $("grMusicNext").onclick=function(){safeCall("musicCommand","next");setTimeout(update,400)};
 $("grMusicDuck").checked=getDuckSetting();
 $("grMusicDuck").onchange=function(){saveDuckSetting(this.checked);update()};
 $("grMusicTest").onclick=playDemo;
 saveDuckSetting(getDuckSetting());
 update();
 refreshTimer=setInterval(function(){if(!document.hidden)update()},2200);
 document.addEventListener("visibilitychange",function(){if(!document.hidden)update()});
 document.addEventListener("keydown",function(e){if(e.key==="Escape"&&expanded)setOpen(false)})
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install);else install();
window.GaZonMusic={
 open:function(){setOpen(true)},
 close:function(){setOpen(false)},
 refresh:update,
 nativeSpeak:nativeSpeak,
 beginSpeech:beginSpeech,
 endSpeech:endSpeech,
 stopSpeech:stopSpeech,
 demo:playDemo,
 isNative:supported
};
})();
