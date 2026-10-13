#!/usr/bin/env node
"use strict";
// Copies route/destination photos into photos/ (runs in GitHub Actions).
// Phones could not load the Wikimedia hotlinks inside the app, so every
// photo is downloaded once, resized to 720 px JPEG (ImageMagick) and served
// from the app's own site. The © credit link to the original stays.
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const ROOT = path.join(__dirname, ".."), OUT = path.join(ROOT, "photos");
const UA = "GaZonRide-data-check/1.0 (+https://github.com/ufukcicek81/gazonride)";
const sleep = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });
async function download(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
      if (r.ok && /^image\//.test(r.headers.get("content-type") || "")) return Buffer.from(await r.arrayBuffer());
      console.log("  HTTP", r.status, r.headers.get("content-type"), url.slice(0, 90));
      if (r.status === 429) await sleep(8000);
    } catch (e) { console.log("  error", e.message); }
    await sleep(1500 * (i + 1));
  }
  return null;
}
async function mirror(file, listKey, prefix) {
  const p = path.join(ROOT, file), data = JSON.parse(fs.readFileSync(p, "utf8")), list = data[listKey];
  let ok = 0, fail = 0;
  for (const it of list) {
    if (!it.image) { const old = path.join(OUT, `${prefix}-${it.id}.jpg`); if (fs.existsSync(old)) fs.unlinkSync(old); delete it.photo; continue; }
    const name = `${prefix}-${it.id}.jpg`, dest = path.join(OUT, name);
    if (it.photo === "photos/" + name && it.photoSrc === it.image && fs.existsSync(dest)) { ok++; continue; }
    const buf = await download(it.image);
    if (!buf) { fail++; delete it.photo; continue; }
    const tmp = path.join(OUT, ".tmp");
    fs.writeFileSync(tmp, buf);
    try {
      execFileSync("convert", [tmp + "[0]", "-auto-orient", "-resize", "720x720>", "-strip", "-interlace", "Plane", "-quality", "72", dest]);
      it.photo = "photos/" + name; it.photoSrc = it.image; ok++;
    } catch (e) { console.log("  convert failed", it.id, e.message); fail++; delete it.photo; }
    fs.unlinkSync(tmp);
    await sleep(300);
  }
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n");
  console.log(file, "mirrored", ok, "failed", fail);
}
(async () => {
  await mirror("gazon-moto-routes.json", "routes", "moto");
  await mirror("gazon-destinations.json", "items", "il");
})().catch(e => { console.error(e); process.exit(1); });
