import puppeteer from 'puppeteer-core';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--hide-scrollbars']});
const p=await b.newPage(); await p.setViewport({width:390,height:1500,deviceScaleFactor:2,isMobile:true});
await p.goto('https://aicc-aia-cricket.com/mens?tab=table',{waitUntil:'networkidle2'}); await new Promise(r=>setTimeout(r,3000));
// tap the first team row to expand its NRR breakdown
await p.evaluate(()=>{ const rows=[...document.querySelectorAll('div')].filter(d=>/MN Warriors|Antwerp Sunrisers/.test(d.textContent)&&d.querySelector('span')); for(const el of document.querySelectorAll('[style*="cursor: pointer"]')){ if(/Antwerp Sunrisers/.test(el.textContent)){ el.click(); return true; } } return false; });
await new Promise(r=>setTimeout(r,900));
await p.screenshot({path:'/tmp/nrr_expanded.png'});
console.log('done');
await b.close();
