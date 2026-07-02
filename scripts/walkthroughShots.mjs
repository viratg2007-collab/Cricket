import puppeteer from 'puppeteer-core';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--hide-scrollbars']});
const shot=async(name,url,{auth=false,clickTab=null,wait=3500}={})=>{
  const p=await b.newPage(); await p.setViewport({width:390,height:1500,deviceScaleFactor:2,isMobile:true});
  if(auth){ await p.goto('https://aicc-aia-cricket.com'+url,{waitUntil:'domcontentloaded'}); await p.evaluate(()=>sessionStorage.setItem('cricket_scorer_auth','1')); await p.reload({waitUntil:'networkidle2'}); }
  else { await p.goto('https://aicc-aia-cricket.com'+url,{waitUntil:'networkidle2'}); }
  await new Promise(r=>setTimeout(r,wait));
  if(clickTab){ await p.evaluate(t=>{for(const el of document.querySelectorAll('button')){if(el.textContent.trim()===t){el.click();return;}}},clickTab); await new Promise(r=>setTimeout(r,1500)); }
  await p.screenshot({path:`/tmp/wt_${name}.png`});
  const txt=await p.evaluate(()=>document.body.innerText.replace(/\s+/g,' ').slice(0,160));
  console.log(`✓ ${name}: ${txt}`);
  await p.close();
};
const wM2='/match/00000000-0000-0000-0004-000000000002';
const mM2='/match/00000000-0000-0000-0004-000000000066';
await shot('1_landing','/');
await shot('2_womens_home','/womens');
await shot('3_womens_table','/womens',{clickTab:'Table'});
await shot('4_womens_viewer',wM2);
await shot('5_womens_scorer','/score',{auth:true});
await shot('6_mens_home','/mens');
await shot('7_mens_viewer',mM2);
await shot('8_mens_scorer','/mens/score',{auth:true});
await b.close();
console.log('ALL SHOTS DONE');
