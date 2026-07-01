import puppeteer from 'puppeteer-core';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const M1='00000000-0000-0000-0004-000000000001', I1='00000000-0000-0000-0005-000000000001';
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--hide-scrollbars']});
const p=await b.newPage(); await p.setViewport({width:390,height:1200,deviceScaleFactor:2,isMobile:true});
await p.goto('https://aicc-aia-cricket.com/womens',{waitUntil:'domcontentloaded'});
await p.evaluate((M1,I1)=>{
  const del=(n,r,w=false)=>({id:'loc-'+n,innings_id:I1,pair_id:'p',over_number:0,ball_in_over:n,sequence_number:n,is_deleted:false,striker_id:'00000000-0000-0000-0002-000000000001',non_striker_id:'00000000-0000-0000-0002-000000000002',bowler_id:'00000000-0000-0000-0002-00000000000f',runs_off_bat:r,extra_type:'none',extra_value:0,is_wicket:w,net_run_effect:w?-2:r,legal_ball:true,strike_changed:false});
  localStorage.setItem('cricket_match_'+M1+'_v2', JSON.stringify({inn1:{deliveries:[del(0,6),del(1,4)]},inn2:{deliveries:[]}}));
},M1,I1);
await p.reload({waitUntil:'networkidle2'}); await new Promise(r=>setTimeout(r,3000));
const t=await p.evaluate(()=>document.body.innerText);
const showsLocalScore = /KASHVAT STRIKERS BATTING|LIVE NOW/i.test(t) && /\b10\b/.test(t);
console.log('Injected fake local 10 runs. Home shows a live score from localStorage?', showsLocalScore?'YES ⚠️':'NO ✅ (reads cloud only)');
console.log('Home shows "Tournament not started"?', /not started/i.test(t)?'YES ✅':'no');
await b.close();
