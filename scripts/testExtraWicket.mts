import { reducer, buildInitialState } from '../src/context/GameContext';
import { getMatchRecord } from '../src/lib/matchData';
import { PLAYERS } from '../src/lib/seedData';

const mId='00000000-0000-0000-0004-000000000001';
let s=buildInitialState(mId);
const home=s.match.home_team_id, away=s.match.away_team_id;
const bat=PLAYERS.filter(p=>p.team_id===home).map(p=>p.id);
const bowl=PLAYERS.filter(p=>p.team_id===away).map(p=>p.id);
const WV=s.match.settings.wide_value, NV=s.match.settings.no_ball_value, DP=s.match.settings.dismissal_penalty;
s=reducer(s,{type:'RECORD_TOSS',winner_team_id:home,elected:'bat'} as any);
s=reducer(s,{type:'SELECT_PAIR',player1_id:bat[0],player2_id:bat[1]} as any);
s=reducer(s,{type:'SET_BOWLER',bowler_id:bowl[0]} as any);
const del=(s:any)=>s.inn1.deliveries.filter((d:any)=>!d.is_deleted);
const last=(s:any)=>del(s).slice(-1)[0];
const rec=(p:any)=>{s=reducer(s,{type:'RECORD_DELIVERY',payload:p} as any);const d=last(s);return `extra=${d.extra_type} val=${d.extra_value} wkt=${d.is_wicket}/${d.wicket_type||'-'} fielder=${d.fielder_id?'set':'-'} net=${d.net_run_effect}`;};

console.log('wide + run out (2 completed):', rec({runs_off_bat:0,extra_type:'wide',extra_value:WV+2,is_wicket:true,wicket_type:'run_out',fielder_id:bowl[3]}),`(expect val=${WV+2} net=${WV+2+DP})`);
console.log('wide + stumped (0):       ', rec({runs_off_bat:0,extra_type:'wide',extra_value:WV,is_wicket:true,wicket_type:'stumped',fielder_id:bowl[2]}),`(expect val=${WV} net=${WV+DP})`);
console.log('no-ball + run out (1):    ', rec({runs_off_bat:0,extra_type:'no_ball',extra_value:NV+1,is_wicket:true,wicket_type:'run_out',fielder_id:bowl[3]}),`(expect val=${NV+1} net=${NV+1+DP})`);
console.log('plain wide (no wicket):   ', rec({runs_off_bat:0,extra_type:'wide',extra_value:WV,is_wicket:false}),`(expect wkt=false net=${WV})`);
