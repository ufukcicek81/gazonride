(function(){
"use strict";
var data=[],cities=[],selectedCity="",selectedCategory="Tümü",searchText="",page=0,pageSize=24,visitedKey="gazon_travel_visited_v1",galleryCache={},cataloguePartial=false;
function $(id){return document.getElementById(id)}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function visited(){
 try{return JSON.parse(localStorage.getItem(visitedKey)||"{}")||{}}catch(e){return {}}
}
function updateVisited(id,value){
 var all=visited();if(value)all[id]=1;else delete all[id];localStorage.setItem(visitedKey,JSON.stringify(all))
}
function filtered(){
 var q=searchText.toLocaleLowerCase("tr-TR");
 return data.filter(function(x){
  return (!selectedCity||x.city===selectedCity)&&
    (selectedCategory==="Tümü"||x.category===selectedCategory)&&
    (!q||(x.city+" "+x.title+" "+x.category).toLocaleLowerCase("tr-TR").includes(q))
 })
}
function genericDescription(x){
 var kind=x.category,place=x.title,city=x.city;
 var base="Bu öneri, "+city+" ilinde keşfedilebilecek yerler ve deneyimler listesinden alınmıştır. "+place+" için gezi rotası oluştururken ulaşım, mevsim ve ziyaret koşullarını önceden kontrol edin.";
 if(kind==="Doğa")return base+" Doğa alanlarında hava ve zemin koşulları hızla değişebilir; korunan bölge kurallarına uyun.";
 if(kind==="Tarih")return base+" Tarihi alanlarda ziyaret saati, bilet ve giriş koşulları değişebilir.";
 if(kind==="Etkinlik")return base+" Festival ve etkinlik tarihleri her yıl değişebildiği için güncel takvimi doğrulayın.";
 if(kind==="Deniz")return base+" Kıyı ve deniz faaliyetlerinde hava, dalga ve yüzme güvenliğini önceliklendirin.";
 return base
}
function draw(){
 var root=$("grTravelCatalogue");if(!root||!root.dataset.ready)return;
 var all=filtered(),totalPages=Math.max(1,Math.ceil(all.length/pageSize)),v=visited();
 page=Math.min(page,totalPages-1);
 var items=all.slice(page*pageSize,(page+1)*pageSize);
 $("grTravelCount").textContent=all.length+(cataloguePartial?" başlangıç önerisi · 1021 maddelik tam liste henüz doğrulanmadı":" etkinlik gösteriliyor")+" · "+Object.keys(v).length+" ziyaret edildi";
 $("grTravelPage").textContent=(page+1)+" / "+totalPages+" sayfa";
 $("grTravelBack").disabled=page===0;
 $("grTravelNext").disabled=page>=totalPages-1;
 $("grTravelItems").innerHTML=items.length?items.map(function(x){
  var checked=!!v[x.id];
  return '<article class="gr-travel-item"><div class="gr-travel-item-top"><span class="gr-travel-number">#'+x.id+'</span><span class="gr-travel-city">'+esc(x.city)+'</span><span class="gr-travel-category">'+esc(x.category)+'</span></div>'+
   '<b>'+esc(x.title)+'</b><div class="gr-travel-item-actions"><button type="button" data-travel-details="'+x.id+'"><span class="mi">photo_library</span> Fotoğraf ve Detay</button>'+
   '<button type="button" data-travel-check="'+x.id+'" class="'+(checked?"done":"")+'">'+(checked?"✓ Gittim":"○ Gittim")+'</button></div></article>'
 }).join(""):'<div class="gr-travel-empty">Bu filtrede etkinlik bulunamadı.</div>';
 $("grTravelItems").querySelectorAll("[data-travel-details]").forEach(function(b){b.onclick=function(){openDetails(Number(b.dataset.travelDetails))}});
 $("grTravelItems").querySelectorAll("[data-travel-check]").forEach(function(b){b.onclick=function(){var id=Number(b.dataset.travelCheck);updateVisited(id,!visited()[id]);draw()}});
}
function travelMedia(query){
 if(galleryCache[query])return Promise.resolve(galleryCache[query]);
 var params=new URLSearchParams({action:"query",generator:"search",gsrsearch:query,gsrnamespace:"6",gsrlimit:"12",prop:"imageinfo",iiprop:"url|mime|size",iiurlwidth:"1200",format:"json",origin:"*"});
 return fetch("https://commons.wikimedia.org/w/api.php?"+params.toString()).then(function(response){
  if(!response.ok)throw Error("Görseller alınamadı");return response.json()
 }).then(function(res){
  var pages=res&&res.query&&res.query.pages||{};
  return Object.keys(pages).map(function(k){
   var p=pages[k],info=p.imageinfo&&p.imageinfo[0];
   if(!info||!/image\/(jpeg|png|webp)/.test(info.mime||"")||Number(info.width||0)<500||/logo|map|flag|diagram/i.test(p.title||""))return null;
   var url=info.thumburl||info.url||"";
   return /^https:\/\//.test(url)?{src:url,credit:info.descriptionurl||"",label:p.title.replace(/^File:/,"")}:null
  }).filter(Boolean).slice(0,6)
 }).catch(function(){return []}).then(function(result){galleryCache[query]=result;return result})
}
function paintDetailsPhotos(images){
 var box=$("grTravelPhoto"),thumbs=$("grTravelThumbs"),count=$("grTravelPhotoCount");if(!box||!thumbs||!count)return;
 if(!images.length){box.innerHTML='<div class="gr-travel-empty">Bu konum için uygun fotoğraf bulunamadı.</div>';count.textContent="";return}
 var current=0;
 function paint(){
  var x=images[current];
  box.innerHTML='<img src="'+esc(x.src)+'" alt="'+esc(x.label)+'" loading="lazy">'+(x.credit?'<a href="'+esc(x.credit)+'" target="_blank" rel="noopener noreferrer" class="gr-travel-credit">Fotoğraf kaynağı ve lisans</a>':'');
  count.textContent=(current+1)+" / "+images.length+" fotoğraf";
  thumbs.querySelectorAll("button").forEach(function(b,i){b.classList.toggle("active",i===current)})
 }
 thumbs.innerHTML=images.map(function(x,i){return '<button type="button" data-travel-photo="'+i+'"><img loading="lazy" src="'+esc(x.src)+'" alt="'+esc(x.label)+'"></button>'}).join("");
 thumbs.querySelectorAll("button").forEach(function(b){b.onclick=function(){current=Number(b.dataset.travelPhoto);paint()}});
 paint()
}
function closeDetails(){
 var overlay=$("grTravelDetail");if(overlay)overlay.remove();
 document.body.style.overflow=""
}
function openDetails(id){
 var x=data.find(function(item){return item.id===id});if(!x)return;
 closeDetails();
 var dialog=document.createElement("div");dialog.id="grTravelDetail";dialog.className="gr-travel-detail";
 dialog.innerHTML='<div class="gr-travel-detail-sheet"><div class="gr-travel-detail-head"><div><small>'+esc(x.city)+' · '+esc(x.category)+'</small><b>'+esc(x.title)+'</b></div><button id="grTravelClose" aria-label="Kapat"><span class="mi">close</span></button></div>'+
  '<div id="grTravelPhoto" class="gr-travel-photo"><div class="gr-travel-empty">Bölgenin fotoğrafları aranıyor…</div></div><div id="grTravelPhotoCount" class="gr-travel-photo-count"></div><div id="grTravelThumbs" class="gr-travel-thumbs"></div>'+
  '<div class="gr-travel-detail-copy"><h3>Neler görebilirsin?</h3><p>'+esc(genericDescription(x))+'</p>'+
  '<p class="gr-travel-warning">Liste geçmiş yıllarda hazırlanmıştır. Erişim yasakları, ziyaret saatleri ve güvenlik koşulları güncel olmayabilir.</p></div>'+
  '<div class="gr-travel-detail-buttons"><button id="grTravelMap"><span class="mi">navigation</span> Navigasyonda Ara</button><button id="grTravelVisited" class="'+(visited()[x.id]?"done":"")+'">'+(visited()[x.id]?"✓ Ziyaret ettim":"○ Gittim Olarak İşaretle")+'</button></div></div>';
 document.body.appendChild(dialog);document.body.style.overflow="hidden";
 $("grTravelClose").onclick=closeDetails;
 dialog.addEventListener("click",function(e){if(e.target===dialog)closeDetails()});
 $("grTravelVisited").onclick=function(){updateVisited(x.id,!visited()[x.id]);draw();this.textContent=visited()[x.id]?"✓ Ziyaret ettim":"○ Gittim Olarak İşaretle";this.classList.toggle("done",!!visited()[x.id])};
 $("grTravelMap").onclick=function(){
  closeDetails();
  var tab=document.querySelector('.navBtn[data-page="navigation"]');
  if(tab)tab.click();
  setTimeout(function(){
   var input=$("navDestination");if(!input)return;
   input.value=x.title+", "+x.city;input.focus();
   input.dispatchEvent(new Event("input",{bubbles:true}))
  },180)
 };
 travelMedia(x.search).then(function(images){if($("grTravelDetail")===dialog)paintDetailsPhotos(images)})
}
function openCatalogue(){
 var nav=document.querySelector('.navBtn[data-page="discover"]');
 if(nav)nav.click();
 document.body.classList.add("gr-travel-active");
 var chip=$("grTravelTab");if(chip)chip.classList.add("active");
 if($("grTravelCatalogue"))$("grTravelCatalogue").scrollIntoView({block:"start",behavior:"smooth"})
}
function categoryForText(text){
 var t=String(text).toLocaleLowerCase("tr-TR");
 if(/şelale|yayla|vadi|göl|dağ|kanyon|orman|mağara|nehir|tabiat|rafting/.test(t))return "Doğa";
 if(/antik|müze|kale|tapınak|türbe|kilise|manastır|höyük|köprü|ören|mezar|saray/.test(t))return "Tarih";
 if(/plaj|koy|deniz|sahil|dalış|ada|yüz/.test(t))return "Deniz";
 if(/festival|şenlik|kutla|maraton|konser/.test(t))return "Etkinlik";
 if(/kahve|kahvaltı|tat|gurme|kebap/.test(t))return "Lezzet";
 return "Keşif"
}
function parseGuideSource(text){
 var provinces="Adana|Adıyaman|Afyonkarahisar|Ağrı|Aksaray|Amasya|Ankara|Antalya|Ardahan|Artvin|Aydın|Balıkesir|Bartın|Batman|Bayburt|Bilecik|Bingöl|Bitlis|Bolu|Burdur|Bursa|Çanakkale|Çankırı|Çorum|Denizli|Diyarbakır|Düzce|Edirne|Elazığ|Erzincan|Erzurum|Eskişehir|Gaziantep|Giresun|Gümüşhane|Hakkari|Hatay|Iğdır|Isparta|İstanbul|İzmir|Kahramanmaraş|Karabük|Karaman|Kars|Kastamonu|Kayseri|Kırıkkale|Kırklareli|Kırşehir|Kilis|Kocaeli|Konya|Kütahya|Malatya|Manisa|Mardin|Mersin|Muğla|Muş|Nevşehir|Niğde|Ordu|Osmaniye|Rize|Sakarya|Samsun|Siirt|Sinop|Sivas|Şanlıurfa|Şırnak|Tekirdağ|Tokat|Trabzon|Tunceli|Uşak|Van|Yalova|Yozgat|Zonguldak".split("|");
 var names={};provinces.forEach(function(p){names[p]=1});
 if(/<html|<article|<p\b/i.test(text)){
  try{
   var dom=new DOMParser().parseFromString(text.replace(/<br\s*\/?>/gi,"\n").replace(/<\/(?:p|div|li)>/gi,"\n"),"text/html");
   var main=dom.querySelector("article")||dom.querySelector("main")||dom.body;
   text=main&&main.textContent||text
  }catch(e){}
 }
 var lines=text.split(/\r?\n/),raw=[],seenStart=false;
 for(var i=0;i<lines.length;i++){
  var line=lines[i].replace(/\s+/g," ").trim().replace(/^#+\s*/,""),m=line.match(/^(\d{1,4})\s+(.{4,})$/);
  if(!m)continue;
  var num=Number(m[1]),body=m[2];
  if(num<1||num>1021)continue;
  var part=body.split(/[\s\-–]/)[0],city=part==="Şanliurfa"?"Şanlıurfa":part.indexOf("Uludağ")===0?"Bursa":part;
  if(!names[city]){for(var n=0;n<provinces.length;n++){var p=provinces[n];if(part.indexOf(p)===0&&/[\u0027’‘\-]/.test(part.charAt(p.length))){city=p;break}}}
  if(!names[city])continue;
  raw.push({sourceNumber:num,city:city,body:body});
  seenStart=true
 }
 var rows=raw.map(function(x,i){
  var title=x.body.replace(new RegExp("^"+x.city+"(?:(?:[\\u0027’‘][A-Za-zçğıöşüÇĞİÖŞÜ]+)|\\s*[-–])?\\s*"),"").trim()||x.body;
  return {id:i+1,sourceNumber:x.sourceNumber,city:x.city,title:title,category:categoryForText(title),search:title+" "+x.city+" Türkiye"}
 });
 if(rows.length<1000)throw new Error("Uzaktaki gezi kaynağı eksik: "+rows.length+" kayıt");
 return {cities:provinces,items:rows}
}
function remoteCatalogue(){
 var cacheKey="gazon_destinations_cache_20261009",old=null;
 try{old=JSON.parse(localStorage.getItem(cacheKey)||"null")}catch(e){}
 if(old&&Array.isArray(old.items)&&old.items.length>=1000)return Promise.resolve(old);
 var src="https://www.turkishnews.com/2021/07/05/1001-turkiye/";
 var proxies=[
  "https://r.jina.ai/"+src,
  "https://api.allorigins.win/raw?url="+encodeURIComponent(src)
 ];
 function attempt(index){
  if(index>=proxies.length)return Promise.reject(new Error("1021 gezi noktası kaynağı şu anda erişilemiyor"));
  var controller=typeof AbortController==="function"?new AbortController():null;
  var timeout=controller?setTimeout(function(){controller.abort()},8500):null;
  return fetch(proxies[index],controller?{signal:controller.signal}:{}).then(function(r){if(!r.ok)throw Error("Proxy "+r.status);return r.text()})
   .then(parseGuideSource).catch(function(){return attempt(index+1)}).finally(function(){if(timeout)clearTimeout(timeout)})
 }
 return attempt(0).then(function(catalog){try{localStorage.setItem(cacheKey,JSON.stringify(catalog))}catch(e){}return catalog})
}
function loadCatalogue(){
 return fetch("gazon-destinations.json?v=20261009-81il",{cache:"no-cache"})
 .then(function(r){if(!r.ok)throw Error("Statik liste bulunamadı");return r.json()})
 .then(function(c){if(!c.items||c.items.length<81||!Array.isArray(c.cities)||c.cities.length!==81)throw Error("Statik katalog eksik");return c})
 .catch(remoteCatalogue)
}
function install(){
 var host=$("discoverSection"),tabs=host&&host.querySelector(".discoverTabs"),grid=document.querySelector(".homeMenuGrid");
 if(!host||!tabs||!grid){setTimeout(install,250);return}
 if($("grTravelCatalogue"))return;
 var button=document.createElement("button");
 button.className="homeMenuBtn";button.id="homeTravelCatalogue";
 button.innerHTML='<span class="mi">travel_explore</span><div><b>81 İlde Keşif</b><small>Türkiye gezi listesi ve fotoğraf rehberi.</small></div>';
 grid.appendChild(button);button.onclick=openCatalogue;
 var chip=document.createElement("button");chip.type="button";chip.id="grTravelTab";chip.className="chip";chip.textContent="81 İl Gezi Rehberi";
 tabs.appendChild(chip);chip.onclick=openCatalogue;
 tabs.querySelectorAll(".chip[data-discover]").forEach(function(c){c.addEventListener("click",function(){document.body.classList.remove("gr-travel-active");chip.classList.remove("active")})});
 var root=document.createElement("section");root.id="grTravelCatalogue";root.className="gr-travel-catalogue";
 root.innerHTML='<div class="gr-travel-head"><b>81 İlde Görülecek Yerler</b><small>Türkiye gezi ve deneyim rehberi</small></div>'+
  '<div class="gr-travel-searchbar"><input id="grTravelSearch" type="search" placeholder="Şehir, yer veya etkinlik ara…" autocomplete="off"><select id="grTravelCity"><option value="">Tüm iller</option></select></div>'+
  '<div id="grTravelCategories" class="gr-travel-filters"></div><div id="grTravelCount" class="gr-travel-count">Liste yükleniyor…</div><div id="grTravelItems" class="gr-travel-items"></div>'+
  '<div class="gr-travel-pagination"><button id="grTravelBack">Önceki</button><span id="grTravelPage">1 / 1</span><button id="grTravelNext">Sonraki</button></div>'+
  '<p class="gr-travel-source">Kullanıcının paylaştığı Türkiye gezi listesinden düzenlenmiştir. Ziyaret bilgileri bağımsız olarak doğrulanmalıdır.</p>';
 host.appendChild(root);
 $("grTravelSearch").oninput=function(){searchText=this.value.trim();page=0;draw()};
 $("grTravelCity").onchange=function(){selectedCity=this.value;page=0;draw()};
 $("grTravelBack").onclick=function(){page=Math.max(0,page-1);draw()};
 $("grTravelNext").onclick=function(){page++;draw()};
 loadCatalogue().then(function(result){
  var a=result&&result.items||[];
  if(!Array.isArray(a)||a.length<81)throw Error("Liste doğrulaması başarısız");
  data=a;cities=Array.isArray(result.cities)?result.cities:[];cataloguePartial=result.status==="partial"||a.length<1000;
  $("grTravelCity").innerHTML='<option value="">Tüm iller</option>'+cities.map(function(city){return '<option value="'+esc(city)+'">'+esc(city)+'</option>'}).join("");
  $("grTravelCategories").innerHTML=["Tümü","Doğa","Tarih","Deniz","Etkinlik","Lezzet","Keşif"].map(function(c){return '<button type="button" data-travel-category="'+esc(c)+'" class="'+(c==="Tümü"?"active":"")+'">'+esc(c)+'</button>'}).join("");
  $("grTravelCategories").querySelectorAll("button").forEach(function(b){b.onclick=function(){selectedCategory=b.dataset.travelCategory;page=0;root.querySelectorAll("[data-travel-category]").forEach(function(n){n.classList.toggle("active",n===b)});draw()}});
  root.dataset.ready="1";draw();
  if(cataloguePartial){
   remoteCatalogue().then(function(full){
    if(!full||!Array.isArray(full.items)||full.items.length<1000)return;
    data=full.items;cities=Array.isArray(full.cities)?full.cities:cities;cataloguePartial=false;
    $("grTravelCity").innerHTML='<option value="">Tüm iller</option>'+cities.map(function(city){return '<option value="'+esc(city)+'">'+esc(city)+'</option>'}).join("");
    if(selectedCity)$("grTravelCity").value=selectedCity;
    page=0;draw()
   }).catch(function(){ /* Keep the verified 81-city starter catalogue visible offline. */ })
  }
 }).catch(function(error){
  $("grTravelCount").textContent="Liste henüz yüklenemedi";
  $("grTravelItems").innerHTML='<div class="gr-travel-empty">'+esc(error.message)+' · Bu sırada <a href="https://www.turkishnews.com/2021/07/05/1001-turkiye/" target="_blank" rel="noopener noreferrer">gezi listesinin kaynağını açabilirsin.</a></div>'
 })
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install);else install();
window.GaZonTravelCatalogue={open:openCatalogue,closeDetails:closeDetails,count:function(){return data.length},filter:function(city){selectedCity=city||"";page=0;draw()}};
})();
