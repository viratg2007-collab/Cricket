import { readFileSync } from 'node:fs';
import { ALL_MATCHES } from '../src/lib/matchData';
import { PLAYERS } from '../src/lib/seedData';
const env=readFileSync('/Users/viratgandhi/cricket-scorer/.env.local','utf8');
const g=(k:string)=>env.match(new RegExp(`^${k}=(.*)$`,'m'))?.[1]?.trim()??'';
const BASE=g('VITE_SUPABASE_URL').replace(/\/$/,'')+'/rest/v1';
const KEY=g('VITE_SUPABASE_ANON_KEY'); const H={apikey:KEY,Authorization:`Bearer ${KEY}`};
const q=async(p:string)=>JSON.parse(await (await fetch(`${BASE}/${p}`,{headers:H})).text());
const nm=(id:string)=>PLAYERS.find(p=>p.id===id)?.name??id.slice(-4);
async function wktsByBowler(inningsId:string){
  const d=await q(`deliveries?innings_id=eq.${inningsId}&is_deleted=eq.false&is_wicket=eq.true&select=bowler_id`);
  const m:Record<string,number>={}; for(const x of d) m[x.bowler_id]=(m[x.bowler_id]??0)+1; return m;
}
const first8=ALL_MATCHES.slice(0,8);
const perPlayer:Record<string,number>={};
for(const rec of first8){
  const label=rec.roundLabel||''; const mid=rec.match.id;
  const w1=await wktsByBowler(rec.innings1_id), w2=await wktsByBowler(rec.innings2_id);
  const all={...w1,...w2};
  const parts=Object.entries(all).map(([id,n])=>`${nm(id)}=${n}`).join(', ');
  console.log(`M${parseInt(mid.slice(-2),16)} ${label}: ${parts||'(none)'}`);
  for(const [id,n] of Object.entries(w1)) perPlayer[id]=(perPlayer[id]??0)+n;
  for(const [id,n] of Object.entries(w2)) perPlayer[id]=(perPlayer[id]??0)+n;
}
console.log('\n=== CURRENT TOTALS (software, M1-M8) ===');
for(const [id,n] of Object.entries(perPlayer).sort((a,b)=>b[1]-a[1])) console.log(`${nm(id).padEnd(18)} ${n}`);
