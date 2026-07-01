import puppeteer from 'puppeteer-core';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--hide-scrollbars']});
const p=await b.newPage(); await p.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true});
for(const [name,url] of [['womens','https://aicc-aia-cricket.com/womens'],['mens','https://aicc-aia-cricket.com/mens']]){
  await p.goto(url,{waitUntil:'networkidle2'}); await new Promise(r=>setTimeout(r,1500));
  await p.screenshot({path:`/tmp/btn_${name}.png`});
  console.log('shot',name);
}
await b.close();
