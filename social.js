(function(){
"use strict";
var K_PENDING="gazon_pending_submissions_v2",K_ROUTES="gazon_community_routes_v2",K_PLACES="gazon_community_places_v2",K_FAVS="gazon_favorites_v1",K_RIDERS="gazon_riders_v1";
function $(id){return document.getElementById(id)}
function read(k){try{var v=JSON.parse(localStorage.getItem(k)||"[]");return Array.isArray(v)?v:[]}catch(e){return[]}}
function write(k,v){localStorage.setItem(k,JSON.stringify(v))}
function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function rideMeta(r){return {km:Number(r&&r.km||0),duration:r&&r.duration||"00:00",max:Number(r&&r.max||0),date:r&&r.date||"",destination:r&&r.destination||""}}
function rideLabel(r,i){var m=rideMeta(r);return (r&&r.destination?r.destination:"Sürüş "+(i+1))+" · "+m.km.toFixed(1)+" km · "+m.duration}
function normalizeTrack(track){return (Array.isArray(track)?track:[]).filter(function(p){return Array.isArray(p)&&p.length>=2&&isFinite(Number(p[0]))&&isFinite(Number(p[1]))})}
async function compressPhoto(file){
 return new Promise(function(resolve,reject){
  var img=new Image(),u=URL.createObjectURL(file);
  img.onload=function(){
   try{
    var max=1600,scale=Math.min(1,max/Math.max(img.width,img.height)),w=Math.max(1,Math.round(img.width*scale)),h=Math.max(1,Math.round(img.height*scale)),c=document.createElement("canvas");
    c.width=w;c.height=h;var x=c.getContext("2d");x.drawImage(img,0,0,w,h);
    c.toBlob(function(blob){URL.revokeObjectURL(u);if(blob)resolve(blob);else reject(new Error("Fotoğraf işlenemedi."))},"image/jpeg",.82);
   }catch(e){URL.revokeObjectURL(u);reject(e)}
  };
  img.onerror=function(){URL.revokeObjectURL(u);reject(new Error("Fotoğraf açılamadı."))};img.src=u;
 })
}
async function uploadRoutePhotos(files){
 files=Array.prototype.slice.call(files||[]).slice(0,5);
 if(!files.length)return[];
 if(!(window.GaZonAuth&&GaZonAuth.configured))return[];
 await GaZonAuth.ready;
 if(!GaZonAuth.state.user)throw new Error("Fotoğraf yüklemek için giriş yapmalısın.");
 var out=[],uid=GaZonAuth.state.user.id;
 for(var i=0;i<files.length;i++){
  var blob=await compressPhoto(files[i]),path=uid+"/"+Date.now()+"-"+i+"-"+Math.random().toString(36).slice(2,8)+".jpg";
  var up=await GaZonAuth.client.storage.from("community-media").upload(path,blob,{contentType:"image/jpeg",upsert:false,cacheControl:"31536000"});
  if(up.error)throw up.error;
  var pub=GaZonAuth.client.storage.from("community-media").getPublicUrl(path);
  if(pub&&pub.data&&pub.data.publicUrl)out.push(pub.data.publicUrl);
 }
 return out
}
function profile(){try{return JSON.parse(localStorage.getItem("gazon_profile")||'{"name":"GaZonRide sürücüsü","bike":"Motosiklet"}')}catch(e){return{name:"GaZonRide sürücüsü",bike:"Motosiklet"}}}
function modal(title,body){
 var m=$("grSocialModal");if(!m)return;
 m.innerHTML='<div class="gr-modal-card"><div class="gr-modal-head"><b>'+esc(title)+'</b><button class="gr-close" id="grClose"><span class="mi">close</span></button></div>'+body+'</div>';
 m.classList.add("active");document.body.style.overflow="hidden";
 $("grClose").onclick=closeModal;
 m.onclick=function(e){if(e.target===m)closeModal()}
}
function closeModal(){var m=$("grSocialModal");if(m)m.classList.remove("active");document.body.style.overflow=""}
async function submission(type,data){
 var q=read(K_PENDING),p=profile(),item={id:"GR"+Date.now(),type:type,status:"pending",author:p.name||"Sürücü",bike:p.bike||"Motosiklet",createdAt:new Date().toLocaleString("tr-TR"),data:data};
 q.unshift(item);write(K_PENDING,q);render();
 if(window.GaZonAuth&&GaZonAuth.configured){
   await GaZonAuth.ready;
   if(!GaZonAuth.state.user){location.href="login.html?next="+encodeURIComponent(location.href);return item;}
   var pr=GaZonAuth.state.profile||{},row={
     user_id:GaZonAuth.state.user.id,type:type,status:"pending",
     title:data.title||"İçerik",description:data.description||null,
     destination:data.destination||null,difficulty:data.difficulty||null,
     place_type:data.type||null,lat:data.lat==null?null:Number(data.lat),lon:data.lon==null?null:Number(data.lon),
     track:Array.isArray(data.track)?data.track:[],photos:Array.isArray(data.photos)?data.photos.slice(0,5):[],stops:Array.isArray(data.stops)?data.stops.slice(0,5):[],ride_meta:data.ride_meta||{},author_name:pr.name||"Sürücü",bike:pr.bike||"Motosiklet"
   };
   var r=await GaZonAuth.client.from("submissions").insert(row).select("id").single();
   if(r.error)throw r.error;item.remoteId=r.data.id;
 }
 return item
}
function openNavigation(item){
 var b=document.querySelector('[data-page="navigation"]');if(b)b.click();
 setTimeout(function(){var inp=$("navDestination");if(!inp)return;inp.value=item.destination||item.title||"";if(item.lat!=null&&item.lon!=null){inp.dataset.lat=String(item.lat);inp.dataset.lon=String(item.lon);inp.dataset.label=item.title||""}inp.focus();var go=$("navGo");if(go)setTimeout(function(){go.click()},120)},120)
}
function routeForm(){
 var rides=read("gazon_rides");
 if(!rides.length){modal("Rota Paylaş",'<div class="gr-empty">Paylaşılabilir rota için önce en az bir sürüş kaydetmelisin.</div>');return}
 var opts=rides.slice(0,30).map(function(r,i){return '<option value="'+i+'">'+esc(rideLabel(r,i))+'</option>'}).join("");
 modal("Sürüş Rotasını Paylaş",'<div class="sub">Kayıtlı sürüşünü; yol fotoğrafları, mola noktaları ve 3D sürüş tekrarıyla topluluğa ekle.</div><select class="gr-field" id="grRideSelect">'+opts+'</select><input class="gr-field" id="grRouteTitle" placeholder="Rota adı"><input class="gr-field" id="grRouteDest" placeholder="Bölge / hedef (örn. Kapıdağ Yarımadası)"><select class="gr-field" id="grRouteDiff"><option>Kolay</option><option selected>Orta</option><option>Zor</option></select><textarea class="gr-field" id="grRouteDesc" rows="4" placeholder="Yol durumu, virajlar, manzara, dikkat edilecek yerler..."></textarea><div class="gr-form-section"><b>Yol Fotoğrafları</b><div class="sub">En fazla 3 fotoğraf. Fotoğraflar otomatik küçültülür.</div><input class="gr-field" id="grRoutePhotos" type="file" accept="image/*" multiple><div class="gr-photo-preview" id="grPhotoPreview"></div></div><div class="gr-form-section"><b>Mola Noktaları</b><div class="sub">Rotanın üzerinde en fazla 5 mola noktası işaretle.</div><input class="gr-field" id="grStopName" placeholder="Mola adı (örn. Seyir Tepesi)"><div class="gr-stop-range"><input id="grStopRange" type="range" min="0" max="100" value="50"><span id="grStopPct">%50</span></div><button class="gr-submit gr-secondary" id="grAddStop" type="button"><span class="mi" style="vertical-align:-5px">add_location_alt</span> Bu Noktayı Mola Olarak Ekle</button><div id="grStopsList"></div></div><div class="gr-route-summary" id="grRouteSummary"></div><button class="gr-submit" id="grSendRoute">Admin Onayına Gönder</button>');
 var stops=[];
 function selectedRide(){return rides[Number($("grRideSelect").value)||0]}
 function updateSummary(){var r=selectedRide(),m=rideMeta(r),n=normalizeTrack(r.track).length;$("grRouteSummary").innerHTML='<b>'+esc(r.destination||"Kayıtlı sürüş")+'</b><div class="sub">'+m.km.toFixed(1)+' km · '+esc(m.duration)+' · Maks. '+Math.round(m.max)+' km/sa · '+n+' rota noktası</div>'}
 function renderStops(){var r=selectedRide(),t=normalizeTrack(r.track);$("grStopsList").innerHTML=stops.length?stops.map(function(x,i){return '<div class="gr-stop-item"><span class="mi">local_cafe</span><div><b>'+esc(x.name)+'</b><small>Rotanın %'+Math.round(x.percent)+' noktasında</small></div><button data-del-stop="'+i+'"><span class="mi">close</span></button></div>'}).join(""):'<div class="sub" style="margin-top:8px">Henüz mola eklenmedi.</div>';document.querySelectorAll("[data-del-stop]").forEach(function(b){b.onclick=function(){stops.splice(Number(b.dataset.delStop),1);renderStops()}})}
 $("grRideSelect").onchange=function(){stops=[];updateSummary();renderStops()};
 $("grStopRange").oninput=function(){$("grStopPct").textContent="%"+this.value};
 $("grAddStop").onclick=function(){var name=$("grStopName").value.trim(),r=selectedRide(),t=normalizeTrack(r.track),pct=Number($("grStopRange").value);if(!name)return alert("Mola yerine bir isim ver.");if(t.length<2)return alert("Bu sürüşte rota izi yok.");if(stops.length>=5)return alert("En fazla 5 mola noktası ekleyebilirsin.");var idx=Math.min(t.length-1,Math.max(0,Math.round((pct/100)*(t.length-1)))),p=t[idx];stops.push({name:name,percent:pct,trackIndex:idx,lat:Number(p[0]),lon:Number(p[1])});$("grStopName").value="";renderStops()};
 $("grRoutePhotos").onchange=function(){var files=Array.prototype.slice.call(this.files||[]).slice(0,3);if((this.files||[]).length>3)alert("En fazla 3 fotoğraf yüklenebilir.");$("grPhotoPreview").innerHTML=files.map(function(f){return '<span>'+esc(f.name)+'</span>'}).join("")};
 updateSummary();renderStops();
 $("grSendRoute").onclick=async function(){
  var btn=this,title=$("grRouteTitle").value.trim(),dest=$("grRouteDest").value.trim(),ride=selectedRide(),track=normalizeTrack(ride.track);
  if(!title||!dest)return alert("Rota adı ve bölge/hedef gerekli.");
  if(track.length<2)return alert("Seçtiğin sürüşte rota izi bulunmuyor.");
  try{
   btn.disabled=true;btn.textContent="Fotoğraflar yükleniyor...";
   var photos=await uploadRoutePhotos($("grRoutePhotos").files);
   btn.textContent="Gönderiliyor...";
   await submission("route",{title:title,destination:dest,difficulty:$("grRouteDiff").value,description:$("grRouteDesc").value.trim(),track:track,photos:photos,stops:stops,ride_meta:rideMeta(ride)});
   closeModal();alert("Sürüş rotası admin onayına gönderildi.");showMine()
  }catch(e){alert((e&&e.message)||"Rota gönderilemedi.");btn.disabled=false;btn.textContent="Admin Onayına Gönder"}
 }
}
function postForm(){
 var rides=read("gazon_rides");
 if(!rides.length){modal("Fotoğraf Paylaş",'<div class="gr-empty">Rota bağlantılı paylaşım için önce en az bir sürüş kaydetmelisin.</div>');return}
 var opts=rides.slice(0,40).map(function(r,i){return '<option value="'+i+'">'+esc(rideLabel(r,i))+'</option>'}).join("");
 modal("Fotoğraf Paylaş",
  '<div class="gr-post-compose-note"><span class="mi">photo_camera</span><div><b>Sürüşünden paylaş</b><small>Fotoğraflar rota, mesafe ve sürüş süresiyle birlikte yayınlanır.</small></div></div>'+
  '<select class="gr-field" id="grPostRide">'+opts+'</select>'+
  '<input class="gr-field" id="grPostTitle" placeholder="Konum / başlık (örn. Kapıdağ turu)">'+
  '<textarea class="gr-field" id="grPostCaption" rows="4" maxlength="600" placeholder="Bu sürüşten bir şeyler yaz..."></textarea>'+
  '<label class="gr-photo-picker" for="grPostPhotos"><span class="mi">add_photo_alternate</span><b>Fotoğraf seç</b><small>1–5 fotoğraf</small></label>'+
  '<input id="grPostPhotos" type="file" accept="image/*" multiple style="display:none">'+
  '<div class="gr-compose-preview" id="grPostPreview"></div>'+
  '<div class="gr-route-summary" id="grPostRideSummary"></div>'+
  '<button class="gr-submit" id="grSendPost"><span class="mi" style="vertical-align:-5px">send</span> Paylaşımı Onaya Gönder</button>'
 );
 function selected(){return rides[Number($("grPostRide").value)||0]}
 function summary(){
  var r=selected(),m=rideMeta(r),t=normalizeTrack(r.track);
  $("grPostRideSummary").innerHTML='<div class="gr-mini-route"><span class="mi">route</span><div><b>'+esc(r.destination||"Kayıtlı sürüş")+'</b><small>'+m.km.toFixed(1)+' km · '+esc(m.duration)+' · '+t.length+' rota noktası</small></div></div>'
 }
 $("grPostRide").onchange=summary;
 $("grPostPhotos").onchange=function(){
  var files=Array.prototype.slice.call(this.files||[]);
  if(files.length>5)alert("En fazla 5 fotoğraf seçebilirsin.");
  files=files.slice(0,5);
  $("grPostPreview").innerHTML="";
  files.forEach(function(file){
   var u=URL.createObjectURL(file),img=document.createElement("img");img.src=u;img.onload=function(){URL.revokeObjectURL(u)};
   $("grPostPreview").appendChild(img)
  })
 };
 summary();
 $("grSendPost").onclick=async function(){
  var btn=this,ride=selected(),track=normalizeTrack(ride.track),files=Array.prototype.slice.call($("grPostPhotos").files||[]).slice(0,5);
  var title=$("grPostTitle").value.trim()||ride.destination||"Sürüş paylaşımı";
  var caption=$("grPostCaption").value.trim();
  if(track.length<2)return alert("Seçtiğin sürüşte rota izi bulunmuyor.");
  if(!files.length)return alert("En az bir fotoğraf seç.");
  try{
   btn.disabled=true;btn.textContent="Fotoğraflar yükleniyor...";
   var photos=await uploadRoutePhotos(files);
   if(!photos.length)throw new Error("Fotoğraflar yüklenemedi.");
   btn.textContent="Gönderiliyor...";
   var meta=rideMeta(ride);meta.socialPost=true;
   await submission("route",{title:title,destination:ride.destination||title,difficulty:"Sürüş",description:caption,track:track,photos:photos,stops:[],ride_meta:meta});
   closeModal();alert("Paylaşım admin onayına gönderildi.");showMine()
  }catch(e){alert((e&&e.message)||"Paylaşım gönderilemedi.");btn.disabled=false;btn.innerHTML='<span class="mi" style="vertical-align:-5px">send</span> Paylaşımı Onaya Gönder'}
 }
}
function placeForm(){
 modal("Mola Yeri Ekle",'<div class="sub">Mola noktasını mevcut GPS konumunla ekleyebilirsin.</div><input class="gr-field" id="grPlaceTitle" placeholder="Mola yeri adı"><select class="gr-field" id="grPlaceType"><option>Kafe</option><option>Akaryakıt</option><option>Manzara Noktası</option><option>Restoran</option><option>Servis / Lastik</option><option>Diğer</option></select><textarea class="gr-field" id="grPlaceDesc" rows="4" placeholder="Sürücü için neden iyi bir mola noktası?"></textarea><button class="gr-submit gr-secondary" id="grUseGps"><span class="mi" style="vertical-align:-5px">my_location</span> Mevcut Konumumu Kullan</button><div class="sub" id="grCoords" style="margin-top:7px">Konum seçilmedi</div><button class="gr-submit" id="grSendPlace">Admin Onayına Gönder</button>');
 $("grUseGps").onclick=function(){var out=$("grCoords");out.textContent="Konum alınıyor...";navigator.geolocation.getCurrentPosition(function(pos){out.dataset.lat=pos.coords.latitude;out.dataset.lon=pos.coords.longitude;out.textContent=pos.coords.latitude.toFixed(5)+", "+pos.coords.longitude.toFixed(5)},function(){out.textContent="Konum alınamadı. Konum iznini kontrol et."},{enableHighAccuracy:true,timeout:12000})};
 $("grSendPlace").onclick=async function(){var title=$("grPlaceTitle").value.trim(),out=$("grCoords");if(!title||!out.dataset.lat)return alert("Mola adı ve konum gerekli.");await submission("place",{title:title,type:$("grPlaceType").value,description:$("grPlaceDesc").value.trim(),lat:Number(out.dataset.lat),lon:Number(out.dataset.lon)});closeModal();alert("Mola yeri admin onayına gönderildi.");showMine()}
}
async function showMine(){
 var p=profile(),q=read(K_PENDING).filter(function(x){return x.author===(p.name||"")});
 if(window.GaZonAuth&&GaZonAuth.configured){
   await GaZonAuth.ready;
   if(GaZonAuth.state.user){
     var r=await GaZonAuth.client.from("submissions").select("*").eq("user_id",GaZonAuth.state.user.id).order("created_at",{ascending:false}).limit(50);
     if(!r.error)q=(r.data||[]).map(function(s){return {remoteId:s.id,type:s.type,status:s.status,createdAt:new Date(s.created_at).toLocaleString("tr-TR"),data:{title:s.title,description:s.description||"",destination:s.destination||"",difficulty:s.difficulty||"Orta",track:s.track||[],photos:s.photos||[],stops:s.stops||[],ride_meta:s.ride_meta||{}}}});
   }
 }
 modal("Gönderilerim",q.length?q.map(function(s){var st=s.status==="approved"?"ONAYLANDI":s.status==="rejected"?"REDDEDİLDİ":"ONAY BEKLİYOR";return '<div class="gr-admin-item"><b>'+esc(s.data.title)+'</b><span class="gr-badge '+(s.status==="approved"?"approved":"pending")+'">'+st+'</span><div class="gr-post-meta">'+esc(s.type==="route"?"Rota":"Mola yeri")+' · '+esc(s.createdAt)+'</div><div class="gr-post-text">'+esc(s.data.description||"")+'</div>'+(s.type==="route"&&s.remoteId?'<div class="gr-admin-actions"><button class="gr-ok" data-my-edit="'+s.remoteId+'">Düzenle</button><button class="gr-no" data-my-delete="'+s.remoteId+'">Sil</button></div>':'')+'</div>'}).join(""):'<div class="gr-empty">Henüz gönderin yok.</div>');document.querySelectorAll("[data-my-edit]").forEach(function(b){b.onclick=function(){var item=q.find(function(x){return x.remoteId===b.dataset.myEdit});if(item)editOwnRoute(item)}});document.querySelectorAll("[data-my-delete]").forEach(function(b){b.onclick=function(){deleteOwnRoute(b.dataset.myDelete)}})
}
async function deleteOwnRoute(id){
 if(!confirm("Bu rotayı silmek istiyor musun?"))return;
 await GaZonAuth.ready;var r=await GaZonAuth.client.from("submissions").delete().eq("id",id).eq("user_id",GaZonAuth.state.user.id);
 if(r.error){alert(r.error.message);return}closeModal();await syncRemoteCommunity();showMine()
}
function editOwnRoute(item){
 var d=item.data||{};
 modal("Rotayı Düzenle",'<input class="gr-field" id="grEditTitle" value="'+esc(d.title||"")+'" placeholder="Rota adı"><input class="gr-field" id="grEditDest" value="'+esc(d.destination||"")+'" placeholder="Bölge / hedef"><select class="gr-field" id="grEditDiff"><option>Kolay</option><option>Orta</option><option>Zor</option></select><textarea class="gr-field" id="grEditDesc" rows="5">'+esc(d.description||"")+'</textarea><div class="sub" style="margin-top:8px">Rota izi, mola noktaları ve mevcut fotoğraflar korunur. Kaydedince tekrar admin onayına gider.</div><button class="gr-submit" id="grSaveEdit">Değişiklikleri Kaydet</button>');
 $("grEditDiff").value=d.difficulty||"Orta";
 $("grSaveEdit").onclick=async function(){
  var row={title:$("grEditTitle").value.trim(),destination:$("grEditDest").value.trim(),difficulty:$("grEditDiff").value,description:$("grEditDesc").value.trim(),status:"pending",reviewed_at:null,reviewed_by:null};
  if(!row.title||!row.destination)return alert("Rota adı ve hedef gerekli.");
  var r=await GaZonAuth.client.from("submissions").update(row).eq("id",item.remoteId).eq("user_id",GaZonAuth.state.user.id);
  if(r.error){alert(r.error.message);return}closeModal();alert("Rota tekrar admin onayına gönderildi.");showMine()
 }
}
function admin(){
 if(window.GaZonAuth&&GaZonAuth.configured){location.href="admin.html";return;}
 var q=read(K_PENDING);
 modal("Admin Onay Kuyruğu",'<div class="sub">Yerel test kuyruğu.</div>'+(q.length?q.map(function(s,i){return '<div class="gr-admin-item"><b>'+esc(s.data.title)+'</b><span class="gr-badge pending">BEKLİYOR</span><div class="gr-post-meta">'+esc(s.type==="route"?"Rota":"Mola yeri")+' · '+esc(s.author)+' · '+esc(s.bike)+'</div><div class="gr-post-text">'+esc(s.data.description||"")+'</div><div class="gr-admin-actions"><button class="gr-ok" data-gr-approve="'+i+'">Onayla</button><button class="gr-no" data-gr-reject="'+i+'">Reddet</button></div></div>'}).join(""):'<div class="gr-empty">Onay bekleyen gönderi yok.</div>'));
 document.querySelectorAll("[data-gr-approve]").forEach(function(b){b.onclick=function(){var a=read(K_PENDING),i=Number(b.getAttribute("data-gr-approve")),s=a[i];if(!s)return;if(s.type==="route"){var r=read(K_ROUTES);r.unshift({title:s.data.title,destination:s.data.destination,difficulty:s.data.difficulty,description:s.data.description,track:s.data.track||[],photos:s.data.photos||[],stops:s.data.stops||[],ride_meta:s.data.ride_meta||{},author:s.author,bike:s.bike,likes:0,createdAt:s.createdAt});write(K_ROUTES,r)}else{var p=read(K_PLACES);p.unshift({title:s.data.title,type:s.data.type,description:s.data.description,lat:s.data.lat,lon:s.data.lon,author:s.author,bike:s.bike,likes:0,createdAt:s.createdAt});write(K_PLACES,p)}a.splice(i,1);write(K_PENDING,a);render();admin()}});
 document.querySelectorAll("[data-gr-reject]").forEach(function(b){b.onclick=function(){var a=read(K_PENDING),i=Number(b.getAttribute("data-gr-reject"));a.splice(i,1);write(K_PENDING,a);admin()}});
}
function favoriteId(kind,x){return kind+"|"+String(x.title||"")+"|"+String(x.destination||x.lat||"")}
function isFavorite(kind,x){var id=favoriteId(kind,x);return read(K_FAVS).some(function(f){return f.id===id})}
async function toggleFavorite(kind,index){
 var key=kind==="route"?K_ROUTES:K_PLACES,a=read(key),x=a[index];if(!x)return;
 var favs=read(K_FAVS),id=favoriteId(kind,x),at=favs.findIndex(function(f){return f.id===id}),adding=at<0;
 if(!adding)favs.splice(at,1);
 else favs.unshift({id:id,kind:kind,title:x.title||"",destination:x.destination||x.title||"",lat:x.lat,lon:x.lon,meta:kind==="route"?(x.difficulty||"Rota"):(x.type||"Mola"),author:x.author||"",submissionId:x.submissionId||null});
 write(K_FAVS,favs);render();
 if(window.GaZonAuth&&GaZonAuth.configured&&x.submissionId){
  await GaZonAuth.ready;if(!GaZonAuth.state.user)return;
  if(adding){var r=await GaZonAuth.client.from("favorites").upsert({user_id:GaZonAuth.state.user.id,submission_id:x.submissionId},{onConflict:"user_id,submission_id"});if(r.error)console.warn(r.error);}
  else{var d=await GaZonAuth.client.from("favorites").delete().eq("user_id",GaZonAuth.state.user.id).eq("submission_id",x.submissionId);if(d.error)console.warn(d.error);}
 }
}
function card(kind,x,i){
 var icon=kind==="route"?"two_wheeler":"local_cafe",type=kind==="route"?(x.difficulty||"Rota"):(x.type||"Mola"),photos=Array.isArray(x.photos)?x.photos.slice(0,5):[],stops=Array.isArray(x.stops)?x.stops:[],m=x.ride_meta||{},isPost=kind==="route"&&m.socialPost===true;
 var gallery="";
 if(photos.length){
  if(isPost){
   gallery='<div class="gr-insta-gallery" data-gallery="'+i+'"><div class="gr-insta-track">'+photos.map(function(u,n){return '<div class="gr-insta-slide"><img src="'+esc(u)+'" loading="lazy" alt="Sürüş fotoğrafı">'+(photos.length>1?'<span class="gr-photo-count">'+(n+1)+'/'+photos.length+'</span>':'')+'</div>'}).join("")+'</div></div>';
  }else{
   gallery='<div class="gr-gallery gr-gallery-'+Math.min(photos.length,3)+'">'+photos.slice(0,3).map(function(u){return '<img src="'+esc(u)+'" loading="lazy" alt="Rota fotoğrafı">'}).join("")+'</div>';
  }
 }
 var stats=kind==="route"&&x.track&&x.track.length>1?'<div class="gr-route-stats"><span><b>'+Number(m.km||0).toFixed(1)+'</b> km</span><span><b>'+esc(m.duration||"—")+'</b> süre</span><span><b>'+Math.round(Number(m.max||0))+'</b> km/sa</span></div>':"";
 var stopHtml=kind==="route"&&stops.length?'<div class="gr-card-stops">'+stops.map(function(z){return '<span><i class="mi">local_cafe</i>'+esc(z.name||"Mola")+'</span>'}).join("")+'</div>':"";
 var navText=kind==="route"&&x.track&&x.track.length>1?"Rotayı Sür":"Git";
 var head='<div class="gr-post-head"><div class="gr-post-avatar"><span class="mi">'+icon+'</span></div><div class="gr-post-user"><b>'+esc(x.author||"GaZonRide Sürücüsü")+'</b><small>'+esc(x.bike||"Motosiklet")+' · '+esc(x.createdAt||"")+'</small></div><button class="gr-post-more"><span class="mi">more_horiz</span></button></div>';
 var body=isPost
  ? '<div class="gr-insta-actions"><button data-gr-like="'+kind+':'+i+'"><span class="mi">favorite_border</span></button><button data-gr-share="'+kind+':'+i+'"><span class="mi">send</span></button><button data-gr-nav="'+kind+':'+i+'"><span class="mi">route</span></button></div><div class="gr-post-caption"><b>'+esc(x.author||"Sürücü")+'</b> '+esc(x.description||"")+'</div><div class="gr-post-routechip"><span class="mi">route</span><div><b>'+esc(x.title||x.destination||"Sürüş")+'</b><small>'+Number(m.km||0).toFixed(1)+' km · '+esc(m.duration||"—")+'</small></div><button data-gr-nav="'+kind+':'+i+'">Rotayı Aç</button></div>'
  : '<div class="gr-post-title">'+esc(x.title)+'</div><div class="gr-post-text">'+esc(x.description||"")+'</div>'+stats+stopHtml+'<div class="gr-post-meta">'+esc(type)+'</div><div class="gr-post-actions"><button class="gr-drive-route" data-gr-nav="'+kind+':'+i+'"><span class="mi" style="font-size:15px">navigation</span> '+navText+'</button><button data-gr-like="'+kind+':'+i+'"><span class="mi" style="font-size:15px">favorite</span> '+(isFavorite(kind,x)?"Favoride":"Favori")+'</button>'+(kind==="route"&&x.track&&x.track.length>1?'<button data-gr-replay-route="'+i+'"><span class="mi" style="font-size:15px">3d_rotation</span> Sürüş</button>':'')+'<button data-gr-share="'+kind+':'+i+'"><span class="mi" style="font-size:15px">share</span> Paylaş</button></div>';
 return '<article class="gr-post '+(isPost?'gr-insta-post':'')+'">'+head+gallery+body+'</article>'
}
function render(filter){
 filter=filter||document.querySelector(".gr-social-tab.active")?.dataset.grTab||"feed";
 var routes=read(K_ROUTES),places=read(K_PLACES),list=$("grSocialList");if(!list)return;
 var html=[];
 if(filter==="feed"||filter==="routes")routes.forEach(function(x,i){html.push(card("route",x,i))});
 if(filter==="feed"||filter==="places")places.forEach(function(x,i){html.push(card("place",x,i))});
 if(filter==="riders"){
  var riders=read(K_RIDERS),me=window.GaZonAuth&&GaZonAuth.state&&GaZonAuth.state.user?GaZonAuth.state.user.id:"";
  if(!riders.length){var p=profile();riders=[{id:me,name:p.name||"GaZonRide sürücüsü",bike:p.bike||"Motosiklet"}]}
  riders.forEach(function(r){
   html.push('<article class="gr-post"><div class="gr-post-head"><div class="gr-post-avatar"><span class="mi">person</span></div><div><b>'+esc(r.name||"GaZonRide sürücüsü")+(r.id===me?' · Sen':'')+'</b><small>'+esc(r.bike||"Motosiklet")+'</small></div></div><div class="gr-post-text">GaZonRide sürücüsü</div>'+(r.id===me?'<div class="gr-post-actions"><button id="grOpenProfile"><span class="mi" style="font-size:15px">person</span> Profilim</button><button id="grOpenGroups"><span class="mi" style="font-size:15px">groups</span> Gruplarım</button></div>':'')+'</article>')
  });
 }
 list.innerHTML=html.length?html.join(""):'<div class="gr-empty">Bu bölümde henüz içerik yok. İlk katkıyı sen ekleyebilirsin.</div>';
 document.querySelectorAll("[data-gr-nav]").forEach(function(b){b.onclick=function(){var p=b.getAttribute("data-gr-nav").split(":"),a=read(p[0]==="route"?K_ROUTES:K_PLACES),x=a[Number(p[1])];if(!x)return;if(p[0]==="route"&&x.track&&x.track.length>1&&window.GaZonNavigation&&window.GaZonNavigation.openCommunityRoute)window.GaZonNavigation.openCommunityRoute(x);else openNavigation(x)}});
 document.querySelectorAll("[data-gr-like]").forEach(function(b){b.onclick=function(){var p=b.getAttribute("data-gr-like").split(":");toggleFavorite(p[0],Number(p[1]))}});
 document.querySelectorAll("[data-gr-share]").forEach(function(b){b.onclick=function(){var p=b.getAttribute("data-gr-share").split(":"),a=read(p[0]==="route"?K_ROUTES:K_PLACES),x=a[Number(p[1])];if(!x)return;var t="GaZonRide · "+x.title+"\n"+(x.description||"");if(navigator.share)navigator.share({title:x.title,text:t}).catch(function(){});else navigator.clipboard&&navigator.clipboard.writeText(t)}});
 document.querySelectorAll("[data-gr-replay-route]").forEach(function(b){b.onclick=function(){var a=read(K_ROUTES),x=a[Number(b.getAttribute("data-gr-replay-route"))],m=x&&x.ride_meta||{};if(x&&window.GaZonReplay)window.GaZonReplay.open({km:Number(m.km||0),duration:m.duration||"00:00",max:Number(m.max||0),date:m.date||x.createdAt||"",destination:x.title||m.destination||"",track:x.track||[]})}});
 var op=$("grOpenProfile");if(op)op.onclick=function(){var b=document.querySelector('[data-page="profile"]');if(b)b.click()};
 var og=$("grOpenGroups");if(og)og.onclick=function(){var b=document.querySelector('[data-page="profile"]');if(b)b.click();setTimeout(function(){var row=document.querySelector('[data-profile-action="groups"]');if(row)row.click()},120)};
}
function syncRemoteCommunity(){
 if(!(window.GaZonAuth&&GaZonAuth.configured))return;
 GaZonAuth.ready.then(async function(){
  if(!GaZonAuth.state.user)return;
  async function pull(){
   var r=await GaZonAuth.client.from("submissions").select("*").eq("status","approved").order("reviewed_at",{ascending:false}).limit(100);
   if(r.error){console.warn("community sync",r.error);return;}
   var routes=[],places=[],byId={};
   (r.data||[]).forEach(function(s){
    var item;
    if(s.type==="route"){item={submissionId:s.id,title:s.title,destination:s.destination||s.title,difficulty:s.difficulty||"Rota",description:s.description||"",track:s.track||[],photos:s.photos||[],stops:s.stops||[],ride_meta:s.ride_meta||{},author:s.author_name||"Sürücü",bike:s.bike||"Motosiklet",createdAt:new Date(s.created_at).toLocaleString("tr-TR")};routes.push(item)}
    else{item={submissionId:s.id,title:s.title,type:s.place_type||"Mola",description:s.description||"",lat:s.lat,lon:s.lon,author:s.author_name||"Sürücü",bike:s.bike||"Motosiklet",createdAt:new Date(s.created_at).toLocaleString("tr-TR")};places.push(item)}
    byId[s.id]=item;
   });
   write(K_ROUTES,routes);write(K_PLACES,places);
   var fr=await GaZonAuth.client.from("favorites").select("submission_id").eq("user_id",GaZonAuth.state.user.id);
   if(!fr.error){
    var favs=(fr.data||[]).map(function(x){var z=byId[x.submission_id];if(!z)return null;var kind=routes.some(function(r){return r.submissionId===x.submission_id})?"route":"place";return {id:favoriteId(kind,z),kind:kind,title:z.title||"",destination:z.destination||z.title||"",lat:z.lat,lon:z.lon,meta:kind==="route"?(z.difficulty||"Rota"):(z.type||"Mola"),author:z.author||"",submissionId:x.submission_id}}).filter(Boolean);
    write(K_FAVS,favs);
   }
   var pr=await GaZonAuth.client.from("profiles").select("id,name,bike,avatar_url").order("created_at",{ascending:false}).limit(100);
   if(!pr.error)write(K_RIDERS,pr.data||[]);
   render();
  }
  await pull();
  try{
   GaZonAuth.client.channel("gazon-community")
    .on("postgres_changes",{event:"*",schema:"public",table:"submissions"},pull)
    .on("postgres_changes",{event:"*",schema:"public",table:"profiles"},pull)
    .subscribe();
  }catch(e){}
 });
}
function install(){
 var host=document.querySelector(".discoverSection");if(!host||$("grSocial"))return;
 var wrap=document.createElement("section");wrap.id="grSocial";wrap.className="gr-social";wrap.innerHTML='<div class="gr-social-head"><div><b>GaZonRide Topluluğu</b><small>Rota · mola · sürücüler</small></div><button class="chip" id="grMine">Katkılarım</button></div><div class="gr-social-actions gr-social-actions-3"><button class="gr-social-btn primary" id="grAddPost"><span class="mi">add_photo_alternate</span>Fotoğraf Paylaş</button><button class="gr-social-btn" id="grAddRoute"><span class="mi">add_road</span>Rota Ekle</button><button class="gr-social-btn" id="grAddPlace"><span class="mi">add_location_alt</span>Mola Yeri</button></div><div class="gr-social-tabs"><button class="gr-social-tab active" data-gr-tab="feed">Akış</button><button class="gr-social-tab" data-gr-tab="routes">Rotalar</button><button class="gr-social-tab" data-gr-tab="places">Molalar</button><button class="gr-social-tab" data-gr-tab="riders">Sürücüler</button><button class="gr-social-tab" id="grAdmin">Admin</button></div><div class="gr-social-list" id="grSocialList"></div>';
 var quick=host.querySelector(".quickRow");if(quick)quick.insertAdjacentElement("afterend",wrap);else host.prepend(wrap);
 var m=document.createElement("div");m.id="grSocialModal";m.className="gr-modal";document.body.appendChild(m);
 $("grAddPost").onclick=postForm;$("grAddRoute").onclick=routeForm;$("grAddPlace").onclick=placeForm;$("grMine").onclick=showMine;$("grAdmin").onclick=admin;var ab=$("grAdmin");if(ab)ab.style.display="none";if(window.GaZonAuth&&GaZonAuth.ready)GaZonAuth.ready.then(function(){if(ab)ab.style.display=GaZonAuth.state.role==="admin"?"inline-block":"none"});
 document.querySelectorAll("[data-gr-tab]").forEach(function(b){b.onclick=function(){document.querySelectorAll(".gr-social-tab").forEach(function(x){x.classList.remove("active")});b.classList.add("active");render(b.dataset.grTab)}});
 render();
 syncRemoteCommunity();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install);else install();
window.GaZonRideSocial={render:render,postForm:postForm,routeForm:routeForm,placeForm:placeForm,admin:admin,mine:showMine,close:closeModal};
})();