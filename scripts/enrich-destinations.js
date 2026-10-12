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
  const out = { province: a.province || a.state || a.city || "", country: a.country_code || "" };
  provCache.set(key, out);
  return out;
}
function sameProvince(found, city) {
  const f = norm(found.province), c = norm(city);
  return found.country === "tr" && !!f && (f === c || f.includes(c) || c.includes(f));
}

async function wikiCandidates(place, city) {
  const q = new URLSearchParams({
    action: "query", format: "json", generator: "search", gsrsearch: `${place} ${city}`, gsrlimit: "6",
    prop: "coordinates|pageimages|info", inprop: "url", pithumbsize: "800", colimit: "max", origin: "*"
  });
  const j = await getJson("https://tr.wikipedia.org/w/api.php?" + q);
  const pages = Object.values((j && j.query && j.query.pages) || {}).sort((a, b) => a.index - b.index);
  return pages.map(p => ({
    title: p.title, url: p.fullurl,
    lat: p.coordinates && p.coordinates[0] && p.coordinates[0].lat,
    lng: p.coordinates && p.coordinates[0] && p.coordinates[0].lon,
    image: p.thumbnail && p.thumbnail.source
  }));
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
    province: (r.address && (r.address.province || r.address.state || r.address.city)) || "" }));
}

async function enrich(item) {
  const place = item.place || item.title, city = item.city, out = { status: "unverified" };
  const cands = await wikiCandidates(place, city);
  for (const c of cands) {
    if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) continue;
    const pv = await provinceAt(c.lat, c.lng);
    if (sameProvince(pv, city)) {
      Object.assign(out, { lat: +c.lat.toFixed(6), lng: +c.lng.toFixed(6), wiki: c.url, wikiTitle: c.title, status: "verified", source: "wikipedia+osm" });
      if (c.image) Object.assign(out, { image: c.image, imageCredit: c.url });
      break;
    }
  }
  if (out.status !== "verified") {
    for (const r of await osmSearch(place, city)) {
      if (sameProvince({ province: r.province, country: "tr" }, city)) {
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
    rows.push(`| ${item.id} | ${item.city} | ${item.place} | ${e.status} | ${e.wikiTitle || e.osmName || ""} | ${e.lat != null ? e.lat + ", " + e.lng : "—"} | ${e.image ? (e.imageSource ? "commons" : "wiki") : "yok"} |`);
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
