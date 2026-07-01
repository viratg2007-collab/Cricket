import puppeteer from 'puppeteer-core';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const M1='00000000-0000-0000-0004-000000000001';
const I1='00000000-0000-0000-0005-000000000001';
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--hide-scrollbars']});
const p=await b.newPage(); await p.setViewport({width:390,height:1400,deviceScaleFactor:2,isMobile:true});
// seed fake local match data BEFORE app loads
await p.goto('https://aicc-aia-cricket.com/womens',{waitUntil:'domcontentloaded'});
await p.evaluate((M1,I1)=>{
  const del=(n,r)=>({id:'local-'+n,innings_id:I1,pair_id:'p1',over_number:0,ball_in_over:n,sequence_number:n,is_deleted:false,striker_id:'00000000-0000-0000-0002-000000000001',non_striker_id:'00000000-0000-0000-0002-000000000002',bowler_id:'00000000-0000-0000-0002-00000000000f',runs_off_bat:r,extra_type:'none',extra_value:0,is_wicket:false,net_run_effect:r,legal_ball:true,strike_changed:false});
  const state={inn1:{deliveries:[del(0,4),del(1,6),del(2,2)]},inn2:{deliveries:[]}};
  localStorage.setItem('cricket_match_'+M1+'_v2', JSON.stringify(state));
},M1,I1);
await p.reload({waitUntil:'networkidle2'}); await new Promise(r=>setTimeout(r,2500));
// go to Stats tab
await p.evaluate(()=>{for(const el of document.querySelectorAll('button')){if(el.textContent.trim()==='Stats'){el.click();return;}}});
await new Promise(r=>setTimeout(r,2500));
const bodyText = await p.evaluate(()=>document.body.innerText);
const hasStatsData = /Most Runs|Most Wickets|MVP/i.test(bodyText) && !/No stats|not started|appear once/i.test(bodyText);
console.log('localStorage had 12 runs of fake data.');
console.log('Stats page shows leaderboard data?', hasStatsData ? 'YES ⚠️ (bug)' : 'NO ✅ (fixed — cloud is source of truth)');
await p.screenshot({path:'/tmp/verify_stats.png'});
await b.close();
