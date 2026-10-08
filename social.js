(function(){
"use strict";
var K_PENDING="gazon_pending_submissions_v2",K_ROUTES="gazon_community_routes_v2",K_PLACES="gazon_community_places_v2",K_FAVS="gazon_favorites_v1";
function $(id){return document.getElementById(id)}
function read(k){try{var v=JSON.parse(localStorage.getItem(k)||"[]");return Array.isArray(v)?v:[]}catch(e){return[]}}
function write(k,v){localStorage.setItem(k,JSON.stringify(v))}
function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
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
     track:Array.isArray(data.track)?data.track:[],author_name:pr.name||"Sürücü",bike:pr.bike||"Motosiklet"
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
 var rides=read("gazon_rides"),last=rides[0];
 modal("Rota Ekle",'<div class="sub">Rota önce admin onayına gider. Onaylandıktan sonra toplulukta görünür.</div><input class="gr-field" id="grRouteTitle" placeholder="Rota adı"><input class="gr-field" id="grRouteDest" placeholder="Hedef / bölge (örn. Akçakoca)"><select class="gr-field" id="grRouteDiff"><option>Kolay</option><option selected>Orta</option><option>Zor</option></select><textarea class="gr-field" id="grRouteDesc" rows="4" placeholder="Rota açıklaması, yol durumu, viraj, manzara..."></textarea>'+(last?'<div class="sub" style="margin-top:9px">Son kayıtlı sürüş '+Number(last.km||0).toFixed(1)+' km. Rota izi de gönderiye eklenecek.</div>':'<div class="sub" style="margin-top:9px">Henüz kayıtlı sürüş yok. Rota yine hedef adıyla gönderilebilir.</div>')+'<button class="gr-submit" id="grSendRoute">Admin Onayına Gönder</button>');
 $("grSendRoute").onclick=async function(){var title=$("grRouteTitle").value.trim(),dest=$("grRouteDest").value.trim();if(!title||!dest)return alert("Rota adı ve hedef gerekli.");await submission("route",{title:title,destination:dest,difficulty:$("grRouteDiff").value,description:$("grRouteDesc").value.trim(),track:last&&last.track?last.track:[]});closeModal();alert("Rota admin onayına gönderildi.");showMine()}
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
     if(!r.error)q=(r.data||[]).map(function(s){return {type:s.type,status:s.status,createdAt:new Date(s.created_at).toLocaleString("tr-TR"),data:{title:s.title,description:s.description||""}}});
   }
 }
 modal("Gönderilerim",q.length?q.map(function(s){var st=s.status==="approved"?"ONAYLANDI":s.status==="rejected"?"REDDEDİLDİ":"ONAY BEKLİYOR";return '<div class="gr-admin-item"><b>'+esc(s.data.title)+'</b><span class="gr-badge '+(s.status==="approved"?"approved":"pending")+'">'+st+'</span><div class="gr-post-meta">'+esc(s.type==="route"?"Rota":"Mola yeri")+' · '+esc(s.createdAt)+'</div><div class="gr-post-text">'+esc(s.data.description||"")+'</div></div>'}).join(""):'<div class="gr-empty">Henüz gönderin yok.</div>')
}
function admin(){
 if(window.GaZonAuth&&GaZonAuth.configured){location.href="admin.html";return;}
 var q=read(K_PENDING);
 modal("Admin Onay Kuyruğu",'<div class="sub">Şimdilik bu cihazdaki test kuyruğudur. Merkezi admin panelini Firebase ile bağlayacağız.</div>'+(q.length?q.map(function(s,i){return '<div class="gr-admin-item"><b>'+esc(s.data.title)+'</b><span class="gr-badge pending">BEKLİYOR</span><div class="gr-post-meta">'+esc(s.type==="route"?"Rota":"Mola yeri")+' · '+esc(s.author)+' · '+esc(s.bike)+'</div><div class="gr-post-text">'+esc(s.data.description||"")+'</div><div class="gr-admin-actions"><button class="gr-ok" data-gr-approve="'+i+'">Onayla</button><button class="gr-no" data-gr-reject="'+i+'">Reddet</button></div></div>'}).join(""):'<div class="gr-empty">Onay bekleyen gönderi yok.</div>'));
 document.querySelectorAll("[data-gr-approve]").forEach(function(b){b.onclick=function(){var a=read(K_PENDING),i=Number(b.getAttribute("data-gr-approve")),s=a[i];if(!s)return;if(s.type==="route"){var r=read(K_ROUTES);r.unshift({title:s.data.title,destination:s.data.destination,difficulty:s.data.difficulty,description:s.data.description,track:s.data.track||[],author:s.author,bike:s.bike,likes:0,createdAt:s.createdAt});write(K_ROUTES,r)}else{var p=read(K_PLACES);p.unshift({title:s.data.title,type:s.data.type,description:s.data.description,lat:s.data.lat,lon:s.data.lon,author:s.author,bike:s.bike,likes:0,createdAt:s.createdAt});write(K_PLACES,p)}a.splice(i,1);write(K_PENDING,a);render();admin()}});
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
 var icon=kind==="route"?"route":"local_cafe",type=kind==="route"?(x.difficulty||"Rota"):(x.type||"Mola");
 return '<article class="gr-post"><div class="gr-post-head"><div class="gr-post-avatar"><span class="mi">'+icon+'</span></div><div><b>'+esc(x.author||"GaZonRide Sürücüsü")+'</b><small>'+esc(x.bike||"Motosiklet")+' · '+esc(x.createdAt||"")+'</small></div></div><div class="gr-post-title">'+esc(x.title)+'</div><div class="gr-post-text">'+esc(x.description||"")+'</div><div class="gr-post-meta">'+esc(type)+'</div><div class="gr-post-actions"><button data-gr-nav="'+kind+':'+i+'"><span class="mi" style="font-size:15px">navigation</span> Git</button><button data-gr-like="'+kind+':'+i+'"><span class="mi" style="font-size:15px">favorite</span> '+(isFavorite(kind,x)?"Favoride":"Favori")+' · '+Number(x.likes||0)+'</button>'+(kind==="route"&&x.track&&x.track.length>1?'<button data-gr-replay-route="'+i+'"><span class="mi" style="font-size:15px">3d_rotation</span> 3D</button>':'')+'<button data-gr-share="'+kind+':'+i+'"><span class="mi" style="font-size:15px">share</span> Paylaş</button></div></article>'
}
function render(filter){
 filter=filter||document.querySelector(".gr-social-tab.active")?.dataset.grTab||"feed";
 var routes=read(K_ROUTES),places=read(K_PLACES),list=$("grSocialList");if(!list)return;
 var html=[];
 if(filter==="feed"||filter==="routes")routes.forEach(function(x,i){html.push(card("route",x,i))});
 if(filter==="feed"||filter==="places")places.forEach(function(x,i){html.push(card("place",x,i))});
 if(filter==="riders"){var p=profile(),groups=read("gazon_groups");html.push('<article class="gr-post"><div class="gr-post-head"><div class="gr-post-avatar"><span class="mi">person</span></div><div><b>'+esc(p.name||"GaZonRide sürücüsü")+'</b><small>'+esc(p.bike||"Motosiklet")+' · '+groups.length+' grup</small></div></div><div class="gr-post-text">Sürücü profilin, sürüşlerin ve grupların aktif.</div><div class="gr-post-actions"><button id="grOpenProfile"><span class="mi" style="font-size:15px">person</span> Profilim</button><button id="grOpenGroups"><span class="mi" style="font-size:15px">groups</span> Gruplarım</button></div></article>')}
 list.innerHTML=html.length?html.join(""):'<div class="gr-empty">Bu bölümde henüz içerik yok. İlk katkıyı sen ekleyebilirsin.</div>';
 document.querySelectorAll("[data-gr-nav]").forEach(function(b){b.onclick=function(){var p=b.getAttribute("data-gr-nav").split(":"),a=read(p[0]==="route"?K_ROUTES:K_PLACES),x=a[Number(p[1])];if(x)openNavigation(x)}});
 document.querySelectorAll("[data-gr-like]").forEach(function(b){b.onclick=function(){var p=b.getAttribute("data-gr-like").split(":");toggleFavorite(p[0],Number(p[1]))}});
 document.querySelectorAll("[data-gr-share]").forEach(function(b){b.onclick=function(){var p=b.getAttribute("data-gr-share").split(":"),a=read(p[0]==="route"?K_ROUTES:K_PLACES),x=a[Number(p[1])];if(!x)return;var t="GaZonRide · "+x.title+"\n"+(x.description||"");if(navigator.share)navigator.share({title:x.title,text:t}).catch(function(){});else navigator.clipboard&&navigator.clipboard.writeText(t)}});
 document.querySelectorAll("[data-gr-replay-route]").forEach(function(b){b.onclick=function(){var a=read(K_ROUTES),x=a[Number(b.getAttribute("data-gr-replay-route"))];if(x&&window.GaZonReplay)window.GaZonReplay.open({km:0,duration:"",max:0,date:x.createdAt||"",destination:x.title||"",track:x.track||[]})}});
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
   var routes=[],places=[];
   (r.data||[]).forEach(function(s){
    if(s.type==="route")routes.push({submissionId:s.id,title:s.title,destination:s.destination||s.title,difficulty:s.difficulty||"Rota",description:s.description||"",track:s.track||[],author:s.author_name||"Sürücü",bike:s.bike||"Motosiklet",likes:0,createdAt:new Date(s.created_at).toLocaleString("tr-TR")});
    else places.push({submissionId:s.id,title:s.title,type:s.place_type||"Mola",description:s.description||"",lat:s.lat,lon:s.lon,author:s.author_name||"Sürücü",bike:s.bike||"Motosiklet",likes:0,createdAt:new Date(s.created_at).toLocaleString("tr-TR")});
   });
   write(K_ROUTES,routes);write(K_PLACES,places);render();
  }
  await pull();
  try{GaZonAuth.client.channel("gazon-community").on("postgres_changes",{event:"*",schema:"public",table:"submissions",filter:"status=eq.approved"},pull).subscribe();}catch(e){}
 });
}
function install(){
 var host=document.querySelector(".discoverSection");if(!host||$("grSocial"))return;
 var wrap=document.createElement("section");wrap.id="grSocial";wrap.className="gr-social";wrap.innerHTML='<div class="gr-social-head"><div><b>GaZonRide Topluluğu</b><small>Rota · mola · sürücüler</small></div><button class="chip" id="grMine">Katkılarım</button></div><div class="gr-social-actions"><button class="gr-social-btn primary" id="grAddRoute"><span class="mi">add_road</span>Rota Ekle</button><button class="gr-social-btn" id="grAddPlace"><span class="mi">add_location_alt</span>Mola Yeri Ekle</button></div><div class="gr-social-tabs"><button class="gr-social-tab active" data-gr-tab="feed">Akış</button><button class="gr-social-tab" data-gr-tab="routes">Rotalar</button><button class="gr-social-tab" data-gr-tab="places">Molalar</button><button class="gr-social-tab" data-gr-tab="riders">Sürücüler</button><button class="gr-social-tab" id="grAdmin">Admin</button></div><div class="gr-social-list" id="grSocialList"></div>';
 var quick=host.querySelector(".quickRow");if(quick)quick.insertAdjacentElement("afterend",wrap);else host.prepend(wrap);
 var m=document.createElement("div");m.id="grSocialModal";m.className="gr-modal";document.body.appendChild(m);
 $("grAddRoute").onclick=routeForm;$("grAddPlace").onclick=placeForm;$("grMine").onclick=showMine;$("grAdmin").onclick=admin;
 document.querySelectorAll("[data-gr-tab]").forEach(function(b){b.onclick=function(){document.querySelectorAll(".gr-social-tab").forEach(function(x){x.classList.remove("active")});b.classList.add("active");render(b.dataset.grTab)}});
 render();
 syncRemoteCommunity();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install);else install();
window.GaZonRideSocial={render:render,routeForm:routeForm,placeForm:placeForm,admin:admin,mine:showMine,close:closeModal};
})();