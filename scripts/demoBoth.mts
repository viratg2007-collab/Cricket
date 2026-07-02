// Seeds a realistic demo state for BOTH tournaments (Match 1 COMPLETE, Match 2 LIVE
// + tosses) to walk through every screen. Modes: seed | clean.
import { readFileSync } from 'node:fs';
import { deriveMatchState, computeNetRunEffect, computeStrikeChanged, shouldReBowl } from '../src/lib/engine';
import { ALL_MATCHES, getPairsForTeam } from '../src/lib/matchData';
import { PLAYERS } from '../src/lib/seedData';
import { MENS_MATCHES, mensPairs, MENS_PLAYERS } from '../src/lib/mensData';
import type { Delivery, Pair, Player, MatchSettings } from '../src/lib/types';

const env = readFileSync('/Users/viratgandhi/cricket-scorer/.env.local','utf8');
const g=(k)=>env.match(new RegExp(`^${k}=(.*)$`,'m'))?.[1]?.trim()??'';
const BASE=g('VITE_SUPABASE_URL').replace(/\/$/,'')+'/rest/v1';
const KEY=g('VITE_SUPABASE_ANON_KEY');
const H={apikey:KEY,Authorization:`Bearer ${KEY}`,'Content-Type':'application/json'};
const SENT='00000000-0000-0000-00f9-';
let idc=0; const nid=()=>SENT+(idc++).toString(16).padStart(12,'0');
const posted=[];
let seed=7; const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;};

async function scoreInnings(inningsId, pairs, bowlers, settings, maxLegal, aggr){
  const dels=[]; let n=0;
  while(true){
    const d0=deriveMatchState(dels,pairs,settings);
    const legal=dels.filter(d=>d.legal_ball).length;
    if(d0.is_complete||legal>=maxLegal) break;
    const nb=d0.next_ball; const bowler=bowlers[Math.floor(d0.current_absolute_over)%bowlers.length];
    const x=rnd(); const wide=!nb.is_last_ball_of_pair_set&&x<0.05; const wkt=!wide&&x>0.95;
    const y=rnd()*aggr; const r=wide||wkt?0:y>0.92?6:y>0.8?4:y>0.58?2:y>0.28?1:0;
    const isReBowl=shouldReBowl(wide?'wide':'none',nb.is_last_ball_of_pair_set,settings);
    const legal_ball=!isReBowl; const isEndOfOver=legal_ball&&nb.ball_in_over===settings.balls_per_over-1;
    const extraValue=wide?(isReBowl?1:settings.wide_value):0; const isWicket=isReBowl?false:wkt;
    n++; const d={id:nid(),innings_id:inningsId,pair_id:d0.current_pair.id,over_number:nb.over_number,ball_in_over:nb.ball_in_over,sequence_number:n,is_deleted:false,striker_id:d0.striker_id,non_striker_id:d0.non_striker_id,bowler_id:bowler.id,runs_off_bat:r,extra_type:wide?'wide':'none',extra_value:extraValue,is_wicket:isWicket,wicket_type:isWicket?'caught':undefined,dismissed_player_id:isWicket?d0.striker_id:undefined,fielder_id:isWicket?bowler.id:undefined,net_run_effect:computeNetRunEffect(r,extraValue,isWicket,settings),legal_ball,strike_changed:computeStrikeChanged(r,isWicket,isEndOfOver,false),created_at:new Date().toISOString()};
    const res=await fetch(`${BASE}/deliveries`,{method:'POST',headers:H,body:JSON.stringify(d)}); if(!res.ok) throw new Error(await res.text());
    posted.push(d.id); dels.push(d);
  }
  return deriveMatchState(dels,pairs,settings).total;
}

async function seedWomens(){
  const S=ALL_MATCHES[0].match.settings; const total=S.num_pairs*S.overs_per_pair*S.balls_per_over;
  const m1=ALL_MATCHES[0];
  await fetch(`${BASE}/matches?id=eq.${m1.match.id}`,{method:'PATCH',headers:H,body:JSON.stringify({toss_winner_id:m1.match.home_team_id,toss_decision:'bat'})});
  const a=await scoreInnings(m1.innings1_id,getPairsForTeam(m1.match.home_team_id,m1.match.id),PLAYERS.filter(p=>p.team_id===m1.match.away_team_id),S,total,1.0);
  const b=await scoreInnings(m1.innings2_id,getPairsForTeam(m1.match.away_team_id,m1.match.id),PLAYERS.filter(p=>p.team_id===m1.match.home_team_id),S,total,1.05);
  const m2=ALL_MATCHES[1];
  await fetch(`${BASE}/matches?id=eq.${m2.match.id}`,{method:'PATCH',headers:H,body:JSON.stringify({toss_winner_id:m2.match.home_team_id,toss_decision:'bat'})});
  const c=await scoreInnings(m2.innings1_id,getPairsForTeam(m2.match.home_team_id,m2.match.id),PLAYERS.filter(p=>p.team_id===m2.match.away_team_id),S,Math.floor(total*0.6),1.0);
  console.log(`WOMENS: M1 complete ${a} vs ${b}; M2 live ${c}`);
}
async function seedMens(){
  const S=MENS_MATCHES[0].match.settings; const total=S.num_pairs*S.overs_per_pair*S.balls_per_over;
  const m1=MENS_MATCHES[0];
  await fetch(`${BASE}/matches?id=eq.${m1.match.id}`,{method:'PATCH',headers:H,body:JSON.stringify({toss_winner_id:m1.match.home_team_id,toss_decision:'bat'})});
  const a=await scoreInnings(m1.innings1_id,mensPairs(m1.match.home_team_id,m1.match.id),MENS_PLAYERS.filter(p=>p.team_id===m1.match.away_team_id),S,total,1.0);
  const b=await scoreInnings(m1.innings2_id,mensPairs(m1.match.away_team_id,m1.match.id),MENS_PLAYERS.filter(p=>p.team_id===m1.match.home_team_id),S,total,1.05);
  const m2=MENS_MATCHES[1];
  await fetch(`${BASE}/matches?id=eq.${m2.match.id}`,{method:'PATCH',headers:H,body:JSON.stringify({toss_winner_id:m2.match.home_team_id,toss_decision:'bat'})});
  const c=await scoreInnings(m2.innings1_id,mensPairs(m2.match.home_team_id,m2.match.id),MENS_PLAYERS.filter(p=>p.team_id===m2.match.away_team_id),S,Math.floor(total*0.6),1.0);
  console.log(`MENS: M1 complete ${a} vs ${b}; M2 live ${c}`);
}
async function clean(){
  const all=[...ALL_MATCHES,...MENS_MATCHES];
  for(const r of all){
    const rows=await (await fetch(`${BASE}/deliveries?innings_id=in.(${r.innings1_id},${r.innings2_id})&select=id`,{headers:H})).json();
    const sent=rows.filter(x=>x.id.startsWith(SENT)).map(x=>x.id);
    for(let i=0;i<sent.length;i+=50){ await fetch(`${BASE}/deliveries?id=in.(${sent.slice(i,i+50).join(',')})`,{method:'PATCH',headers:H,body:JSON.stringify({is_deleted:true})}); }
    await fetch(`${BASE}/matches?id=eq.${r.match.id}`,{method:'PATCH',headers:H,body:JSON.stringify({toss_winner_id:null,toss_decision:null})});
  }
  const active=((await (await fetch(`${BASE}/deliveries?is_deleted=eq.false&select=id`,{headers:H})).json())).length;
  console.log('CLEANED — active deliveries:',active);
}
(async()=>{ const mode=process.argv[2]; if(mode==='clean'){await clean();return;} await seedWomens(); await seedMens(); console.log('SEED DONE'); })().catch(e=>{console.error(e.message);process.exit(1);});
