import puppeteer from 'puppeteer-core';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--hide-scrollbars']});
const shot=async(name,url,{auth=false,clickTab=null,tapNrr=false,wait=3200}={})=>{
  const p=await b.newPage(); await p.setViewport({width:390,height:1700,deviceScaleFactor:2,isMobile:true});
  if(auth){ await p.goto('https://aicc-aia-cricket.com'+url,{waitUntil:'domcontentloaded'}); await p.evaluate(()=>sessionStorage.setItem('cricket_scorer_auth','1')); await p.reload({waitUntil:'networkidle2'}); }
  else await p.goto('https://aicc-aia-cricket.com'+url,{waitUntil:'networkidle2'});
  await new Promise(r=>setTimeout(r,wait));
  if(clickTab){ await p.evaluate(t=>{for(const el of document.querySelectorAll('button')){if(el.textContent.trim()===t){el.click();return;}}},clickTab); await new Promise(r=>setTimeout(r,1800)); }
  if(tapNrr){ await p.evaluate(()=>{for(const el of document.querySelectorAll('[style*="cursor: pointer"]')){if(/[A-Za-z]/.test(el.textContent)&&!/Round|How|Manual|Score/.test(el.textContent)&&el.querySelector('span')){el.click();return;}}}); await new Promise(r=>setTimeout(r,800)); }
  await p.screenshot({path:`/tmp/fw_${name}.png`});
  const t=await p.evaluate(()=>document.body.innerText.replace(/\s+/g,' ').trim().slice(0,140));
  console.log(`✓ ${name}: ${t}`);
  await p.close();
};
const wM2='/match/00000000-0000-0000-0004-000000000002', mM2='/match/00000000-0000-0000-0004-000000000066';
await shot('01_landing','/');
await shot('02_w_home','/womens');
await shot('03_w_fixtures','/womens',{clickTab:'Fixtures'});
await shot('04_w_table','/womens',{clickTab:'Table',tapNrr:true});
await shot('05_w_viewer',wM2);
await shot('06_w_scorer','/score',{auth:true});
await shot('07_m_home','/mens');
await shot('08_m_fixtures','/mens?tab=fixtures');
await shot('09_m_table','/mens?tab=table',{tapNrr:true});
await shot('10_m_viewer',mM2);
await shot('11_m_scorer','/mens/score',{auth:true});
await b.close(); console.log('DONE');
