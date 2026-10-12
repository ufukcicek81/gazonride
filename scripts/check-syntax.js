"use strict";
// Syntax check for every web script, including inline <script> blocks of the
// HTML pages, so a typo can never reach GitHub Pages (= every rider's app).
const fs=require("fs"),path=require("path"),vm=require("vm");
const root=path.join(__dirname,"..");
let failed=0;
for(const f of fs.readdirSync(root)){
 const file=path.join(root,f);
 try{
  if(f.endsWith(".js")&&f!=="sw.js")new vm.Script(fs.readFileSync(file,"utf8"),{filename:f});
  if(f.endsWith(".html")){
   const html=fs.readFileSync(file,"utf8"),re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;let m,i=0;
   while((m=re.exec(html))){i++;new vm.Script(m[1],{filename:f+"#inline"+i})}
  }
 }catch(e){failed++;console.error("SYNTAX",f,e.message)}
}
if(failed)process.exit(1);
console.log("syntax ok");
