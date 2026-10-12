"use strict";
// iPhone (WebKit = Safari engine) smoke test: open every tab, tap every
// visible button, report JavaScript errors and buttons whose tap throws.
// Run in CI: node test/ui/ios-buttons.spec.js  (needs playwright + webkit)
const path=require("path"),http=require("http"),fs=require("fs");
const {webkit,devices}=require("playwright");
const root=path.join(__dirname,"..","..");
const types={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".svg":"image/svg+xml",".png":"image/png",".jpg":"image/jpeg",".webmanifest":"application/manifest+json"};
const server=http.createServer((req,res)=>{
 const file=path.join(root,decodeURIComponent(new URL(req.url,"http://x").pathname));
 if(!file.startsWith(root)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);return res.end()}
 res.writeHead(200,{"Content-Type":types[path.extname(file)]||"application/octet-stream"});fs.createReadStream(file).pipe(res);
});
const report={errors:[],tapped:0,failed:[]};
(async()=>{
 await new Promise(r=>server.listen(0,r));
 const port=server.address().port;
 const browser=await webkit.launch();
 const ctx=await browser.newContext({...devices["iPhone 13"],geolocation:{latitude:40.875,longitude:30.95,accuracy:8},permissions:["geolocation"]});
 const page=await ctx.newPage();
 page.on("pageerror",e=>report.errors.push("pageerror: "+e.message));
 page.on("dialog",d=>d.dismiss().catch(()=>{}));
 page.on("popup",p=>p.close().catch(()=>{}));
 await page.route(/maps\.googleapis|supabase\.co|onrender\.com|unpkg|fonts\.g/,r=>r.abort());
 await page.goto(`http://localhost:${port}/index.html`,{waitUntil:"domcontentloaded"});
 await page.waitForTimeout(1500);
 const scripts=await page.evaluate(()=>({tour:!!window.GaZonTour,engine:!!window.GaZonTourEngine,camera:!!window.GaZonCamera,journal:!!window.GaZonJournal,music:!!window.GaZonMusic,social:!!window.GaZonRideSocial}));
 const missing=Object.entries(scripts).filter(([,v])=>!v).map(([k])=>k);
 if(missing.length)report.errors.push("scripts not loaded on WebKit: "+missing.join(", "));
 const tabs=["ride","navigation","tours","discover","profile"];
 for(const tab of tabs){
  await page.evaluate(()=>{const s=document.getElementById("screen");if(s&&s.classList.contains("active")){const c=s.querySelector("#closeScreen");if(c)c.click()}});
  await page.click(`.bottom [data-page="${tab}"]`).catch(e=>report.failed.push(`tab ${tab}: ${e.message}`));
  await page.waitForTimeout(500);
  // Every visible, enabled button that does not leave the app.
  const ids=await page.evaluate(()=>{
   const out=[];let n=0;
   document.querySelectorAll("button,[role=button]").forEach(b=>{
    const r=b.getBoundingClientRect(),st=getComputedStyle(b);
    if(r.width<4||r.height<4||st.visibility==="hidden"||st.display==="none"||b.disabled)return;
    if(b.closest(".bottom"))return;
    if(/startBtn|leaveVoice|deleteRide|rideDelete|grSendPost|logout|signOut/i.test(b.id+" "+b.className))return;
    b.dataset.iosProbe="p"+(n++);out.push({probe:b.dataset.iosProbe,label:(b.getAttribute("aria-label")||b.title||b.textContent||"").trim().slice(0,40)});
   });
   return out;
  });
  for(const b of ids){
   const before=report.errors.length;
   try{
    await page.evaluate(p=>{const el=document.querySelector(`[data-ios-probe="${p}"]`);if(el)el.click()},b.probe);
    report.tapped++;
    await page.waitForTimeout(150);
   }catch(e){report.failed.push(`${tab} · ${b.label}: ${e.message}`)}
   if(report.errors.length>before)report.failed.push(`${tab} · "${b.label}" → ${report.errors.slice(before).join(" | ")}`);
   // Close overlays opened by the tap so the next button is reachable.
   await page.evaluate(()=>{document.querySelectorAll(".gr-j-wizard,.gr-modal,.gr-music-panel").forEach(x=>{if(x.classList.contains("gr-j-wizard"))x.remove()});const s=document.getElementById("screen");if(s&&s.classList.contains("active")){const c=s.querySelector("#closeScreen,.mapBtn");if(c)c.click()}}).catch(()=>{});
  }
 }
 await browser.close();server.close();
 console.log(JSON.stringify(report,null,1));
 const fatal=report.errors.filter(e=>!/Failed to load|NetworkError|Load failed|access control|aborted/i.test(e));
 console.log(fatal.length?`FAIL: ${fatal.length} WebKit error(s)`:`PASS: WebKit iPhone smoke test (${report.tapped} taps)`);
 process.exit(fatal.length?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
