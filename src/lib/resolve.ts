// Tournament-agnostic lookups: women's and men's IDs never collide, so we can
// resolve any match/team/player/pairs/par by id. Lets the shared viewer & scorer
// screens serve both tournaments without touching the women's logic.
import type { Player, Team, Pair } from './types';
import { getMatchRecord, getPairsForTeam, computeParScore } from './matchData';
import { PLAYERS, TEAMS } from './seedData';
import { ALL_MATCHES } from './matchData';
import { getMensMatch, mensPairs, computeMensParScore, MENS_PLAYERS, MENS_TEAMS, MENS_MATCHES } from './mensData';

export function isMensId(id: string): boolean { return !!getMensMatch(id); }
export function isMensPlayer(id: string): boolean { return MENS_PLAYERS.some(p => p.id === id); }

export interface AnyMatch {
  match: { id: string; name: string; home_team_id: string; away_team_id: string; settings: import('./types').MatchSettings; status: string };
  innings1_id: string; innings2_id: string;
  round: 1 | 2 | 'rr' | 'final';
  roundLabel: string;
}

export function anyMatchRecord(id: string): AnyMatch | undefined {
  const m = getMensMatch(id);
  if (m) return { match: m.match, innings1_id: m.innings1_id, innings2_id: m.innings2_id, round: m.round, roundLabel: m.roundLabel };
  const w = getMatchRecord(id);
  if (w) return { match: w.match, innings1_id: w.innings1_id, innings2_id: w.innings2_id, round: w.round, roundLabel: w.roundLabel };
  return undefined;
}

export function anyPairs(teamId: string, matchId: string): Pair[] {
  return isMensId(matchId) ? mensPairs(teamId, matchId) : getPairsForTeam(teamId, matchId);
}
export function anyPlayer(id: string): Player | undefined {
  return PLAYERS.find(p => p.id === id) ?? MENS_PLAYERS.find(p => p.id === id);
}
export function anyTeam(id: string): Team | undefined {
  return TEAMS.find(t => t.id === id) ?? MENS_TEAMS.find(t => t.id === id);
}
export async function anyPar(matchId: string): Promise<number> {
  return isMensId(matchId) ? computeMensParScore() : computeParScore();
}
export function anyPlayersOfTeam(teamId: string): Player[] {
  const w = PLAYERS.filter(p => p.team_id === teamId);
  return w.length ? w : MENS_PLAYERS.filter(p => p.team_id === teamId);
}
// Ordered schedule for the SAME tournament the match belongs to (for "next match").
export function anySchedule(matchId: string): { match: { id: string; status: string } }[] {
  return isMensId(matchId)
    ? MENS_MATCHES.map(r => ({ match: { id: r.match.id, status: r.match.status } }))
    : ALL_MATCHES.map(r => ({ match: { id: r.match.id, status: r.match.status } }));
}
