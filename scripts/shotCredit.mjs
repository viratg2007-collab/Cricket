import puppeteer from 'puppeteer-core';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--hide-scrollbars']});
const p=await b.newPage(); await p.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true});
await p.goto('https://aicc-aia-cricket.com/',{waitUntil:'networkidle2'}); await new Promise(r=>setTimeout(r,1200));
await p.screenshot({path:'/tmp/credit_landing.png'});
console.log('done');
await b.close();
