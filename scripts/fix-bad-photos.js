#!/usr/bin/env node
"use strict";
// Wikipedia lead images are sometimes maps, logos or location diagrams
// (e.g. a road map for Transfăgărășan). Replace those with a real photo from
// a Wikimedia Commons search. Runs in Actions before mirror-photos.js.
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const UA = "GazOnRide-data-check/1.0 (+https://github.com/ufukcicek81/gazonride)";
const BAD = /map|harita|karte|harta|locator|location|_in_turkey|relief|\.svg|logo|belediye|from_space|roads-|diagram|plan\b|seal|flag|bayrak|armas/i;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJson(url) {
  for (let i = 0; i < 3; i++) { try { const r = await fetch(url, { headers: { "User-Agent": UA } }); if (r.ok) return await r.json(); } catch (e) {} await sleep(1500 * (i + 1)); }
  return null;
}
async function commons(q) {
  const j = await getJson("https://commons.wikimedia.org/w/api.php?" + new URLSearchParams({ action: "query", format: "json", generator: "search", gsrsearch: q + " filetype:bitmap", gsrnamespace: "6", gsrlimit: "12", prop: "imageinfo", iiprop: "url|mime|size", iiurlwidth: "960", origin: "*" }));
  const pages = Object.values((j && j.query && j.query.pages) || {}).sort((a, b) => a.index - b.index);
  for (const p of pages) {
    const i = p.imageinfo && p.imageinfo[0];
    if (!i || !/jpeg/.test(i.mime || "") || i.width < 900 || i.width < i.height) continue;
    if (BAD.test(p.title) || BAD.test(i.url || "")) continue;
    // The file must be about the place: its name has to contain a word of the query.
    const fold = t => t.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i");
    const words = fold(q).split(/[^a-z0-9]+/).filter(w => w.length >= 4).map(w => w.slice(0, 5));
    if (words.length && !words.some(w => fold(p.title).includes(w))) continue;
    return { image: i.thumburl || i.url, credit: i.descriptionurl, title: p.title };
  }
  return null;
}
(async () => {
  for (const [file, key, q] of [["gazon-moto-routes.json", "routes", r => `${r.place} ${r.cc === "TR" ? "" : r.country}`.trim()], ["gazon-destinations.json", "items", x => `${x.place || x.title} ${x.city}`]]) {
    const p = path.join(ROOT, file), data = JSON.parse(fs.readFileSync(p, "utf8"));
    let fixed = 0;
    for (const it of data[key]) {
      if (!it.image) continue;
      const src = decodeURIComponent(it.image.split("?")[0]);
      // PNG lead images on Wikipedia are nearly always maps or diagrams.
      if (!it.image || !(BAD.test(src) || /\.png$/i.test(src))) continue;
      const alt = await commons(q(it)) || await commons((it.aka && it.aka[0]) || it.place || it.title || "");
      console.log(file, it.id, "bad:", it.image.split("/").pop().slice(0, 50), "→", alt ? alt.title : "none");
      if (alt) { it.image = alt.image; it.imageCredit = alt.credit; it.imageTitle = alt.title; it.imageSource = "commons-search"; delete it.photo; fixed++; }
      else { delete it.image; delete it.imageCredit; delete it.photo; }
    }
    fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n");
    console.log(file, "fixed", fixed);
  }
})().catch(e => { console.error(e); process.exit(1); });
