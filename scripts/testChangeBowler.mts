import { reducer, buildInitialState } from '../src/context/GameContext';
import { deriveMatchState } from '../src/lib/engine';
import { PLAYERS } from '../src/lib/seedData';

const mId='00000000-0000-0000-0004-000000000001';
let s=buildInitialState(mId);
const home=s.match.home_team_id, away=s.match.away_team_id;
const bat=PLAYERS.filter(p=>p.team_id===home).map(p=>p.id);
const bowl=PLAYERS.filter(p=>p.team_id===away).map(p=>p.id);
const A=bowl[0], B=bowl[1], C=bowl[2];
s=reducer(s,{type:'RECORD_TOSS',winner_team_id:home,elected:'bat'} as any);
s=reducer(s,{type:'SELECT_PAIR',player1_id:bat[0],player2_id:bat[1]} as any);
const del=(s:any)=>s.inn1.deliveries.filter((d:any)=>!d.is_deleted);
const rec=(r:number)=>{s=reducer(s,{type:'RECORD_DELIVERY',payload:{runs_off_bat:r,extra_type:'none',extra_value:0,is_wicket:false}} as any);};

// Over 0 by A (6 balls, 2 runs each = 12)
s=reducer(s,{type:'SET_BOWLER',bowler_id:A} as any);
for(let i=0;i<6;i++) rec(2);
// Over 1: pick B, bowl 3 balls (1 run each), then realise it should be C
s=reducer(s,{type:'SET_BOWLER',bowler_id:B} as any);
rec(1); rec(1); rec(1);
const totalBefore=deriveMatchState(del(s),s.inn1.pairs,s.match.settings).total;
console.log('before change: total=',totalBefore,' over1 bowler=',del(s).filter((d:any)=>d.over_number===1).map((d:any)=>d.bowler_id===B?'B':'?').join(','));
// CHANGE_BOWLER to C
s=reducer(s,{type:'CHANGE_BOWLER',bowler_id:C} as any);
const o0=del(s).filter((d:any)=>d.over_number===0);
const o1=del(s).filter((d:any)=>d.over_number===1);
const totalAfter=deriveMatchState(del(s),s.inn1.pairs,s.match.settings).total;
console.log('after change:');
console.log('  over 0 bowler (expect all A):', o0.every((d:any)=>d.bowler_id===A)?'A all ✅':'❌ '+o0.map((d:any)=>d.bowler_id));
console.log('  over 1 bowler (expect all C):', o1.every((d:any)=>d.bowler_id===C)?'C all ✅':'❌');
console.log('  current_bowler_id (expect C):', s.current_bowler_id===C?'C ✅':'❌');
console.log('  total preserved:', totalAfter===totalBefore?totalAfter+' ✅':'❌ '+totalAfter);
const der=deriveMatchState(del(s),s.inn1.pairs,s.match.settings);
console.log('  B figures gone / C has over1 runs:', `B runs=${der.bowler_runs[B]??0} C runs=${der.bowler_runs[C]??0} (expect B=0, C=3)`);
// continue over 1 with C: next ball credited to C
rec(4);
console.log('  next ball bowler (expect C):', del(s).slice(-1)[0].bowler_id===C?'C ✅':'❌');
