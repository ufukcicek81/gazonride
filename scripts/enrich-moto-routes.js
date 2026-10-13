#!/usr/bin/env node
"use strict";
// Coordinates and photos for gazon-moto-routes.json (runs in GitHub Actions).
// - start / via / end: OpenStreetMap (Nominatim) search limited to the
//   route's country; a point is kept only if OSM puts it in that country.
// - photo: Wikipedia lead image of the route's place (tr for Türkiye,
//   en elsewhere), exact title first, else a Commons search result.
const fs = require("fs"), path = require("path");
const FILE = path.join(__dirname, "..", "gazon-moto-routes.json");
const UA = "GaZonRide-data-check/1.0 (+https://github.com/ufukcicek81/gazonride)";
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJson(url) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "tr,en" } }); if (r.ok) return await r.json(); if (r.status === 429) await sleep(5000); } catch (e) {}
    await sleep(1500 * (i + 1));
  }
  return null;
}
let lastOsm = 0;
async function osm(url) { const w = lastOsm + 1100 - Date.now(); if (w > 0) await sleep(w); lastOsm = Date.now(); return getJson(url); }
async function geocode(q, cc) {
  const p = new URLSearchParams({ format: "jsonv2", q, countrycodes: cc.toLowerCase(), limit: "1", addressdetails: "1" });
  const j = await osm("https://nominatim.openstreetmap.org/search?" + p);
  const r = Array.isArray(j) && j[0];
  if (!r || (r.address && r.address.country_code && r.address.country_code.toUpperCase() !== cc)) return null;
  return { lat: +Number(r.lat).toFixed(6), lng: +Number(r.lon).toFixed(6), name: r.display_name };
}
async function wikiImage(title, lang) {
  const base = `https://${lang}.wikipedia.org/w/api.php?`;
  const exact = await getJson(base + new URLSearchParams({ action: "query", format: "json", titles: title, redirects: "1", prop: "pageimages|info", inprop: "url", pithumbsize: "960", origin: "*" }));
  for (const p of Object.values((exact && exact.query && exact.query.pages) || {})) if (p.thumbnail) return { image: p.thumbnail.source, credit: p.fullurl, title: p.title };
  const s = await getJson(base + new URLSearchParams({ action: "query", format: "json", generator: "search", gsrsearch: title, gsrlimit: "3", prop: "pageimages|info", inprop: "url", pithumbsize: "960", origin: "*" }));
  const pages = Object.values((s && s.query && s.query.pages) || {}).sort((a, b) => a.index - b.index);
  const key = title.toLocaleLowerCase("tr-TR").split(/\s+/)[0].slice(0, 5);
  for (const p of pages) if (p.thumbnail && p.title.toLocaleLowerCase("tr-TR").includes(key)) return { image: p.thumbnail.source, credit: p.fullurl, title: p.title };
  return null;
}
async function commonsImage(q) {
  const j = await getJson("https://commons.wikimedia.org/w/api.php?" + new URLSearchParams({ action: "query", format: "json", generator: "search", gsrsearch: q, gsrnamespace: "6", gsrlimit: "8", prop: "imageinfo", iiprop: "url|mime|size", iiurlwidth: "960", origin: "*" }));
  const pages = Object.values((j && j.query && j.query.pages) || {}).sort((a, b) => a.index - b.index);
  for (const p of pages) { const i = p.imageinfo && p.imageinfo[0]; if (i && /jpeg|png|webp/.test(i.mime || "") && i.width >= 800 && !/map|harita|logo|flag|plan|diagram/i.test(p.title)) return { image: i.thumburl || i.url, credit: i.descriptionurl, title: p.title }; }
  return null;
}
(async () => {
  const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
  for (const r of data.routes) {
    const cc = r.cc || "TR";
    r.points = [];
    for (const q of [r.start, ...(r.via || []), r.end]) { const g = await geocode(q, cc); r.points.push(g ? { q, lat: g.lat, lng: g.lng } : { q }); }
    const ok = r.points.filter(p => p.lat != null).length;
    r.check = r.points[0].lat != null && r.points[r.points.length - 1].lat != null ? (ok === r.points.length ? "verified" : "partial") : "unverified";
    let img = null;
    for (const t of [r.place, ...(r.aka || [])]) { img = await wikiImage(t, cc === "TR" ? "tr" : "en"); if (img) break; }
    if (!img && cc !== "TR") for (const t of r.aka || []) { img = await wikiImage(t, "en"); if (img) break; }
    if (!img && cc !== "TR") img = await wikiImage(r.place, "tr");
    if (!img) img = await commonsImage(r.place + " " + (r.country || ""));
    delete r.image; delete r.imageCredit; delete r.imageTitle;
    if (img) { r.image = img.image; r.imageCredit = img.credit; r.imageTitle = img.title; }
    console.log(r.id, r.name, "→", r.check, ok + "/" + r.points.length, img ? "📷 " + img.title : "no photo");
  }
  data.checkedAt = new Date().toISOString();
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + "\n");
  console.log("photos", data.routes.filter(r => r.image).length, "/", data.routes.length, "· verified", data.routes.filter(r => r.check === "verified").length);
})().catch(e => { console.error(e); process.exit(1); });
