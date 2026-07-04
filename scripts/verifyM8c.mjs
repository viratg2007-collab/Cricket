import puppeteer from 'puppeteer-core';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--hide-scrollbars']});
const p=await b.newPage(); await p.setViewport({width:390,height:3200,deviceScaleFactor:2,isMobile:true});
await p.goto('https://aicc-aia-cricket.com/womens',{waitUntil:'networkidle2'}); await new Promise(r=>setTimeout(r,4000));
await p.evaluate(()=>{for(const el of document.querySelectorAll('button'))if(el.textContent.trim()==='Fixtures'){el.click();return;}});
await new Promise(r=>setTimeout(r,2500));
let t=await p.evaluate(()=>document.body.innerText);
let i=t.indexOf('Match 8'); console.log('M8:', t.slice(i,i+130).replace(/\n+/g,' | '));
// Table -> Round 2
await p.evaluate(()=>{for(const el of document.querySelectorAll('button'))if(el.textContent.trim()==='Table'){el.click();return;}});
await new Promise(r=>setTimeout(r,1500));
await p.evaluate(()=>{for(const el of document.querySelectorAll('button'))if(el.textContent.trim()==='Round 2'){el.click();return;}});
await new Promise(r=>setTimeout(r,1800));
t=await p.evaluate(()=>document.body.innerText);
i=t.indexOf('Group C'); console.log('\nR2 TABLE:', (i<0?'[no Group C]':t.slice(i,i+360)).replace(/\n{2,}/g,'\n'));
// Leaderboards full
const read=async(cat,n)=>{await p.goto('https://aicc-aia-cricket.com/stats',{waitUntil:'networkidle2'});await new Promise(r=>setTimeout(r,3000));await p.evaluate(c=>{for(const el of document.querySelectorAll('button'))if(el.textContent.includes(c)){el.click();return;}},cat);await new Promise(r=>setTimeout(r,1200));const L=await p.evaluate(()=>document.body.innerText.split('\n').map(s=>s.trim()).filter(Boolean));const s=L.findIndex(l=>l===cat);console.log('\n'+cat+':\n',L.slice(s+1,s+1+n).join(' | '));};
await read('Most Wickets',30);
await read('Most Runs',24);
await b.close();
