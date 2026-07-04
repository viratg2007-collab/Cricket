import { reducer, buildInitialState } from '../src/context/GameContext';
import { deriveMatchState } from '../src/lib/engine';
import { getMatchRecord } from '../src/lib/matchData';
import { PLAYERS } from '../src/lib/seedData';

const mId='00000000-0000-0000-0004-000000000001'; // women's M1
let s=buildInitialState(mId);
const home=s.match.home_team_id, away=s.match.away_team_id;
const bat=PLAYERS.filter(p=>p.team_id===home).map(p=>p.id);
const bowl=PLAYERS.filter(p=>p.team_id===away).map(p=>p.id);
const A=bowl[0], B=bowl[1];
const settings=s.match.settings;
const activeDel=(st:any)=> (st.activeInnings===1?st.inn1:st.inn2);

s=reducer(s,{type:'RECORD_TOSS',winner_team_id:home,elected:'bat'} as any);
s=reducer(s,{type:'SELECT_PAIR',player1_id:bat[0],player2_id:bat[1]} as any);
s=reducer(s,{type:'SET_BOWLER',bowler_id:A} as any);
// record a full over: 6 legal balls (all 0 runs to avoid strike flips messing pair)
for(let i=0;i<6;i++) s=reducer(s,{type:'RECORD_DELIVERY',payload:{runs_off_bat:0,extra_type:'none',extra_value:0,is_wicket:false}} as any);
console.log('after over: phase=',s.phase,' (expect end_of_over)  bowler=',s.current_bowler_id===A?'A':s.current_bowler_id);
// pick NEW bowler B for next over
s=reducer(s,{type:'SET_BOWLER',bowler_id:B} as any);
console.log('picked B: bowler=',s.current_bowler_id===B?'B':s.current_bowler_id,' phase=',s.phase);
// UNDO the last ball of previous over
s=reducer(s,{type:'UNDO'} as any);
console.log('ISSUE 1 -> after UNDO: bowler=',s.current_bowler_id===A?'A ✅ (restored)':(s.current_bowler_id===B?'B ❌ STILL NEW':s.current_bowler_id),' phase=',s.phase);
// re-record the ball; it must be credited to A
s=reducer(s,{type:'RECORD_DELIVERY',payload:{runs_off_bat:1,extra_type:'none',extra_value:0,is_wicket:false}} as any);
const last=activeDel(s).deliveries.filter((d:any)=>!d.is_deleted).slice(-1)[0];
console.log('   re-bowled ball credited to:', last.bowler_id===A?'A ✅':last.bowler_id===B?'B ❌':last.bowler_id);

// ISSUE 2: immediate swap flips current striker
let s2=buildInitialState(mId);
s2=reducer(s2,{type:'RECORD_TOSS',winner_team_id:home,elected:'bat'} as any);
s2=reducer(s2,{type:'SELECT_PAIR',player1_id:bat[0],player2_id:bat[1]} as any);
s2=reducer(s2,{type:'SET_BOWLER',bowler_id:A} as any);
const strikerBefore=deriveMatchState(activeDel(s2).deliveries,activeDel(s2).pairs,settings).striker_id;
s2=reducer(s2,{type:'MANUAL_SWAP_STRIKE'} as any);
const strikerAfter=deriveMatchState(activeDel(s2).deliveries,activeDel(s2).pairs,settings).striker_id;
console.log('ISSUE 2 -> striker before swap:',strikerBefore===bat[0]?'P1':'P2',' after swap:',strikerAfter===bat[1]?'P2 ✅ (flipped same-ball)':strikerAfter===bat[0]?'P1 ❌ no change':'?');
// the very next recorded ball is credited to the swapped striker
s2=reducer(s2,{type:'RECORD_DELIVERY',payload:{runs_off_bat:2,extra_type:'none',extra_value:0,is_wicket:false}} as any);
const b2=activeDel(s2).deliveries.filter((d:any)=>!d.is_deleted&&d.legal_ball).slice(-1)[0];
console.log('   next ball faced by:', b2.striker_id===bat[1]?'P2 ✅ (swap applied to this ball)':'P1 ❌');
