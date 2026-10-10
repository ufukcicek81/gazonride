(function(){
"use strict";
var GUIDES={
 "Aktaş Şelalesi":{
  search:"Aktaş Şelalesi Akçakoca Düzce",
  verifiedPhotosOnly:true,
  officialPhotos:"https://duzce.ktb.gov.tr/TR-236606/aktas-selalesi.html",
  heading:"Akçakoca kırsalında şelaleler ve orman yolları",
  paragraphs:[
   "Aktaş Şelalesi, Düzce'nin Akçakoca ilçesinde Aktaş Köyü yakınındadır. Resmi parkur koordinatı 41.017862, 31.041284. Navigasyonun gösterdiği son noktanın araçla ulaşılabilir yol veya otopark olduğundan emin olun.",
   "Orman Genel Müdürlüğü şelaleye ulaşan yürüyüş parkurunu yaklaşık 790 metre olarak tanımlar. Motosikleti uygun otoparka bırakıp devamını yürüyerek tamamlayın. Yağışta zemin kaygan olabilir."
  ],
  highlights:["Aktaş Şelalesi","Yaklaşık 790 m ekoturizm yürüyüş parkuru","Aktaş Köyü"]
 },
 "Yedigöller Milli Parkı · Bolu":{
  search:"Yedigöller Milli Parkı Bolu",
  verifiedPhotosOnly:true,
  heading:"Bolu ormanlarında göller, serin hava ve uzun virajlar",
  paragraphs:[
   "Yedigöller Millî Parkı, ormanların arasına yayılan göller ve mevsime göre değişen renkleriyle öne çıkar. Bölge özellikle sonbahar manzaraları ve sessiz doğa yürüyüşleri için tercih edilir.",
   "Motosikletle yaklaşım yollarında viraj ve yol yüzeyi değişken olabilir. Sisli veya yağışlı havada görüşe dikkat ederek parka ulaşınca göl çevresini yürüyerek keşfedin."
  ],
  highlights:["Millî park gölleri","Orman seyir noktaları","Sonbahar renkleri"]
 },
 "Şile · Ağva":{
  search:"Ağva Şile İstanbul",
  verifiedPhotosOnly:true,
  heading:"Karadeniz kıyısında koylar ve yeşil yollar",
  paragraphs:[
   "Şile'den Ağva'ya uzanan hat, kıyı yerleşimleri ve orman manzaralarıyla şehirden kısa bir kaçamak yapmak isteyen motosikletçiler için uygundur. Ağva çevresindeki nehir kıyıları ve sahil durakları fotoğraf için güzel bölümler oluşturur.",
   "Hafta sonu trafiği, dar köy yolları ve kıyıdaki ani hava değişimlerine hazırlıklı olun. Fotoğraf molalarını güvenli park alanlarında verin."
  ],
  highlights:["Şile sahili","Ağva nehir kıyıları","Kandıra yönünde kıyı manzaraları"]
 },
 "Kapıdağ · Erdek başlangıcı":{
  search:"Erdek Balıkesir Kapıdağ",
  verifiedPhotosOnly:true,
  heading:"Marmara'ya bakan koylar ve Kapıdağ'ın yeşil yamaçları",
  paragraphs:[
   "Kapıdağ Yarımadası çevresinde Erdek, Narlı ve kıyı köyleri arasında denize bakan virajlı yollar bulunur. Kıyıdan yükselen seyir noktaları deniz ve ormanı aynı karede görmeye elverişlidir.",
   "Sürüşü gün ışığında planlayın; dar, gölgeli veya bozuk kesimlerde hızı düşürün. Güzergâhı koy ve manzara molalarıyla birleştirmek daha keyifli bir gezi sağlar."
  ],
  highlights:["Erdek kıyısı","Narlı ve çevre koylar","Kapıdağ manzara noktaları"],
  extraPhotos:["Erdek Gulf.jpg","Sunset in Erdek.jpg","Erdek körfezi edincik.jpg"]
 },
 "Uçmakdere (Şarköy)":{
  search:"Uçmakdere Şarköy Tekirdağ",
  verifiedPhotosOnly:true,
  heading:"Marmara kıyısında yüksek yamaçlardan denize inen virajlar",
  paragraphs:[
   "Uçmakdere–Şarköy hattında yamaçlar ile deniz arasındaki manzaralı yol, viraj severlerin ilgisini çeker. Özellikle açık havada kıyı boyunca farklı yüksekliklerden geniş Marmara manzaraları izlenebilir.",
   "Rüzgâr bazı kesimlerde kuvvetli olabilir. Seyir noktalarında motosikleti trafiği engellemeyen güvenli bir alana bırakın."
  ],
  highlights:["Uçmakdere seyir noktaları","Şarköy sahili","Marmara panoramaları"]
 },
 "Armutlu (Yalova)":{
  search:"Armutlu Yalova",
  verifiedPhotosOnly:true,
  heading:"Çınarcık'tan Armutlu'ya denizle orman arasında",
  paragraphs:[
   "Yalova kıyısından Çınarcık ve Armutlu yönüne ilerleyen güzergâh Marmara'nın küçük koylarını, kıyı yerleşimlerini ve orman dokusunu bir arada sunar.",
   "Özellikle tatil dönemlerinde trafik yoğunlaşabilir. Kıyıdaki manzaralı molaları güneşin konumuna göre seçmek fotoğraflar için avantaj sağlar."
  ],
  highlights:["Çınarcık kıyısı","Armutlu","Sahil ve orman manzaraları"]
 },
 "İğneada (Demirköy)":{
  search:"İğneada Demirköy Kırklareli",
  verifiedPhotosOnly:true,
  heading:"Trakya ormanlarının içinden Karadeniz'e",
  paragraphs:[
   "Demirköy ve İğneada çevresinde meşe, kayın ve kıyı ormanlarıyla kaplı manzaralı yollar bulunur. İğneada çevresindeki longoz ormanları ve Karadeniz kıyısı doğa sevenler için mola seçenekleri sunar.",
   "Yağışlı mevsimde yaprakla kaplı yol yüzeyinde dikkatli olun. Korunan doğal alanlarda yürüyüş güzergâhlarına ve yerel kurallara uyun."
  ],
  highlights:["Demirköy yolu","İğneada sahili","Longoz ormanları çevresi"]
 },
 "Şavşat (Artvin)":{
  search:"Şavşat Artvin Karagöl",
  verifiedPhotosOnly:true,
  heading:"Doğu Karadeniz'den yüksek yaylalara uzanan dağ yolları",
  paragraphs:[
   "Şavşat ve çevresindeki yaylalar, ormanlar ve dağ manzaraları bu rotanın temel çekiciliğidir. Artvin–Ardahan hattı uzun sürüşler, serin rakımlar ve etkileyici fotoğraf molaları arayan sürücülere hitap eder.",
   "Yüksek kesimlerde hava çok hızlı değişebilir; yakıt, yağış ekipmanı ve gün ışığı planlaması önemlidir. Kapalı veya bakımda olan kesimleri yola çıkmadan kontrol edin."
  ],
  highlights:["Şavşat çevresi","Yayla manzaraları","Dağ geçitleri"]
 }
};
var cache={};
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function getPhotoFromCss(el){
 var bg=el&&el.style&&el.style.backgroundImage||"";
 var match=bg.match(/url\(["']?([^"')]+)["']?\)/);
 return match?match[1]:""
}
function commonsFile(file){
 return "https://commons.wikimedia.org/wiki/Special:FilePath/"+encodeURIComponent(file)+"?width=1200";
}
function commonsCredit(file){return "https://commons.wikimedia.org/wiki/File:"+encodeURIComponent(file.replace(/ /g,"_"))}
function coverCredit(url){
 var match=url.match(/Special:FilePath\/([^?]+)/);
 if(!match)return "";
 try{return commonsCredit(decodeURIComponent(match[1]))}catch(e){return ""}
}
function normalizePhoto(photo){
 var u=String(photo&&photo.src||"");
 return /^https:\/\//.test(u)?photo:null
}
function galleryPhotos(place,cover){
 // Avoid showing unrelated Akçakoca harbour photos as the waterfall.
 // Curated cards show only explicitly selected regional photos. Never mix in
 // unverified Wikimedia keyword search results (which may depict another town).
 if(place.verifiedPhotosOnly) return Promise.resolve(cover && !place.officialPhotos
   ? [{src:cover,credit:coverCredit(cover),name:place.search,license:"Wikimedia Commons · Bölge görüntüsü"}]
   : []);
 var lookup=place.search;
 if(cache[lookup])return Promise.resolve(cache[lookup]);
 var initial=[];
 if(cover)initial.push({src:cover,credit:coverCredit(cover),name:lookup,license:"Wikimedia Commons"});
 (place.extraPhotos||[]).forEach(function(filename){
  initial.push({src:commonsFile(filename),credit:commonsCredit(filename),name:filename,license:"Wikimedia Commons"})
 });
 var params=new URLSearchParams({
  action:"query",generator:"search",gsrsearch:lookup,gsrnamespace:"6",gsrlimit:"15",
  prop:"imageinfo",iiprop:"url|mime|size|extmetadata",iiurlwidth:"1200",
  format:"json",origin:"*"
 });
 return fetch("https://commons.wikimedia.org/w/api.php?"+params.toString())
  .then(function(response){if(!response.ok)throw new Error("Resim araması alınamadı");return response.json()})
  .then(function(data){
   var pages=data&&data.query&&data.query.pages||{};
   return Object.keys(pages).map(function(key){
    var p=pages[key],info=p.imageinfo&&p.imageinfo[0];
    if(!info||!/image\/(jpeg|png|webp)/.test(info.mime||"")||Number(info.width||0)<700)return null;
    if(/(?:map|logo|flag|icon|coat of arms|diagram)/i.test(p.title||""))return null;
    return normalizePhoto({src:info.thumburl||info.url,credit:info.descriptionurl||"",name:p.title.replace(/^File:/,""),license:info.extmetadata&&info.extmetadata.LicenseShortName&&info.extmetadata.LicenseShortName.value||"Wikimedia Commons"})
   }).filter(Boolean)
  }).catch(function(){return []}).then(function(additions){
   var used={},result=initial.concat(additions).filter(function(photo){
    if(!normalizePhoto(photo))return false;
    var key=photo.name.toLocaleLowerCase("tr-TR").replace(/[^a-z0-9ğüşıöç]/g,"");
    if(used[key])return false;used[key]=1;return true
   }).slice(0,7);
   cache[lookup]=result;return result
  })
}
function renderGallery(item,title,officialPhotos){
 var hero=document.getElementById("grGuideHero"),strip=document.getElementById("grGuideThumbs"),counter=document.getElementById("grGuideCount");
 if(!hero||!strip||!counter)return;
 var list=item;if(!list.length){
  hero.innerHTML='<div class="gr-guide-placeholder">Bu noktanın doğrulanmamış bölge fotoğrafı gösterilmiyor.'+(officialPhotos?' <a href="'+esc(officialPhotos)+'" target="_blank" rel="noopener noreferrer">Şelalenin resmî fotoğraflarını aç</a>.':'')+'</div>';
  strip.innerHTML="";
  counter.textContent="Doğrulanmış fotoğraf yok";return
 }
 var selected=0;
 function paint(){
  var v=list[selected];
  hero.innerHTML='<img loading="lazy" src="'+esc(v.src)+'" alt="'+esc(title)+'">'+(v.credit?'<a href="'+esc(v.credit)+'" target="_blank" rel="noopener noreferrer" class="gr-guide-credit">Fotoğraf kaynağı ve lisansı <span class="mi">open_in_new</span></a>':'');
  counter.textContent=(selected+1)+" / "+list.length+" fotoğraf · "+v.license;
  strip.querySelectorAll("button").forEach(function(b,i){b.classList.toggle("active",i===selected)})
 }
 strip.innerHTML=list.map(function(v,i){return '<button type="button" data-gr-guide-photo="'+i+'" title="Fotoğraf '+(i+1)+'"><img loading="lazy" src="'+esc(v.src)+'" alt="'+esc(v.name)+'"></button>'}).join("");
 strip.querySelectorAll("button").forEach(function(b){b.onclick=function(){selected=Number(b.dataset.grGuidePhoto);paint()}});
 paint()
}
function closeGuide(){
 var overlay=document.getElementById("grGuideOverlay");
 if(overlay){overlay.remove();document.body.style.overflow=""}
}
function showGuide(tile){
 var title=tile.querySelector(".gr-route-title")&&tile.querySelector(".gr-route-title").textContent.trim();
 var guide=title&&GUIDES[title];if(!guide)return;
 closeGuide();
 var overlay=document.createElement("div");overlay.id="grGuideOverlay";overlay.className="gr-guide-overlay";
 var full='<div class="gr-guide-sheet"><div class="gr-guide-head"><div><small>GAZONRIDE · BÖLGE REHBERİ</small><b>'+esc(title)+'</b></div><button id="grGuideClose" aria-label="Kapat"><span class="mi">close</span></button></div>'+
  '<div class="gr-guide-hero" id="grGuideHero"><div class="gr-guide-placeholder">Bölge fotoğrafları yükleniyor…</div></div><div class="gr-guide-counter" id="grGuideCount">Fotoğraflar</div><div class="gr-guide-thumbs" id="grGuideThumbs"></div>'+
  '<div class="gr-guide-copy"><h3>'+esc(guide.heading)+'</h3>'+guide.paragraphs.map(function(p){return '<p>'+esc(p)+'</p>'}).join("")+'<h4>Gezilecek duraklar</h4><ul>'+guide.highlights.map(function(p){return '<li>'+esc(p)+'</li>'}).join("")+'</ul>'+
  '<p class="gr-guide-note">Yol ve ziyaret koşulları değişebilir. Çıkmadan önce güncel bilgileri kontrol et.</p></div>'+
  '<div class="gr-guide-actions"><button id="grGuideNav"><span class="mi">navigation</span> Navigasyonu Aç</button><button id="grGuideDone">Kapat</button></div></div>';
 overlay.innerHTML=full;document.body.appendChild(overlay);document.body.style.overflow="hidden";
 document.getElementById("grGuideClose").onclick=closeGuide;
 document.getElementById("grGuideDone").onclick=closeGuide;
 overlay.addEventListener("click",function(e){if(e.target===overlay)closeGuide()});
 document.getElementById("grGuideNav").onclick=function(){
  closeGuide();var navigate=tile.querySelector("[data-route-open]");if(navigate)navigate.click()
 };
 var cover=getPhotoFromCss(tile.querySelector(".gr-route-visual"));
 galleryPhotos(guide,cover).then(function(images){if(document.getElementById("grGuideOverlay")===overlay)renderGallery(images,title,guide.officialPhotos)})
}
function decorate(){
 var root=document.getElementById("grRouteHubList");if(!root)return;
 Array.prototype.forEach.call(root.querySelectorAll(".gr-route-tile[data-kind='gazon']"),function(tile){
  if(tile.dataset.grGuideReady)return;
  var title=tile.querySelector(".gr-route-title")&&tile.querySelector(".gr-route-title").textContent.trim();
  if(!GUIDES[title])return;
  tile.dataset.grGuideReady="1";
  tile.tabIndex=0;tile.setAttribute("role","button");tile.setAttribute("aria-label",title+" fotoğrafları ve bölge rehberi");
  var visual=tile.querySelector(".gr-route-visual");
  if(visual){
   visual.setAttribute("title","Fotoğraf galerisi ve bölge rehberini aç");
   var body=tile.querySelector(".gr-route-tile-body");
   if(body){
    var note=document.createElement("div");
    note.className="gr-gallery-hint";
    note.innerHTML='<span class="mi" aria-hidden="true">photo_library</span><span>Fotoğraflar ve bölge rehberi <span class="mi" aria-hidden="true">chevron_right</span></span>';
    body.insertBefore(note,body.firstChild);
   }
  }
  tile.addEventListener("click",function(e){if(e.target.closest("button,a,input"))return;showGuide(tile)});
  tile.addEventListener("keydown",function(e){if(e.target!==tile)return;if(e.key==="Enter"||e.key===" "){e.preventDefault();showGuide(tile)}})
 })
}
function install(){
 var hub=document.getElementById("grRouteHubList");
 if(!hub){setTimeout(install,300);return}
 decorate();
 new MutationObserver(function(){decorate()}).observe(hub,{childList:true})
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install);else install();
window.GaZonRideGuides={openByTitle:function(title){
 var tiles=document.querySelectorAll("#grRouteHubList .gr-route-tile");
 for(var i=0;i<tiles.length;i++){var el=tiles[i].querySelector(".gr-route-title");if(el&&el.textContent.trim()===title){showGuide(tiles[i]);return true}}
 return false
},count:Object.keys(GUIDES).length};
})();
