import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--no-sandbox']});
const p=await b.newPage(); await p.setViewport({width:390,height:2600,deviceScaleFactor:2,isMobile:true});
await p.goto('https://aicc-aia-cricket.com/stats',{waitUntil:'networkidle2'}); await new Promise(r=>setTimeout(r,3500));
await p.evaluate(()=>{for(const el of document.querySelectorAll('button'))if(el.textContent.includes('Most Wickets')){el.click();return;}});
await new Promise(r=>setTimeout(r,1500));
const L=await p.evaluate(()=>document.body.innerText.split('\n').map(s=>s.trim()).filter(Boolean));
const s=L.findIndex(l=>l==='Most Wickets'); console.log(L.slice(s+1,s+40).join(' | '));
await b.close();
