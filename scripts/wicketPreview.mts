import { readFileSync } from 'node:fs';
import { ALL_MATCHES } from '../src/lib/matchData';
import { PLAYERS } from '../src/lib/seedData';
const env=readFileSync('/Users/viratgandhi/cricket-scorer/.env.local','utf8');
const g=(k:string)=>env.match(new RegExp(`^${k}=(.*)$`,'m'))?.[1]?.trim()??'';
const BASE=g('VITE_SUPABASE_URL').replace(/\/$/,'')+'/rest/v1';
const KEY=g('VITE_SUPABASE_ANON_KEY'); const H={apikey:KEY,Authorization:`Bearer ${KEY}`};
const q=async(p:string)=>JSON.parse(await (await fetch(`${BASE}/${p}`,{headers:H})).text());
const nm=(id:string)=>PLAYERS.find(p=>p.id===id)?.name??id.slice(-4);

// SHEET totals through yesterday (M1-M8) — Ratnesh's authoritative doc
const sheet:Record<string,number>={
 'Swati Kshirsagar':1,'Shayna Shah':2,'Daya Patel':3,'Urvi Mehta':3,'Yashvi Shah':3,'Rashi Shah':1,'Ahana Javeri':2,'Ritika Verma':1,
 'Hetal Vanani':2,'Shonaya Mehta':1,'Bina Mehta':2,'Vaibhavi':1,'Hiya Gandhi':1,'Neelam Vanani':7,'Akanksha':3,
 'Khushi Shah':5,'Urvashi Patel':2,'Peher Modi':2,'Payal Kothari':3,'Diya Shah':3,
 'Angana Javeri':4,'Ayushi Shah':3,'Payal Shah':2,'Viha Variya':1,'Hetal Gandhi':6,'Aarya Sadhani':5,'Amita Tejani':2,
 'Rachna Dugar':3,'Dhun Tejani':2,'Heena Korat':3,'Disha Sanghvi':2,'Mita Donda':5,'Nishtha':5,'Shikha Mehta':2,
 'Hetal Javeri':2,'Pal Shah':4,'Siya Shah':4,'Devanshi Shah':4,'Hetal Shah':1,'Ankita Mehta':1,'Ronak Shah':2,
};

// Today's games = women's matches beyond M8 that have deliveries
const today:Record<string,number>={};
const todayGames:string[]=[];
for(const rec of ALL_MATCHES.slice(8)){
  const w=await q(`deliveries?innings_id=in.(${rec.innings1_id},${rec.innings2_id})&is_deleted=eq.false&is_wicket=eq.true&select=bowler_id`);
  if(w.length===0) continue;
  const mnum=parseInt(rec.match.id.slice(-2),16);
  todayGames.push(`M${mnum} ${rec.roundLabel||''} (${w.length} wkts)`);
  for(const x of w) today[nm(x.bowler_id)]=(today[nm(x.bowler_id)]??0)+1;
}
console.log("TODAY'S GAMES SCORED:", todayGames.length? todayGames.join(' · '):'(none scored yet)');
console.log("\nTODAY'S WICKETS:", Object.keys(today).length? Object.entries(today).sort((a,b)=>b[1]-a[1]).map(([n,v])=>`${n} ${v}`).join(', '):'(none)');

// Combine
const names=new Set([...Object.keys(sheet),...Object.keys(today)]);
const final:[string,number,number,number][]=[];
for(const n of names) final.push([n, (sheet[n]??0)+(today[n]??0), sheet[n]??0, today[n]??0]);
final.sort((a,b)=>b[1]-a[1]);
console.log('\n=== FINAL MOST WICKETS (corrected yesterday + today) ===');
console.log('Rank Player               Total  (yday + today)');
final.filter(f=>f[1]>0).forEach((f,i)=>console.log(`${String(i+1).padStart(2)}  ${f[0].padEnd(20)} ${String(f[1]).padStart(2)}     (${f[2]} + ${f[3]})`));
