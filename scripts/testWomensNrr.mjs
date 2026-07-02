import puppeteer from 'puppeteer-core';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--hide-scrollbars']});
const p=await b.newPage(); await p.setViewport({width:390,height:1600,deviceScaleFactor:2,isMobile:true});
await p.goto('https://aicc-aia-cricket.com/womens',{waitUntil:'networkidle2'}); await new Promise(r=>setTimeout(r,2000));
await p.evaluate(()=>{for(const el of document.querySelectorAll('button')){if(el.textContent.trim()==='Table'){el.click();return;}}});
await new Promise(r=>setTimeout(r,2500));
const before=await p.evaluate(()=>/Runs scored/.test(document.body.innerText));
// tap first clickable standings row
const clicked=await p.evaluate(()=>{ for(const el of document.querySelectorAll('[style*="cursor: pointer"]')){ if(el.querySelector('span') && /[A-Za-z]/.test(el.textContent) && !/Round|How|Manual/.test(el.textContent)){ el.click(); return el.textContent.trim().slice(0,30); } } return null; });
await new Promise(r=>setTimeout(r,800));
const after=await p.evaluate(()=>/Runs scored/.test(document.body.innerText));
console.log('clicked row:', clicked);
console.log('breakdown before tap:', before, '| after tap:', after);
await p.screenshot({path:'/tmp/womens_nrr_test.png'});
await b.close();
