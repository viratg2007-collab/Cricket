import puppeteer from 'puppeteer-core';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--hide-scrollbars']});
const p=await b.newPage(); await p.setViewport({width:390,height:1600,deviceScaleFactor:2,isMobile:true});
await p.goto('https://aicc-aia-cricket.com/womens',{waitUntil:'networkidle2'}); await new Promise(r=>setTimeout(r,1500));
// click the Fixtures tab button
const clicked = await p.evaluate(()=>{ for(const el of document.querySelectorAll('button')){ if(el.textContent.trim()==='Fixtures'){ el.click(); return true; } } return false; });
console.log('clicked fixtures:', clicked);
await new Promise(r=>setTimeout(r,1200));
await p.screenshot({path:'/tmp/womens_fixtures_times.png'}); console.log('shot done');
await b.close();
