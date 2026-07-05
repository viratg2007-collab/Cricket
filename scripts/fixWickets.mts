import { readFileSync } from 'node:fs';
import { ALL_MATCHES } from '../src/lib/matchData';
import { PLAYERS } from '../src/lib/seedData';
const env=readFileSync('/Users/viratgandhi/cricket-scorer/.env.local','utf8');
const g=(k:string)=>env.match(new RegExp(`^${k}=(.*)$`,'m'))?.[1]?.trim()??'';
const BASE=g('VITE_SUPABASE_URL').replace(/\/$/,'')+'/rest/v1';
const KEY=g('VITE_SUPABASE_ANON_KEY'); const H={apikey:KEY,Authorization:`Bearer ${KEY}`,'Content-Type':'application/json'};
const q=async(p:string)=>JSON.parse(await (await fetch(`${BASE}/${p}`,{headers:H})).text());
const pid=(name:string)=>{const p=PLAYERS.find(x=>x.name===name); if(!p) throw new Error('no player '+name); return p.id;};
const nm=(id:string)=>PLAYERS.find(p=>p.id===id)?.name??id.slice(-4);

// M1..M8 innings, indexed 0..7
const games=ALL_MATCHES.slice(0,8).map(r=>({i1:r.innings1_id,i2:r.innings2_id}));
// adjustments: [playerName, delta, preferredGameIdx]  (idx 0=M1 ... 7=M8)
const ADJ:[string,number,number][]=[
  // removes
  ['Aarya Sadhani',-2,3],['Devanshi Shah',-1,5],['Shayna Shah',-1,4],['Payal Shah',-1,3],
  ['Amita Tejani',-1,3],['Raina Mehta',-1,3],['Nimisha',-1,4],
  // adds
  ['Mita Donda',+1,2],['Mita Donda',+1,4],['Neelam Vanani',+1,0],['Hetal Gandhi',+1,3],
  ['Pal Shah',+1,7],['Siya Shah',+1,5],['Heena Korat',+1,7],['Dhun Tejani',+1,7],
  ['Urvashi Patel',+1,6],['Ahana Javeri',+1,4],
];
// fetch all M1-M8 deliveries
const allInns=games.flatMap(g=>[g.i1,g.i2]);
const dels:any[]=[];
for(let off=0;;off+=1000){
  const page=await q(`deliveries?innings_id=in.(${allInns.join(',')})&is_deleted=eq.false&select=id,innings_id,bowler_id,striker_id,is_wicket,legal_ball,runs_off_bat,wicket_type&order=id.asc&offset=${off}&limit=1000`);
  dels.push(...page); if(page.length<1000) break;
}
const byInn:Record<string,any[]>={}; for(const d of dels)(byInn[d.innings_id]??=[]).push(d);
const used=new Set<string>();
const changes:{id:string,body:any}[]=[];
function innsOfGame(idx:number){return [games[idx].i1,games[idx].i2];}
function pickAll(player:string){ // all their deliveries across M1-M8 with game idx
  const id=pid(player); const out:{d:any,idx:number}[]=[];
  games.forEach((g,idx)=>{for(const inn of [g.i1,g.i2])for(const d of (byInn[inn]||[]))if(d.bowler_id===id)out.push({d,idx});});
  return out;
}
for(const [player,delta,pref] of ADJ){
  const id=pid(player); const mine=pickAll(player);
  const n=Math.abs(delta);
  for(let k=0;k<n;k++){
    let cand;
    if(delta<0){ // remove a wicket: prefer pref game
      const pool=mine.filter(x=>x.d.is_wicket&&!used.has(x.d.id));
      cand=(pool.find(x=>x.idx===pref)??pool[0])?.d;
      if(!cand){console.error('NO WICKET to remove for',player);process.exit(1);}
      changes.push({id:cand.id,body:{is_wicket:false,wicket_type:null,dismissed_player_id:null,fielder_id:null}});
    } else { // add: prefer a dot legal ball in pref game
      const pool=mine.filter(x=>!x.d.is_wicket&&x.d.legal_ball&&!used.has(x.d.id));
      cand=(pool.find(x=>x.idx===pref&&x.d.runs_off_bat===0)??pool.find(x=>x.idx===pref)??pool.find(x=>x.d.runs_off_bat===0)??pool[0])?.d;
      if(!cand){console.error('NO ball to add wicket for',player);process.exit(1);}
      changes.push({id:cand.id,body:{is_wicket:true,wicket_type:'bowled',dismissed_player_id:cand.striker_id}});
    }
    used.add(cand.id);
    // reflect in memory for verification
    cand.is_wicket=delta>0;
  }
}
// VERIFY: recompute per-player wickets across M1-M8 after changes
const now:Record<string,number>={};
for(const d of dels){ if(d.is_wicket) now[d.bowler_id]=(now[d.bowler_id]??0)+1; }
const sheet:Record<string,number>={ 'Swati Kshirsagar':1,'Shayna Shah':2,'Daya Patel':3,'Urvi Mehta':3,'Yashvi Shah':3,'Rashi Shah':1,'Ahana Javeri':2,'Ritika Verma':1,'Hetal Vanani':2,'Shonaya Mehta':1,'Bina Mehta':2,'Vaibhavi':1,'Hiya Gandhi':1,'Neelam Vanani':7,'Akanksha':3,'Khushi Shah':5,'Urvashi Patel':2,'Peher Modi':2,'Payal Kothari':3,'Diya Shah':3,'Angana Javeri':4,'Ayushi Shah':3,'Payal Shah':2,'Viha Variya':1,'Hetal Gandhi':6,'Aarya Sadhani':5,'Amita Tejani':2,'Rachna Dugar':3,'Dhun Tejani':2,'Heena Korat':3,'Disha Sanghvi':2,'Mita Donda':5,'Nishtha':5,'Shikha Mehta':2,'Hetal Javeri':2,'Pal Shah':4,'Siya Shah':4,'Devanshi Shah':4,'Hetal Shah':1,'Ankita Mehta':1,'Ronak Shah':2 };
console.log(`Planned delivery changes: ${changes.length}`);
let ok=true;
const allNames=new Set([...Object.values(now).map(()=>'') , ...Object.keys(sheet)]);
for(const [name,target] of Object.entries(sheet)){ const got=now[pid(name)]??0; if(got!==target){ok=false; console.log(`  MISMATCH ${name}: got ${got} want ${target}`);} }
// also ensure no unexpected player changed
for(const [bid,c] of Object.entries(now)){ const name=nm(bid); if(!(name in sheet)) console.log(`  NOTE extra bowler with wkts: ${name}=${c}`); }
console.log(ok?'\n✅ All M1-M8 per-player wickets match the sheet after changes.':'\n❌ MISMATCH — not applying.');
if(process.argv[2]==='apply' && ok){
  for(const c of changes){ const r=await fetch(`${BASE}/deliveries?id=eq.${c.id}`,{method:'PATCH',headers:H,body:JSON.stringify(c.body)}); if(!r.ok){console.error('PATCH FAIL',await r.text());process.exit(1);} }
  console.log(`APPLIED ${changes.length} changes.`);
}
