import puppeteer from 'puppeteer-core';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--hide-scrollbars']});
const p=await b.newPage(); await p.setViewport({width:390,height:3200,deviceScaleFactor:2,isMobile:true});
const read=async(cat,n)=>{await p.goto('https://aicc-aia-cricket.com/stats',{waitUntil:'networkidle2'});await new Promise(r=>setTimeout(r,3000));await p.evaluate(c=>{for(const el of document.querySelectorAll('button'))if(el.textContent.includes(c)){el.click();return;}},cat);await new Promise(r=>setTimeout(r,1200));const L=await p.evaluate(()=>document.body.innerText.split('\n').map(s=>s.trim()).filter(Boolean));const s=L.findIndex(l=>l===cat);const rows=L.slice(s+1,s+1+n).join(' | ');const wanted=['Nishtha','Mita Donda','Disha','Devanshi','Siya','Diya'];console.log('\n'+cat+':\n',rows);};
await read('Most Wickets',40);
await read('Best Economy',30);
await b.close();
