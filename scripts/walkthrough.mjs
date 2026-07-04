import puppeteer from 'puppeteer-core';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const B='https://aicc-aia-cricket.com';
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--hide-scrollbars']});
const p=await b.newPage(); await p.setViewport({width:390,height:2600,deviceScaleFactor:2,isMobile:true});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const clickText=async(t)=>p.evaluate(tx=>{for(const el of document.querySelectorAll('button,a'))if(el.textContent.trim()===tx){el.click();return true;}return false;},t);
const clickInc=async(t)=>p.evaluate(tx=>{for(const el of document.querySelectorAll('button,a'))if(el.textContent.includes(tx)){el.click();return true;}return false;},t);
const txt=async()=>p.evaluate(()=>document.body.innerText.replace(/\n{2,}/g,'\n'));
const go=async(u)=>{await p.goto(B+u,{waitUntil:'networkidle2'});await wait(3200);};
const shot=async(n)=>{await p.screenshot({path:`/tmp/wt_${n}.png`});return`/tmp/wt_${n}.png`;};
const line=(t,kw)=>{const i=t.indexOf(kw);return i<0?`[MISSING ${kw}]`:t.slice(i,i+90).replace(/\n/g,' ');};

const R={};
// 1 LANDING
await go('/'); R.landing=(await txt()).slice(0,200).replace(/\n/g,' | '); await shot('landing');
// 2 WOMENS HOME
await go('/womens');
R.w_home_head=line(await txt(),'Mega Event');
await clickText('Matches'); await wait(1500); R.w_matches=(await txt()).split('\n').filter(x=>/won by|Live|vs|·/.test(x)).slice(0,4).join(' || ');
await clickText('Fixtures'); await wait(1800); { const t=await txt(); R.w_fix_m1=line(t,'Match 1'); R.w_fix_m8=line(t,'Match 8'); } await shot('w_fixtures');
await clickText('Table'); await wait(1500); await clickText('Round 2'); await wait(1500); { const t=await txt(); R.w_tableR2=line(t,'Sparkle Strikers'); } await shot('w_table');
await clickText('Squads'); await wait(1500); R.w_squads=(await txt()).includes('Sparkle')?'squads render (teams listed)':'[squads?]';
await clickText('Stats'); await wait(1800); R.w_stats_mvp=line(await txt(),'MVP'); await shot('w_stats');
// 3 WOMENS VIEWER (M8)
await go('/match/00000000-0000-0000-0004-000000000008');
{ const t=await txt(); R.w_view=line(t,'Sparkle'); } await shot('w_viewer');
await clickInc('Scorecard'); await wait(1500); R.w_scorecard=(await txt()).includes('Yet to bat')||(await txt()).includes('Nishtha')?'scorecard renders':'[scorecard?]'; await shot('w_scorecard');
// 4 WOMENS SCORER
await go('/score'); R.w_scorer=(await txt()).slice(0,120).replace(/\n/g,' '); await shot('w_scorer');
// 5 MENS HOME
await go('/mens');
R.m_home_head=line(await txt(),'Mega Event')||line(await txt(),'Men');
await clickText('Fixtures'); await wait(1800); R.m_fixtures=(await txt()).split('\n').filter(x=>/won by|vs|Match/.test(x)).slice(0,3).join(' || '); await shot('m_fixtures');
await clickText('Table'); await wait(1500); R.m_table=(await txt()).split('\n').filter(x=>/PTS|\+|\-/.test(x)).slice(0,3).join(' | '); await shot('m_table');
await clickText('Stats'); await wait(1800); R.m_stats=line(await txt(),'MVP'); 
// 6 MENS VIEWER
await go('/match/00000000-0000-0000-0004-000000000065'); R.m_view=(await txt()).slice(0,120).replace(/\n/g,' '); await shot('m_viewer');
// 7 MENS STATS PAGE
await go('/mens/stats'); R.m_statspage=line(await txt(),'MVP'); await shot('m_stats');
// 8 MENS SCORER
await go('/mens/score'); R.m_scorer=(await txt()).slice(0,120).replace(/\n/g,' ');
// 9 CROSS NAV
await go('/womens'); const cn=await clickInc("Men's"); R.crossnav=cn?'cross-nav button works':'[no cross-nav]';
console.log(JSON.stringify(R,null,1));
await b.close();
