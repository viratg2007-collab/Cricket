import puppeteer from 'puppeteer-core';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--hide-scrollbars']});
const p=await b.newPage(); await p.setViewport({width:390,height:1500,deviceScaleFactor:2,isMobile:true});
await p.goto('https://aicc-aia-cricket.com/match/00000000-0000-0000-0004-000000000066',{waitUntil:'networkidle2'});
await new Promise(r=>setTimeout(r,4000));
await p.screenshot({path:'/tmp/fix_live.png'});
const t=await p.evaluate(()=>document.body.innerText.replace(/\s+/g,' ').slice(0,240));
console.log('LIVE:', t);
// scorecard tab
await p.evaluate(()=>{for(const el of document.querySelectorAll('button')){if(el.textContent.trim()==='Scorecard'){el.click();return;}}});
await new Promise(r=>setTimeout(r,1500));
await p.screenshot({path:'/tmp/fix_scorecard.png'});
console.log('SCORECARD:', await p.evaluate(()=>document.body.innerText.replace(/\s+/g,' ').slice(0,260)));
await b.close();
