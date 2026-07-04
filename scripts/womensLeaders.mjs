import puppeteer from 'puppeteer-core';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--hide-scrollbars']});
const p=await b.newPage(); await p.setViewport({width:390,height:2000,deviceScaleFactor:2,isMobile:true});
const openAndRead=async(cat)=>{
  await p.goto('https://aicc-aia-cricket.com/stats',{waitUntil:'networkidle2'}); await new Promise(r=>setTimeout(r,3000));
  await p.evaluate(t=>{for(const el of document.querySelectorAll('button')){if(el.textContent.includes(t)){el.click();return;}}},cat);
  await new Promise(r=>setTimeout(r,1500));
  const lines=await p.evaluate(()=>document.body.innerText.split('\n').map(s=>s.trim()).filter(Boolean));
  // print rows after the category title
  console.log('=== '+cat+' ===');
  console.log(lines.slice(lines.findIndex(l=>l===cat)+1, lines.findIndex(l=>l===cat)+30).join(' | '));
};
await openAndRead('Most Runs');
await openAndRead('Highest Score');
await openAndRead('Most Wickets');
await openAndRead('Most Catches');
// MVP
await p.goto('https://aicc-aia-cricket.com/stats',{waitUntil:'networkidle2'}); await new Promise(r=>setTimeout(r,3000));
await p.evaluate(()=>{for(const el of document.querySelectorAll('button')){if(el.textContent.includes('TOURNAMENT MVP')||el.textContent.includes('View leaderboard')){el.click();return;}}});
await new Promise(r=>setTimeout(r,1500));
console.log('=== MVP ===');
console.log(await p.evaluate(()=>document.body.innerText.split('\n').map(s=>s.trim()).filter(Boolean).slice(0,40).join(' | ')));
await b.close();
