import puppeteer from 'puppeteer-core';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--hide-scrollbars']});
const p=await b.newPage(); await p.setViewport({width:390,height:2400,deviceScaleFactor:2,isMobile:true});
// Fixtures - M8 result
await p.goto('https://aicc-aia-cricket.com/womens',{waitUntil:'networkidle2'}); await new Promise(r=>setTimeout(r,3500));
await p.evaluate(()=>{for(const el of document.querySelectorAll('button'))if(el.textContent.trim()==='Fixtures'){el.click();return;}});
await new Promise(r=>setTimeout(r,2500));
let t=await p.evaluate(()=>document.body.innerText);
let i=t.indexOf('Match 8'); console.log('M8 FIXTURE:', t.slice(i-160,i+40).replace(/\n+/g,' | '));
// Table tab
await p.evaluate(()=>{for(const el of document.querySelectorAll('button'))if(el.textContent.trim()==='Table'){el.click();return;}});
await new Promise(r=>setTimeout(r,2000));
t=await p.evaluate(()=>document.body.innerText);
i=t.indexOf('Group C'); console.log('\nGROUP C/D TABLE:', t.slice(i,i+420).replace(/\n+/g,' | '));
// Stats leaderboards
const read=async(cat)=>{await p.goto('https://aicc-aia-cricket.com/stats',{waitUntil:'networkidle2'});await new Promise(r=>setTimeout(r,3000));await p.evaluate(c=>{for(const el of document.querySelectorAll('button'))if(el.textContent.includes(c)){el.click();return;}},cat);await new Promise(r=>setTimeout(r,1200));const L=await p.evaluate(()=>document.body.innerText.split('\n').map(s=>s.trim()).filter(Boolean));const s=L.findIndex(l=>l===cat);console.log('\n'+cat+':',L.slice(s+1,s+22).join(' | '));};
await read('Most Wickets');
await read('Most Runs');
await b.close();
