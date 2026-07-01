import puppeteer from 'puppeteer-core';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL='https://aicc-aia-cricket.com/match/00000000-0000-0000-0004-000000000001'; // women's match 1 viewer
const readCount = async (p) => p.evaluate(()=>{ const m=document.body.innerText.match(/👁\s*(\d+)/); return m?parseInt(m[1]):0; });
const b1=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
const p1=await b1.newPage(); await p1.setViewport({width:390,height:844}); await p1.goto(URL,{waitUntil:'networkidle2'});
await new Promise(r=>setTimeout(r,4000));
console.log('After viewer 1 opens →', await readCount(p1), 'watching');
const b2=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
const p2=await b2.newPage(); await p2.setViewport({width:390,height:844}); await p2.goto(URL,{waitUntil:'networkidle2'});
await new Promise(r=>setTimeout(r,4000));
console.log('After viewer 2 opens → viewer1 sees', await readCount(p1), '· viewer2 sees', await readCount(p2));
await b2.close();
await new Promise(r=>setTimeout(r,4000));
console.log('After viewer 2 leaves  → viewer1 sees', await readCount(p1));
await b1.close();
