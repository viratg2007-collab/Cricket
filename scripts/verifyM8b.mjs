import puppeteer from 'puppeteer-core';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--hide-scrollbars']});
const p=await b.newPage(); await p.setViewport({width:390,height:3000,deviceScaleFactor:2,isMobile:true});
await p.goto('https://aicc-aia-cricket.com/womens',{waitUntil:'networkidle2'}); await new Promise(r=>setTimeout(r,3500));
await p.evaluate(()=>{for(const el of document.querySelectorAll('button'))if(el.textContent.trim()==='Fixtures'){el.click();return;}});
await new Promise(r=>setTimeout(r,2500));
let t=await p.evaluate(()=>document.body.innerText);
let i=t.indexOf('Match 8'); console.log('M8:', t.slice(i,i+150).replace(/\n+/g,' | '));
// Full table tab
await p.evaluate(()=>{for(const el of document.querySelectorAll('button'))if(el.textContent.trim()==='Table'){el.click();return;}});
await new Promise(r=>setTimeout(r,2500));
t=await p.evaluate(()=>document.body.innerText);
console.log('\nTABLE TAB (full):\n', t.replace(/\n{2,}/g,'\n').slice(0,1400));
await b.close();
