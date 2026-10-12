#!/usr/bin/env node
"use strict";
// Adds a photo and verified coordinates to every 81-province destination.
// Runs in GitHub Actions (needs internet): node scripts/enrich-destinations.js
//
// For each item (uses item.place, the plain place name):
//  1. Turkish Wikipedia search "<place> <city>" -> first pages with coordinates
//     and a lead image.
//  2. A candidate is accepted only if OpenStreetMap (Nominatim) reverse
//     geocoding puts its coordinates inside the item's province.
//  3. Without a Wikipedia match, Nominatim search "<place>, <city>" is tried,
//     again accepted only inside the province.
//  4. Photo: Wikipedia lead image of the accepted page, otherwise the first
//     suitable Wikimedia Commons search result for the place.
// Writes gazon-destinations.json and docs/destinations-check.md.
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const FILE = path.join(ROOT, "gazon-destinations.json");
const REPORT = path.join(ROOT, "docs", "destinations-check.md");
const UA = "GaZonRide-data-check/1.0 (+https://github.com/ufukcicek81/gazonride)";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => String(s || "").toLocaleLowerCase("tr-TR").replace(/\s+(ili|province)$/i, "").replace(/[^a-zçğıöşü]/g, "");

async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "tr" } });
      if (r.ok) return await r.json();
      if (r.status === 429) await sleep(5000);
    } catch (e) { /* retry */ }
    await sleep(1500 * (i + 1));
  }
  return null;
}

// Nominatim allows 1 request per second.
let lastOsm = 0;
async function osm(url) {
  const wait = lastOsm + 1100 - Date.now();
  if (wait > 0) await sleep(wait);
  lastOsm = Date.now();
  return getJson(url);
}
const provCache = new Map();
async function provinceAt(lat, lng) {
  const key = lat.toFixed(4) + "," + lng.toFixed(4);
  if (provCache.has(key)) return provCache.get(key);
  const j = await osm(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=8&addressdetails=1&lat=${lat}&lon=${lng}`);
  const a = (j && j.address) || {};
  const out = { province: a.province || a.city || a.state || "", names: addressNames(a), country: a.country_code || "" };
  provCache.set(key, out);
  return out;
}
// Metropolitan provinces often come back as city=... with no province key,
// so any administrative name of the address may carry the province.
function addressNames(a) {
  return ["province", "city", "state", "county", "state_district", "region"].map(k => a && a[k]).filter(Boolean);
}
function sameProvince(found, city) {
  const c = norm(city);
  const names = (found.names && found.names.length ? found.names : [found.province]).map(norm).filter(Boolean);
  return found.country === "tr" && names.some(f => f === c);
}

// The matched page/place must carry the destination's own name: generic
// words ("Gölü", "Antik Kenti", "Milli Parkı") alone are not enough, or the
// province article or another park in the province would be accepted.
const GENERIC = new Set(("antik kenti kent kenti gölü göl dağı dağları dağ milli millî parkı park tabiat mağarası mağaraları " +
  "şelalesi şelaleleri kanyonu kanyon yaylası yayla müzesi müze kalesi kale köprüsü köprü vadisi vadi türbesi camii camisi " +
  "manastırı kilisesi sarayı höyüğü höyük adası ada yarımadası koyu plajı tepesi geçidi boğazı harabeleri ören yeri açık hava " +
  "longozu ormanları tüneli medresesi hamamı roma mezarları kaya sütunları bazalt peri bacaları tuz çayı il ili merkez").split(" "));
const fold = s => String(s || "").replace(/I/g, "ı").replace(/İ/g, "i").toLocaleLowerCase("tr-TR");
// Feature types: a candidate whose name adds a different type ("Müzesi",
// "Barajı", "Üniversitesi", "Dağları" for a valley) is another place.
const TYPES = ["şelal", "mağar", "kanyo", "göl", "dağ", "vadi", "kale", "köprü", "plaj", "koy", "tepe", "geçi", "boğaz",
  "longo", "tünel", "medre", "hamam", "türbe", "cami", "manas", "kilis", "saray", "müze", "baraj", "ünive", "spor",
  "salon", "stady", "kayak", "merke", "okul", "lise", "hasta", "istas", "havaa", "belediy", "saldır", "seçim"];
const wordsOf = s => fold(s).match(/[a-zçğıöşüâî0-9]+/g) || [];
const typesOf = s => new Set(wordsOf(s).flatMap(w => TYPES.filter(t => w.startsWith(t))));
function namesMatch(place, name, city) {
  if (/\((il|ilçe)\)/i.test(name)) return false;
  const cityWords = new Set(wordsOf(city)), words = wordsOf(place), title = wordsOf(name);
  const has = k => title.some(w => w.startsWith(k));
  const key = words.filter(w => w.length > 2 && !GENERIC.has(w) && !cityWords.has(w)).map(w => w.slice(0, Math.min(5, w.length)));
  // Only the city + generic words ("Kars Kalesi"): every word must appear.
  const nameOk = key.length ? key.some(has) : words.every(w => has(w.slice(0, Math.min(5, w.length))));
  if (!nameOk) return false;
  const pt = typesOf(place), tt = typesOf(name);
  for (const t of tt) if (!pt.has(t)) return false;
  if (pt.size && !tt.size) return false; // bare town name for a waterfall/cave/valley…
  return true;
}
async function wikiExact(place) {
  const q = new URLSearchParams({ action: "query", format: "json", titles: place, redirects: "1",
    prop: "coordinates|pageimages|info|pageprops", ppprop: "wikibase_item", inprop: "url", pithumbsize: "800", origin: "*" });
  const j = await getJson("https://tr.wikipedia.org/w/api.php?" + q);
  return Object.values((j && j.query && j.query.pages) || {}).filter(p => !p.missing && p.pageid).map(p => ({
    title: p.title, url: p.fullurl,
    lat: p.coordinates && p.coordinates[0] && p.coordinates[0].lat,
    lng: p.coordinates && p.coordinates[0] && p.coordinates[0].lon,
    image: p.thumbnail && p.thumbnail.source,
    qid: p.pageprops && p.pageprops.wikibase_item
  }));
}
async function wikiCandidates(place, city) {
  const q = new URLSearchParams({
    action: "query", format: "json", generator: "search", gsrsearch: `${place} ${city}`, gsrlimit: "6",
    prop: "coordinates|pageimages|info|pageprops", ppprop: "wikibase_item", inprop: "url", pithumbsize: "800", colimit: "max", origin: "*"
  });
  const j = await getJson("https://tr.wikipedia.org/w/api.php?" + q);
  const pages = Object.values((j && j.query && j.query.pages) || {}).sort((a, b) => a.index - b.index);
  return pages.map(p => ({
    title: p.title, url: p.fullurl,
    lat: p.coordinates && p.coordinates[0] && p.coordinates[0].lat,
    lng: p.coordinates && p.coordinates[0] && p.coordinates[0].lon,
    image: p.thumbnail && p.thumbnail.source,
    qid: p.pageprops && p.pageprops.wikibase_item
  }));
}
// Many Turkish articles have no coordinates; their Wikidata item often does.
async function fillFromWikidata(cands) {
  const need = cands.filter(c => c.qid && (!Number.isFinite(c.lat) || !c.image));
  if (!need.length) return;
  const ids = [...new Set(need.map(c => c.qid))].slice(0, 50).join("|");
  const j = await getJson("https://www.wikidata.org/w/api.php?" + new URLSearchParams({ action: "wbgetentities", ids, props: "claims", format: "json", origin: "*" }));
  const ents = (j && j.entities) || {};
  for (const c of need) {
    const cl = ents[c.qid] && ents[c.qid].claims || {};
    const co = cl.P625 && cl.P625[0] && cl.P625[0].mainsnak.datavalue && cl.P625[0].mainsnak.datavalue.value;
    if (co && !Number.isFinite(c.lat)) { c.lat = co.latitude; c.lng = co.longitude; c.coordSource = "wikidata"; }
    const im = cl.P18 && cl.P18[0] && cl.P18[0].mainsnak.datavalue && cl.P18[0].mainsnak.datavalue.value;
    if (im && !c.image) c.image = "https://commons.wikimedia.org/wiki/Special:FilePath/" + encodeURIComponent(im) + "?width=800";
  }
}
async function commonsImage(place, city) {
  const q = new URLSearchParams({
    action: "query", format: "json", generator: "search", gsrsearch: `${place} ${city}`, gsrnamespace: "6", gsrlimit: "10",
    prop: "imageinfo", iiprop: "url|mime|size", iiurlwidth: "800", origin: "*"
  });
  const j = await getJson("https://commons.wikimedia.org/w/api.php?" + q);
  const pages = Object.values((j && j.query && j.query.pages) || {}).sort((a, b) => a.index - b.index);
  for (const p of pages) {
    const i = p.imageinfo && p.imageinfo[0];
    if (!i || !/image\/(jpeg|png|webp)/.test(i.mime || "") || Number(i.width || 0) < 600) continue;
    if (/logo|map|harita|flag|bayrak|diagram|plan|seal|coat/i.test(p.title)) continue;
    return { image: i.thumburl || i.url, credit: i.descriptionurl || "" };
  }
  return null;
}
async function osmSearch(place, city) {
  const q = new URLSearchParams({ format: "jsonv2", q: `${place}, ${city}, Türkiye`, countrycodes: "tr", limit: "3", addressdetails: "1" });
  const j = await osm("https://nominatim.openstreetmap.org/search?" + q);
  return (Array.isArray(j) ? j : []).map(r => ({ lat: Number(r.lat), lng: Number(r.lon), name: r.display_name,
    province: (r.address && (r.address.province || r.address.city || r.address.state)) || "", names: addressNames(r.address) }));
}

async function enrich(item) {
  const place = item.place || item.title, city = item.city, out = { status: "unverified" };
  const all = (await wikiExact(place)).concat(await wikiCandidates(place, city));
  const cands = all.filter(c => namesMatch(place, c.title, city));
  await fillFromWikidata(cands);
  const why = [];
  for (const c of cands) {
    if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) { why.push(c.title + ": koordinat yok"); continue; }
    const pv = await provinceAt(c.lat, c.lng);
    if (!sameProvince(pv, city)) why.push(c.title + ": " + (pv.province || "?") + " ilinde");
    if (sameProvince(pv, city)) {
      Object.assign(out, { lat: +c.lat.toFixed(6), lng: +c.lng.toFixed(6), wiki: c.url, wikiTitle: c.title, status: "verified", source: "wikipedia+osm" });
      if (c.image) Object.assign(out, { image: c.image, imageCredit: c.url });
      break;
    }
  }
  if (out.status !== "verified") {
    for (const r of await osmSearch(place, city)) {
      if (sameProvince({ province: r.province, names: r.names, country: "tr" }, city) && namesMatch(place, String(r.name).split(",")[0], city)) {
        Object.assign(out, { lat: +r.lat.toFixed(6), lng: +r.lng.toFixed(6), status: "geocoded", source: "osm", osmName: r.name });
        break;
      }
    }
  }
  if (!out.image) {
    // A lead image of a page in the same province is still a good photo.
    const sameTitle = cands.find(c => c.image && (out.wikiTitle ? c.title === out.wikiTitle : false));
    if (sameTitle) Object.assign(out, { image: sameTitle.image, imageCredit: sameTitle.url });
    else {
      const ci = await commonsImage(place, city);
      if (ci) Object.assign(out, { image: ci.image, imageCredit: ci.credit, imageSource: "commons-search" });
    }
  }
  if (out.status === "unverified") out.why = (why.length ? why : [all.length ? "ad eşleşmedi: " + all.slice(0, 3).map(c => c.title).join(" / ") : "Wikipedia sonucu yok"]).join("; ").slice(0, 160);
  return out;
}

(async () => {
  const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
  const only = process.argv[2] ? new Set(process.argv[2].split(",").map(Number)) : null;
  const rows = [];
  for (const item of data.items) {
    if (only && !only.has(item.id)) continue;
    const e = await enrich(item);
    for (const k of ["lat", "lng", "image", "imageCredit", "imageSource", "wiki", "wikiTitle", "check"]) delete item[k];
    if (e.lat != null) { item.lat = e.lat; item.lng = e.lng; }
    if (e.image) { item.image = e.image; item.imageCredit = e.imageCredit; if (e.imageSource) item.imageSource = e.imageSource; }
    if (e.wiki) { item.wiki = e.wiki; item.wikiTitle = e.wikiTitle; }
    item.check = e.status;
    rows.push(`| ${item.id} | ${item.city} | ${item.place} | ${e.status} | ${e.wikiTitle || e.osmName || e.why || ""} | ${e.lat != null ? e.lat + ", " + e.lng : "—"} | ${e.image ? (e.imageSource ? "commons" : "wiki") : "yok"} |`);
    console.log(item.id, item.city, item.place, "→", e.status, e.wikiTitle || e.osmName || "", e.image ? "📷" : "");
  }
  data.checkedAt = new Date().toISOString();
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + "\n");
  const count = s => data.items.filter(x => x.check === s).length;
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, [
    "# 81 il önerileri · konum ve fotoğraf kontrolü", "",
    `Kontrol: ${data.checkedAt}`, "",
    `- verified (Wikipedia koordinatı, OSM ile ilin içinde): ${count("verified")}`,
    `- geocoded (OSM araması, ilin içinde): ${count("geocoded")}`,
    `- unverified (konum bulunamadı, uygulama isimle arar): ${count("unverified")}`,
    `- fotoğraflı: ${data.items.filter(x => x.image).length} / ${data.items.length}`, "",
    "| # | İl | Yer | Durum | Eşleşen kayıt | Koordinat | Foto |", "|---|---|---|---|---|---|---|", ...rows, ""
  ].join("\n"));
  console.log(`verified ${count("verified")} · geocoded ${count("geocoded")} · unverified ${count("unverified")}`);
})().catch(e => { console.error(e); process.exit(1); });
