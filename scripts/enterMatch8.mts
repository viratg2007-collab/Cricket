import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { deriveMatchState } from '../src/lib/engine';
import { getMatchRecord, getPairsForTeam } from '../src/lib/matchData';
import { TEAM } from '../src/lib/ids';
import { PLAYERS } from '../src/lib/seedData';
import type { Delivery } from '../src/lib/types';

const env=readFileSync('/Users/viratgandhi/cricket-scorer/.env.local','utf8');
const g=(k:string)=>env.match(new RegExp(`^${k}=(.*)$`,'m'))?.[1]?.trim()??'';
const BASE=g('VITE_SUPABASE_URL').replace(/\/$/,'')+'/rest/v1';
const KEY=g('VITE_SUPABASE_ANON_KEY'); const H={apikey:KEY,Authorization:`Bearer ${KEY}`,'Content-Type':'application/json'};
const pid=(n:number)=>`00000000-0000-0000-0002-${n.toString(16).padStart(12,'0')}`;
const nm=(id:string)=>PLAYERS.find(p=>p.id===id)?.name??id;
const M8=getMatchRecord('00000000-0000-0000-0004-000000000008')!;
const S=M8.match.settings;

// SS ids 1..14, NA ids 15..28
const SS={disha:pid(1),meeta:pid(2),diya:pid(3),nishtha:pid(4),f:[5,6,7,8,9,10,11,12].map(pid)};
const NA={siya:pid(15),devanshi:pid(19),f:[16,17,18,20,21,22,23,24,25,26,27,28].map(pid)};

type Ball={f:0|1;r:number;w?:boolean};
interface PairSpec{p1:string;p2:string;balls:Ball[]}
// build 72 deliveries for an innings given 6 pair specs + 12 bowlers (per over)
function build(inningsId:string,pairIds:string[],pairs:PairSpec[],bowlers:string[]):Delivery[]{
  const out:Delivery[]=[]; let seq=0;
  for(let pi=0;pi<6;pi++){
    const ps=pairs[pi]; const facer=(f:0|1)=>f===0?ps.p1:ps.p2;
    for(let bi=0;bi<12;bi++){
      const b=ps.balls[bi]; const globalBall=pi*12+bi; const over=Math.floor(globalBall/6);
      const striker=facer(b.f); const non=facer(b.f===0?1:0);
      const next=ps.balls[bi+1];
      const strike_changed = bi<11 ? (next.f!==b.f) : false;
      seq++;
      out.push({id:randomUUID(),
        innings_id:inningsId,pair_id:pairIds[pi],over_number:over,ball_in_over:globalBall%6,sequence_number:seq,is_deleted:false,
        striker_id:striker,non_striker_id:non,bowler_id:bowlers[over],runs_off_bat:b.r,extra_type:'none',extra_value:0,
        is_wicket:!!b.w,wicket_type:(b.w?'bowled':null) as any,dismissed_player_id:(b.w?striker:null) as any,
        net_run_effect:b.r-(b.w?2:0),legal_ball:true,strike_changed,created_at:new Date().toISOString()});
    }
  }
  return out;
}
// helper to make a batter's ball block: array of {f,r,w}
const B=(f:0|1,r:number,w=false):Ball=>({f,r,w});

// ============ INNINGS 1 — Sparkle bat (net 92) ============
const ssPairs=getPairsForTeam(TEAM.SS,M8.match.id).map(p=>p.id);
const i1Bowlers=[ // over 0..11 : Nishant bowlers. Devanshi->6,8 ; Siya(NA f?) actually Siya is NA id15
  NA.f[0],NA.f[1], NA.f[2],NA.f[3], NA.f[0],NA.f[1], NA.devanshi,NA.siya, NA.devanshi,NA.siya, NA.f[2],NA.f[3]];
// pairs: p1 faces first block. balls[12] each.
const i1Pairs:PairSpec[]=[
  // pair0: Nishtha(0) 8b=12(2x4), Meeta filler(1) 4b=4
  {p1:SS.nishtha,p2:SS.meeta,balls:[B(0,4),B(0,4),B(0,1),B(0,1),B(0,1),B(0,1),B(0,0),B(0,0),B(1,1),B(1,1),B(1,1),B(1,1)]},
  // pair1: Disha(0) 5b=7(1x4), filler(1) 7b=8
  {p1:SS.disha,p2:SS.f[0],balls:[B(0,4),B(0,1),B(0,1),B(0,1),B(0,0),B(1,2),B(1,1),B(1,1),B(1,1),B(1,1),B(1,1),B(1,1)]},
  // pair2: fillers, 21 runs
  {p1:SS.f[1],p2:SS.f[2],balls:[B(0,2),B(0,2),B(0,2),B(0,2),B(0,2),B(0,1),B(1,2),B(1,2),B(1,2),B(1,2),B(1,1),B(1,1)]},
  // pair3: Diya(0) over6=Devanshi 6b=4 then out; fillerE(1) over7=Siya 6b=8(1w)
  {p1:SS.diya,p2:SS.f[3],balls:[B(0,1),B(0,1),B(0,1),B(0,1),B(0,0),B(0,0,true),B(1,2),B(1,2),B(1,2),B(1,0,true),B(1,1),B(1,1)]},
  // pair4: fillerF(0) over8=Devanshi 6b=9(2w); fillerG(1) over9=Siya 6b=8(1w)
  {p1:SS.f[4],p2:SS.f[5],balls:[B(0,3),B(0,2),B(0,0,true),B(0,2),B(0,0,true),B(0,2),B(1,2),B(1,2),B(1,2),B(1,0,true),B(1,1),B(1,1)]},
  // pair5: fillers 21 runs
  {p1:SS.f[6],p2:SS.f[7],balls:[B(0,2),B(0,2),B(0,2),B(0,2),B(0,2),B(0,1),B(1,2),B(1,2),B(1,2),B(1,2),B(1,1),B(1,1)]},
];
const inn1=build(M8.innings1_id,ssPairs,i1Pairs,i1Bowlers);

// ============ INNINGS 2 — Nishant bat (net 56) ============
const naPairs=getPairsForTeam(TEAM.NA,M8.match.id).map(p=>p.id);
const i2Bowlers=[ // Sparkle bowlers. Meeta->2,4 ; Disha->3,6 ; Nishtha->5,7 ; fillers 0,1,8,9,10,11
  SS.f[0],SS.f[1], SS.meeta,SS.disha, SS.meeta,SS.nishtha, SS.disha,SS.nishtha, SS.f[2],SS.f[3], SS.f[4],SS.f[5]];
const i2Pairs:PairSpec[]=[
  // pair0: Siya(0) 5b=9(1x6), filler 7b=5
  {p1:NA.siya,p2:NA.f[0],balls:[B(0,6),B(0,1),B(0,1),B(0,1),B(0,0),B(1,1),B(1,1),B(1,1),B(1,1),B(1,1),B(1,0),B(1,0)]},
  // pair1 overs2,3 = Meeta(2 wkt,6 runs over2) then Disha over3(0 wkt,3 runs)
  {p1:NA.f[1],p2:NA.f[2],balls:[B(0,2),B(0,2),B(0,0,true),B(0,2),B(0,0,true),B(0,0),B(1,1),B(1,0),B(1,1),B(1,0),B(1,1),B(1,0)]},
  // pair2 overs4,5 = Meeta over4(1 wkt,7 runs), Nishtha over5(1 wkt,4 runs)
  {p1:NA.f[3],p2:NA.f[4],balls:[B(0,2),B(0,2),B(0,2),B(0,0,true),B(0,1),B(0,0),B(1,1),B(1,1),B(1,0,true),B(1,1),B(1,1),B(1,0)]},
  // pair3 overs6,7 = Disha over6(1 wkt,3 runs), Nishtha over7(1 wkt,4 runs)
  {p1:NA.f[5],p2:NA.f[6],balls:[B(0,1),B(0,1),B(0,0,true),B(0,1),B(0,0),B(0,0),B(1,1),B(1,1),B(1,0,true),B(1,1),B(1,0),B(1,1)]},
  // pair4,5 fillers to fill remaining. Need net 56 total (gross 68 - 2x6 wkts).
  {p1:NA.f[7],p2:NA.f[8],balls:[B(0,3),B(0,2),B(0,1),B(0,1),B(0,1),B(0,0),B(1,3),B(1,2),B(1,1),B(1,1),B(1,1),B(1,0)]},
  {p1:NA.f[9],p2:NA.f[10],balls:[B(0,2),B(0,1),B(0,1),B(0,1),B(0,1),B(0,0),B(1,2),B(1,1),B(1,1),B(1,1),B(1,0),B(1,0)]},
];
const inn2=build(M8.innings2_id,naPairs,i2Pairs,i2Bowlers);

// ============ VERIFY ============
function stats(dels:Delivery[]){
  const bat:Record<string,{r:number;b:number;d:number}>={},bowl:Record<string,{r:number;w:number;lb:number}>={};
  // facing striker walk per pair
  const groups:Record<string,Delivery[]>={}; for(const d of dels)(groups[d.pair_id]??=[]).push(d);
  const face:Record<string,string>={};
  for(const gr of Object.values(groups)){const o=[...gr].sort((a,b)=>a.sequence_number-b.sequence_number);const f=o[0];let p1=f.striker_id,p2=f.non_striker_id,isP1=true;for(const d of o){face[d.id]=isP1?p1:p2;if(d.strike_changed)isP1=!isP1;}}
  for(const d of dels){const s=face[d.id];bat[s]??={r:0,b:0,d:0};bat[s].r+=d.runs_off_bat;if(d.legal_ball)bat[s].b++;if(d.is_wicket)bat[s].d++;
    bowl[d.bowler_id]??={r:0,w:0,lb:0};bowl[d.bowler_id].r+=d.runs_off_bat+d.extra_value;if(d.is_wicket)bowl[d.bowler_id].w++;if(d.legal_ball)bowl[d.bowler_id].lb++;}
  return {bat,bowl};
}
function report(name:string,dels:Delivery[],pairs:string[]){
  const d=deriveMatchState(dels,getPairsForTeam(name.includes('Sparkle')?TEAM.SS:TEAM.NA,M8.match.id),S);
  const st=stats(dels);
  console.log(`\n== ${name} ==  net total: ${d.total}  legal balls: ${dels.filter(x=>x.legal_ball).length}`);
  console.log('  Batters (award):'); for(const id of Object.keys(st.bat)){const r=st.bat[id];if(r.r>=4||r.d>0)console.log(`    ${nm(id).padEnd(16)} ${r.r} (${r.b}b)${r.d?' out×'+r.d:''}`);}
  console.log('  Bowlers:'); for(const id of Object.keys(st.bowl)){const w=st.bowl[id];if(w.w>0)console.log(`    ${nm(id).padEnd(16)} ${w.w}/${w.r} (${w.lb/6} ov)`);}
}
report('Sparkle Strikers (inn1)',inn1,ssPairs);
report("Nishant's Angles (inn2)",inn2,naPairs);

async function softDeleteInnings(id:string){
  const rows=JSON.parse(await (await fetch(`${BASE}/deliveries?innings_id=eq.${id}&is_deleted=eq.false&select=id`,{headers:H})).text());
  const ids=rows.map((r:any)=>r.id);
  for(let i=0;i<ids.length;i+=50){const chunk=ids.slice(i,i+50);
    const res=await fetch(`${BASE}/deliveries?id=in.(${chunk.join(',')})`,{method:'PATCH',headers:H,body:JSON.stringify({is_deleted:true})});
    if(!res.ok){console.error('SOFT-DEL FAIL:',await res.text());process.exit(1);}}
  console.log('soft-deleted',ids.length,'from',id);
}
async function insertDels(dels:Delivery[]){
  for(let i=0;i<dels.length;i+=40){const chunk=dels.slice(i,i+40);const res=await fetch(`${BASE}/deliveries`,{method:'POST',headers:H,body:JSON.stringify(chunk)});if(!res.ok){console.error('INSERT FAIL:',await res.text());process.exit(1);}}
  console.log('inserted',dels.length);
}
if(process.argv[2]==='insert'){ await insertDels([...inn1,...inn2]); }
if(process.argv[2]==='fix-inn1'){ await softDeleteInnings(M8.innings1_id); await insertDels(inn1); console.log('inn1 rebuilt clean.'); }
