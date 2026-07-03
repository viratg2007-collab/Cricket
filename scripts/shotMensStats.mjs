import puppeteer from 'puppeteer-core';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--hide-scrollbars']});
const p=await b.newPage(); await p.setViewport({width:390,height:1700,deviceScaleFactor:2,isMobile:true});
await p.goto('https://aicc-aia-cricket.com/mens/stats',{waitUntil:'networkidle2'}); await new Promise(r=>setTimeout(r,3500));
await p.screenshot({path:'/tmp/mens_stats_menu.png'});
console.log('menu:', await p.evaluate(()=>document.body.innerText.replace(/\s+/g,' ').slice(0,180)));
// open Most Runs leaderboard
await p.evaluate(()=>{for(const el of document.querySelectorAll('button, [role]')){if(el.textContent.trim()==='Most Runs'){el.click();return;}}});
await new Promise(r=>setTimeout(r,1500));
await p.screenshot({path:'/tmp/mens_stats_runs.png'});
await b.close(); console.log('done');
