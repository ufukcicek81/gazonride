"use strict";
// UI layout checks on phone sizes, with and without Android safe-area insets.
// Run: node test/ui/layout.spec.js   (needs the playwright package)
const path=require("path"),http=require("http"),fs=require("fs");
const {chromium}=require("playwright");
const root=path.join(__dirname,"..","..");
const types={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".svg":"image/svg+xml",".png":"image/png",".jpg":"image/jpeg"};
const server=http.createServer((req,res)=>{
 const file=path.join(root,decodeURIComponent(new URL(req.url,"http://x").pathname));
 if(!file.startsWith(root)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);return res.end()}
 res.writeHead(200,{"Content-Type":types[path.extname(file)]||"application/octet-stream"});fs.createReadStream(file).pipe(res);
});
let failures=0;
function check(ok,msg){if(!ok){failures++;console.error("FAIL",msg)}else console.log("ok  ",msg)}
(async()=>{
 await new Promise(r=>server.listen(0,r));
 const port=server.address().port;
 const browser=await chromium.launch(process.env.GR_CHROMIUM?{executablePath:process.env.GR_CHROMIUM}:{});
 for(const vp of [{width:360,height:640},{width:390,height:844},{width:412,height:915}]){
  for(const theme of ["dark","light"]){
   for(const inset of [0,48]){
    const ctx=await browser.newContext({viewport:vp,colorScheme:theme,isMobile:true,hasTouch:true});
    const page=await ctx.newPage();
    const errors=[];page.on("pageerror",e=>errors.push(e.message));
    await page.route(/maps\.googleapis|supabase|unpkg|jsdelivr|fonts\.g/,r=>r.abort());
    await page.goto(`http://localhost:${port}/index.html?theme=${theme}`,{waitUntil:"domcontentloaded"});
    await page.waitForTimeout(700);
    // Simulate the Android bridge injecting system bar sizes.
    await page.evaluate(i=>{const r=document.documentElement;r.style.setProperty("--gr-safe-top",i/2+"px");r.style.setProperty("--gr-safe-bottom",i+"px")},inset);
    const tag=`${vp.width}x${vp.height} ${theme} inset=${inset}`;
    check(!errors.length,`${tag}: no page errors ${errors.join("; ")}`);
    for(const tab of ["ride","navigation","tours","discover"]){
     await page.click(`.bottom [data-page="${tab}"]`);
     await page.waitForTimeout(250);
     const m=await page.evaluate(()=>{
      const nav=document.querySelector(".bottom").getBoundingClientRect();
      const btns=[...document.querySelectorAll(".bottom .navBtn")].map(b=>b.getBoundingClientRect());
      const start=document.querySelector("#startBtn"),startRect=start&&getComputedStyle(start).display!=="none"?start.getBoundingClientRect():null;
      const visible=el=>{if(!el)return false;const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=="none"&&s.visibility!=="hidden"&&r.width>0&&r.height>0};
      const tourPanel=document.querySelector("#grTourPanel");
      const pad=parseFloat(getComputedStyle(document.querySelector(".bottom")).paddingBottom);
      return {navTop:nav.top,navBottom:nav.bottom,pad,btns,start:startRect,
       overflowX:document.documentElement.scrollWidth>window.innerWidth+1,
       tourVisible:visible(tourPanel),bodyBg:getComputedStyle(document.body).backgroundColor,
       active:(document.querySelector(".bottom .navBtn.active")||{}).dataset?.page};
     });
     check(m.active===tab,`${tag} ${tab}: tab highlighted (${m.active})`);
     check(!m.overflowX,`${tag} ${tab}: no horizontal scroll`);
     check(m.btns.every(b=>b.height>=56&&b.bottom<=vp.height+.5&&b.top>=0),`${tag} ${tab}: 5 tabs fully visible, >=56px`);
     check(m.pad>=inset,`${tag} ${tab}: tab bar clears gesture bar (${m.pad}px)`);
     if(tab==="ride"&&m.start){
      check(m.start.bottom<=m.navTop+.5,`${tag}: Sürüşü Başlat above the tab bar`);
      check(m.start.height>=60,`${tag}: start button glove size (${m.start.height})`);
     }
     if(tab==="tours")check(m.tourVisible,`${tag}: Turlar shows the tour planner`);
     if(tab==="navigation")check(!m.tourVisible,`${tag}: Rota shows destination search`);
    }
    const bg=await page.evaluate(()=>getComputedStyle(document.body).backgroundColor);
    check(theme==="dark"?bg==="rgb(10, 12, 16)":bg==="rgb(244, 245, 247)",`${tag}: ${theme} theme background (${bg})`);
    await ctx.close();
   }
  }
 }
 await browser.close();server.close();
 console.log(failures?`${failures} UI check(s) failed`:"PASS: UI layout checks");
 process.exit(failures?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
