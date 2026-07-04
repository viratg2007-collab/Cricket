import puppeteer from 'puppeteer-core';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--hide-scrollbars']});
const p=await b.newPage(); await p.setViewport({width:390,height:1600,deviceScaleFactor:2,isMobile:true});
// Match 2 viewer
await p.goto('https://aicc-aia-cricket.com/match/00000000-0000-0000-0004-000000000002',{waitUntil:'networkidle2'});
await new Promise(r=>setTimeout(r,3500));
const t=await p.evaluate(()=>document.body.innerText.replace(/\s+/g,' ').slice(0,200));
console.log('MATCH 2 VIEWER:', t);
// women's table
await p.goto('https://aicc-aia-cricket.com/womens',{waitUntil:'networkidle2'}); await new Promise(r=>setTimeout(r,2000));
await p.evaluate(()=>{for(const el of document.querySelectorAll('button')){if(el.textContent.trim()==='Table'){el.click();return;}}});
await new Promise(r=>setTimeout(r,2500));
const tbl=await p.evaluate(()=>{const t=document.body.innerText;const i=t.indexOf('Group B');return i<0?'no group B':t.slice(i,i+200).replace(/\n+/g,' | ');});
console.log('GROUP B TABLE:', tbl);
await b.close();
