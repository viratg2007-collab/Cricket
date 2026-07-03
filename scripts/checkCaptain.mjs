import puppeteer from 'puppeteer-core';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--hide-scrollbars']});
const p=await b.newPage(); await p.setViewport({width:390,height:2200,deviceScaleFactor:2,isMobile:true});
await p.goto('https://aicc-aia-cricket.com/womens',{waitUntil:'networkidle2'}); await new Promise(r=>setTimeout(r,1500));
await p.evaluate(()=>{for(const el of document.querySelectorAll('button')){if(el.textContent.trim()==='Squads'){el.click();return;}}});
await new Promise(r=>setTimeout(r,1500));
const cap=await p.evaluate(()=>{
  // find Nishant's Angles section and its captain (marked with a star/C)
  const t=document.body.innerText;
  const idx=t.indexOf("Nishant's Angles");
  return t.slice(idx, idx+260).replace(/\n+/g,' | ');
});
console.log('Nishant section:', cap);
await b.close();
