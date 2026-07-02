import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { deriveMatchState, reconstructPairs, runRate } from '../lib/engine';
import { supabaseEnabled, fetchDeliveries, fetchMatchToss } from '../lib/supabase';
import { ALL_MATCHES, computeMatchOverviews, computeGroupTables, getPairsForTeam, getMatchRecord, resolveSlot, slotLabel } from '../lib/matchData';
import type { MatchStatus, MatchOverview, GroupTable, Bracket, MatchRecord } from '../lib/matchData';
import { PLAYERS, TEAMS } from '../lib/seedData';
import { loadTournamentStats } from '../lib/tournamentStats';
import { BallDot } from '../components/BallDot';
import type { Delivery, DerivedMatchState } from '../lib/types';
import type { TournamentStats } from '../lib/tournamentStats';

type Tab = 'matches' | 'fixtures' | 'table' | 'squads';

function playerName(id: string) { return PLAYERS.find(p => p.id === id)?.name ?? '?'; }
function teamName(id: string) { return TEAMS.find(t => t.id === id)?.name ?? id; }
function teamShort(id: string) { return TEAMS.find(t => t.id === id)?.short_name ?? '?'; }

const EMPTY_BRACKET: Bracket = { aRank: [], bRank: [], groupC: [], groupD: [], cRank: [], dRank: [], round1Complete: false, round2Complete: false, finalHome: '', finalAway: '' };

// Display name for a match side: resolved team name, or the placeholder label (e.g. "2nd Group B").
function slotName(slot: string, b: Bracket): string {
  const resolved = resolveSlot(slot, b);
  return resolved ? teamName(resolved) : slotLabel(slot);
}
function slotShort(slot: string, b: Bracket): string {
  const resolved = resolveSlot(slot, b);
  return resolved ? teamShort(resolved) : slotLabel(slot);
}

interface Side { id: string; name: string; short: string; score: number | null; }
// The two sides of a match in display order. Once played we use the actual batting
// teams (toss-proof); before that we use the resolved-or-placeholder slot names.
function matchSides(rec: MatchRecord, ov: MatchOverview | undefined, b: Bracket): [Side, Side] {
  if (ov && ov.status !== 'scheduled' && ov.t1) {
    return [
      { id: ov.t1, name: teamName(ov.t1), short: teamShort(ov.t1), score: ov.s1 },
      { id: ov.t2, name: teamName(ov.t2), short: teamShort(ov.t2), score: ov.s2 },
    ];
  }
  return [
    { id: '', name: slotName(rec.homeSlot, b), short: slotShort(rec.homeSlot, b), score: null },
    { id: '', name: slotName(rec.awaySlot, b), short: slotShort(rec.awaySlot, b), score: null },
  ];
}
function winnerOf(sides: [Side, Side]): 'home' | 'away' | 'tie' | null {
  const [a, c] = sides;
  if (a.score === null || c.score === null) return null;
  return a.score > c.score ? 'home' : c.score > a.score ? 'away' : 'tie';
}

interface LiveMatchState {
  matchId: string;
  inn1: { deliveries: Delivery[]; derived: DerivedMatchState };
  inn2: { deliveries: Delivery[]; derived: DerivedMatchState | null };
  activeInnings: 1 | 2;
  currentBowlerName?: string;
  toss?: { winner_id: string | null; elected: 'bat' | 'bowl' | null } | null;
}

function readLocalDeliveries(matchId: string, inning: 1 | 2): Delivery[] {
  try {
    const raw = localStorage.getItem(`cricket_match_${matchId}_v2`);
    if (!raw) return [];
    const st = JSON.parse(raw) as { inn1?: { deliveries?: Delivery[] }; inn2?: { deliveries?: Delivery[] } };
    const d = inning === 1 ? st.inn1?.deliveries : st.inn2?.deliveries;
    return (d ?? []).filter(d => !d.is_deleted);
  } catch { return []; }
}

import type { Pair } from '../lib/types';

async function fetchRelayState(matchId: string): Promise<{
  inn1?: { deliveries?: Delivery[]; pairs?: Pair[] };
  inn2?: { deliveries?: Delivery[]; pairs?: Pair[] };
  toss?: { winner_id?: string | null; elected?: 'bat' | 'bowl' | null };
} | null> {
  if (supabaseEnabled) return null;
  try {
    const res = await fetch(`http://${window.location.hostname}:5180/state/${matchId}`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

function buildLiveState(matchId: string, d1: Delivery[], d2: Delivery[], pairs1Override?: Pair[] | null, pairs2Override?: Pair[] | null, toss?: LiveMatchState['toss']): LiveMatchState | null {
  const rec = getMatchRecord(matchId);
  if (!rec) return null;
  const pairs1 = reconstructPairs(d1, pairs1Override ?? getPairsForTeam(rec.match.home_team_id, matchId));
  const pairs2 = reconstructPairs(d2, pairs2Override ?? getPairsForTeam(rec.match.away_team_id, matchId));
  const derived1 = deriveMatchState(d1, pairs1, rec.match.settings);
  const derived2 = d2.length > 0 ? deriveMatchState(d2, pairs2, rec.match.settings) : null;
  const activeInnings: 1 | 2 = derived2 ? 2 : 1;
  const activeDels = activeInnings === 2 ? d2 : d1;
  const lastDel = [...activeDels].reverse().find(d => d.legal_ball && d.extra_type !== 'strike_override');
  const currentBowlerName = lastDel ? playerName(lastDel.bowler_id) : undefined;
  return { matchId, inn1: { deliveries: d1, derived: derived1 }, inn2: { deliveries: d2, derived: derived2 }, activeInnings, currentBowlerName, toss };
}

async function deriveLive(matchId: string): Promise<LiveMatchState | null> {
  // When Supabase is the backend it is the SINGLE SOURCE OF TRUTH. Read the live
  // card straight from the cloud so it always matches the Fixtures/Table and every
  // viewer device — never a device's stale localStorage (which caused the home card
  // and the fixture row to disagree).
  if (supabaseEnabled) {
    const rec = getMatchRecord(matchId);
    let d1: Delivery[] = [], d2: Delivery[] = [];
    if (rec) {
      [d1, d2] = await Promise.all([fetchDeliveries(rec.innings1_id), fetchDeliveries(rec.innings2_id)]);
    }
    const toss = await fetchMatchToss(matchId);
    return buildLiveState(matchId, d1, d2, null, null, toss);
  }

  // Local-network (relay) mode only: relay → this device's localStorage.
  let d1: Delivery[] = [], d2: Delivery[] = [];
  let pairs1Override: Pair[] | null = null, pairs2Override: Pair[] | null = null;
  let toss: LiveMatchState['toss'] = null;
  const relay = await fetchRelayState(matchId);
  if (relay) {
    d1 = (relay.inn1?.deliveries ?? []).filter(d => !d.is_deleted);
    d2 = (relay.inn2?.deliveries ?? []).filter(d => !d.is_deleted);
    const rp1 = (relay.inn1?.pairs ?? []).filter((p: Pair) => p.player1_id && p.player2_id);
    const rp2 = (relay.inn2?.pairs ?? []).filter((p: Pair) => p.player1_id && p.player2_id);
    if (rp1.length > 0) pairs1Override = rp1;
    if (rp2.length > 0) pairs2Override = rp2;
    if (relay.toss?.winner_id) toss = { winner_id: relay.toss.winner_id ?? null, elected: relay.toss.elected ?? null };
  }
  if (d1.length === 0) d1 = readLocalDeliveries(matchId, 1);
  if (d2.length === 0) d2 = readLocalDeliveries(matchId, 2);
  return buildLiveState(matchId, d1, d2, pairs1Override, pairs2Override, toss);
}

// ── Main component ─────────────────────────────────────────────────────────────

export function PublicHome() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('matches');
  const [tableRound, setTableRound] = useState<1 | 2>(1);
  const [tables, setTables] = useState<GroupTable[]>([]);
  const [bracket, setBracket] = useState<Bracket>(EMPTY_BRACKET);
  const [overviews, setOverviews] = useState<Record<string, MatchOverview>>({});
  const [liveStates, setLiveStates] = useState<Record<string, LiveMatchState>>({});
  const [tourStats, setTourStats] = useState<TournamentStats | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshSeqRef = useRef(0);

  const statusOf = (n: string): MatchStatus => overviews[n]?.status ?? 'scheduled';
  const liveMatches = ALL_MATCHES.filter(r => statusOf(r.match.id) === 'live');

  async function refreshAll() {
    // Guard against overlapping refreshes (realtime + poll + focus) resolving out of order.
    const seq = ++refreshSeqRef.current;
    const stale = () => seq !== refreshSeqRef.current;

    loadTournamentStats().then(s => { if (!stale()) setTourStats(s); });
    computeGroupTables().then(({ tables, bracket }) => { if (!stale()) { setTables(tables); setBracket(bracket); } });

    // Status + scores derived from real data (cross-device safe)
    const ov = await computeMatchOverviews();
    if (stale()) return;
    setOverviews(ov);

    // Live states for matches currently in progress
    const liveNow = ALL_MATCHES.filter(r => ov[r.match.id]?.status === 'live');
    const liveEntries = await Promise.all(
      liveNow.map(rec => deriveLive(rec.match.id).then(s => [rec.match.id, s] as const))
    );
    if (stale()) return;
    const live: Record<string, LiveMatchState> = {};
    for (const [id, s] of liveEntries) { if (s) live[id] = s; }
    setLiveStates(live);
  }

  useEffect(() => {
    refreshAll();
    const onVisible = () => { if (!document.hidden) refreshAll(); };
    // The home page POLLS (no realtime socket) so the limited realtime connections
    // are reserved for people actually watching a live match. A 5s poll is plenty
    // for a summary card / standings, and refreshes instantly on tab focus.
    pollingRef.current = setInterval(refreshAll, 5000);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);



  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column' }}>

      {/* India tricolor stripe */}
      <div style={{ height: 5, display: 'flex', flexShrink: 0 }}>
        <div style={{ flex: 1, background: '#FF9933' }} />
        <div style={{ flex: 1, background: '#ffffff' }} />
        <div style={{ flex: 1, background: '#138808' }} />
      </div>

      {/* Header */}
      <div style={{
        background: 'linear-gradient(160deg, #251508 0%, #1a0f06 52%, var(--bg) 100%)',
        borderBottom: '1px solid rgba(255,153,51,0.18)',
        flexShrink: 0, position: 'relative', overflow: 'hidden',
      }}>
        {/* Ambient glow */}
        <div style={{ position: 'absolute', top: -60, left: '50%', transform: 'translateX(-50%)', width: 420, height: 300, background: 'radial-gradient(ellipse, rgba(255,153,51,0.18) 0%, transparent 62%)', pointerEvents: 'none' }} />

        {/* Title */}
        <div style={{ padding: '18px 18px 16px', position: 'relative', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
            <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,153,51,0.10)', border: '1px solid rgba(255,153,51,0.28)', borderRadius: 20, padding: '6px 13px', color: 'var(--green)', fontSize: 11, fontWeight: 700, textDecoration: 'none' }}>
              ⇄ Men's / Women's
            </Link>
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(255,153,51,0.08)', border: '1px solid rgba(255,153,51,0.22)',
            borderRadius: 20, padding: '4px 13px', marginBottom: 12,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', flexShrink: 0 }} />
            <span style={{ color: 'rgba(255,153,51,0.85)', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.22em' }}>
              Antwerp · 2026
            </span>
          </div>
          <h1 style={{ color: 'var(--text)', fontSize: 24, fontWeight: 900, margin: 0, letterSpacing: '-0.4px', lineHeight: 1.18, textShadow: '0 2px 28px rgba(255,153,51,0.10)' }}>
            Mega Event Woman<br />Cricket Tournament
          </h1>
        </div>

        {/* Logo strip */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-evenly',
          padding: '10px 14px 18px', borderTop: '1px solid rgba(255,255,255,0.05)',
          position: 'relative',
        }}>

          {/* AICC — venue club (left) */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{
              background: 'white', borderRadius: 10, padding: '4px 6px',
              boxShadow: '0 2px 14px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.10)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 50, height: 56, overflow: 'hidden',
            }}>
              <img src="/aicc-logo.jpg" alt="AICC" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <span style={{ color: 'var(--text-3)', fontSize: 9, fontWeight: 500, letterSpacing: '0.02em', textAlign: 'center', maxWidth: 72, lineHeight: 1.3 }}>
              Antwerp Indian Cricket Club
            </span>
          </div>

          {/* Divider */}
          <div style={{ width: 1, height: 44, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />

          {/* Mega Sports — tournament (centre, largest) */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{
              background: 'white', borderRadius: 11, padding: '4px 9px',
              boxShadow: '0 2px 16px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.10)',
            }}>
              <img src="/mega-sports-logo.jpg" alt="Mega Sports" style={{ height: 48, width: 'auto', display: 'block', objectFit: 'contain' }} />
            </div>
            <span style={{ color: 'rgba(255,153,51,0.7)', fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Tournament
            </span>
          </div>

          {/* Divider */}
          <div style={{ width: 1, height: 44, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />

          {/* AIA — main organisation (right) */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'white', overflow: 'hidden',
              boxShadow: '0 2px 14px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.10)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <img src="/aia-logo.jpg" alt="AIA" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <span style={{ color: 'var(--text-3)', fontSize: 9, fontWeight: 500, letterSpacing: '0.02em', textAlign: 'center', maxWidth: 72, lineHeight: 1.3 }}>
              Antwerp Indian Association
            </span>
          </div>
        </div>

        {/* Main Sponsor */}
        <div style={{
          margin: '0 14px 18px',
          background: 'linear-gradient(135deg, rgba(245,197,58,0.07) 0%, rgba(245,197,58,0.03) 100%)',
          border: '1px solid rgba(245,197,58,0.22)',
          borderRadius: 14, padding: '10px 16px',
          display: 'flex', alignItems: 'center', gap: 14,
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Subtle gold shimmer */}
          <div style={{ position: 'absolute', top: -20, right: -10, width: 100, height: 80, background: 'radial-gradient(ellipse, rgba(245,197,58,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />

          {/* Label */}
          <div style={{ flexShrink: 0 }}>
            <p style={{ color: 'var(--amber)', fontSize: 8.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.22em', margin: 0, lineHeight: 1 }}>
              Main
            </p>
            <p style={{ color: 'var(--amber)', fontSize: 8.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.22em', margin: '2px 0 0', lineHeight: 1 }}>
              Sponsor
            </p>
            <p style={{ color: 'rgba(245,197,58,0.55)', fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.22em', margin: '2px 0 0', lineHeight: 1 }}>
              2026
            </p>
          </div>

          {/* Thin divider */}
          <div style={{ width: 1, height: 36, background: 'rgba(245,197,58,0.20)', flexShrink: 0 }} />

          {/* Logo */}
          <div style={{
            background: 'white', borderRadius: 10,
            padding: '5px 10px',
            boxShadow: '0 2px 16px rgba(0,0,0,0.4), 0 0 0 1px rgba(245,197,58,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: 48, flexShrink: 0,
          }}>
            <img src="/swintu-diam-logo.png" alt="Swintu Diam bv" style={{ height: 38, width: 'auto', display: 'block', objectFit: 'contain' }} />
          </div>

          {/* Company name */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ color: 'var(--text)', fontSize: 13, fontWeight: 800, margin: 0, letterSpacing: '-0.2px' }}>
              Swintu Diam bv
            </p>
            <p style={{ color: 'var(--text-3)', fontSize: 10, margin: '2px 0 0', fontWeight: 500 }}>
              Official Title Sponsor
            </p>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {([['matches','Matches'],['fixtures','Fixtures'],['table','Table'],['squads','Squads']] as [Tab,string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '14px 2px', background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 11, fontWeight: tab === t ? 700 : 400,
            color: tab === t ? 'var(--green)' : 'var(--text-3)',
            borderBottom: tab === t ? '2px solid var(--green)' : '2px solid transparent',
            letterSpacing: '0.01em',
          }}>{label}</button>
        ))}
        <button onClick={() => navigate('/stats')} style={{
          flex: 1, padding: '14px 2px', background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: 'inherit', fontSize: 11, fontWeight: 400,
          color: 'var(--text-3)', borderBottom: '2px solid transparent', letterSpacing: '0.01em',
        }}>Stats</button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 12px 32px' }}>

        {/* ── MATCHES TAB ── */}
        {tab === 'matches' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Top Performers Strip */}
            {tourStats && (tourStats.batting.length > 0 || tourStats.bowling.length > 0 || tourStats.mvp.length > 0) && (
              <section>
                <SectionLabel>Top Performers</SectionLabel>
                <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
                  {/* Most Runs */}
                  {tourStats.batting.length > 0 && (() => {
                    const top = [...tourStats.batting].sort((a, b) => b.runs - a.runs)[0];
                    return (
                      <button onClick={() => navigate(`/player/${top.player_id}`)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}>
                        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 14px', minWidth: 130, textAlign: 'left' }}>
                          <p style={{ color: 'var(--green)', fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', margin: '0 0 6px' }}>🏏 Most Runs</p>
                          <p style={{ color: 'var(--text)', fontSize: 14, fontWeight: 700, margin: '0 0 1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>
                            {PLAYERS.find(p => p.id === top.player_id)?.name ?? '?'}
                          </p>
                          <p style={{ color: 'var(--text-3)', fontSize: 10, margin: '0 0 8px' }}>
                            {TEAMS.find(t => t.id === PLAYERS.find(p => p.id === top.player_id)?.team_id)?.short_name}
                          </p>
                          <p style={{ color: 'var(--green)', fontSize: 26, fontWeight: 900, margin: 0, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{top.runs}</p>
                          <p style={{ color: 'var(--text-3)', fontSize: 9, margin: '2px 0 0' }}>runs · {top.balls}b</p>
                        </div>
                      </button>
                    );
                  })()}

                  {/* Most Wickets */}
                  {tourStats.bowling.length > 0 && (() => {
                    const top = [...tourStats.bowling].sort((a, b) => b.wickets - a.wickets)[0];
                    if (top.wickets === 0) return null;
                    return (
                      <button onClick={() => navigate(`/player/${top.player_id}`)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}>
                        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 14px', minWidth: 130, textAlign: 'left' }}>
                          <p style={{ color: 'var(--red)', fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', margin: '0 0 6px' }}>🎯 Most Wickets</p>
                          <p style={{ color: 'var(--text)', fontSize: 14, fontWeight: 700, margin: '0 0 1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>
                            {PLAYERS.find(p => p.id === top.player_id)?.name ?? '?'}
                          </p>
                          <p style={{ color: 'var(--text-3)', fontSize: 10, margin: '0 0 8px' }}>
                            {TEAMS.find(t => t.id === PLAYERS.find(p => p.id === top.player_id)?.team_id)?.short_name}
                          </p>
                          <p style={{ color: 'var(--red)', fontSize: 26, fontWeight: 900, margin: 0, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{top.wickets}</p>
                          <p style={{ color: 'var(--text-3)', fontSize: 9, margin: '2px 0 0' }}>wickets</p>
                        </div>
                      </button>
                    );
                  })()}

                  {/* MVP */}
                  {tourStats.mvp.length > 0 && (() => {
                    const top = tourStats.mvp[0];
                    return (
                      <button onClick={() => navigate(`/player/${top.player_id}`)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}>
                        <div style={{ background: 'linear-gradient(135deg, rgba(245,197,58,0.12) 0%, rgba(245,197,58,0.04) 100%)', border: '1px solid rgba(245,197,58,0.30)', borderRadius: 14, padding: '12px 14px', minWidth: 130, textAlign: 'left' }}>
                          <p style={{ color: 'rgba(245,197,58,0.85)', fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', margin: '0 0 6px' }}>🏆 MVP</p>
                          <p style={{ color: 'var(--text)', fontSize: 14, fontWeight: 700, margin: '0 0 1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>
                            {PLAYERS.find(p => p.id === top.player_id)?.name ?? '?'}
                          </p>
                          <p style={{ color: 'var(--text-3)', fontSize: 10, margin: '0 0 8px' }}>
                            {TEAMS.find(t => t.id === PLAYERS.find(p => p.id === top.player_id)?.team_id)?.short_name}
                          </p>
                          <p style={{ color: 'rgba(245,197,58,0.9)', fontSize: 26, fontWeight: 900, margin: 0, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{top.total.toFixed(1)}</p>
                          <p style={{ color: 'var(--text-3)', fontSize: 9, margin: '2px 0 0' }}>IPL pts</p>
                        </div>
                      </button>
                    );
                  })()}
                </div>
              </section>
            )}

            {/* Live */}
            {liveMatches.length > 0 && (
              <section>
                <SectionLabel live>Live Now</SectionLabel>
                {liveMatches.map(rec => (
                  <LiveCard key={rec.match.id} rec={getMatchRecord(rec.match.id) ?? rec} liveState={liveStates[rec.match.id] ?? null} />
                ))}
              </section>
            )}

            {/* Completed */}
            {(() => {
              const completed = ALL_MATCHES.filter(r => statusOf(r.match.id) === 'complete');
              if (completed.length === 0) return null;
              return (
                <section>
                  <SectionLabel>Results</SectionLabel>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {completed.map(rec => {
                      const ov = overviews[rec.match.id];
                      const sides = matchSides(rec, ov, bracket);
                      const w = winnerOf(sides);
                      return (
                        <Link key={rec.match.id} to={`/match/${rec.match.id}`} style={{ textDecoration: 'none' }}>
                          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '13px 16px' }}>
                            <p style={{ color: 'var(--text-3)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 6px' }}>{rec.roundLabel}</p>
                            <div style={{ marginBottom: 8 }}>
                              {sides.map((s, idx) => {
                                const isW = (w === 'home' && idx === 0) || (w === 'away' && idx === 1);
                                return (
                                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                                    <span style={{ fontSize: 14, fontWeight: isW ? 700 : 500, color: isW ? 'var(--green)' : 'var(--text-2)' }}>{s.name}</span>
                                    {s.score !== null && (
                                      <span style={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: s.score < 0 ? 'var(--red)' : isW ? 'var(--text)' : 'var(--text-2)' }}>{s.score}</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            {w && w !== 'tie' && (
                              <p style={{ color: 'var(--text-3)', fontSize: 11, margin: 0 }}>
                                {(w === 'home' ? sides[0] : sides[1]).short} won by <span style={{ color: 'var(--text-2)', fontWeight: 600 }}>{Math.abs((sides[0].score ?? 0) - (sides[1].score ?? 0))} runs</span>
                                <span style={{ color: 'var(--text-3)', marginLeft: 8 }}>· Tap for scorecard →</span>
                              </p>
                            )}
                            {w === 'tie' && <p style={{ color: 'var(--amber)', fontSize: 11, margin: 0, fontWeight: 600 }}>Match tied · Tap for scorecard →</p>}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              );
            })()}

            {liveMatches.length === 0 && ALL_MATCHES.every(r => statusOf(r.match.id) !== 'complete') && (
              <div style={{ textAlign: 'center', padding: '60px 24px' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🏏</div>
                <p style={{ color: 'var(--text)', fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>Tournament not started</p>
                <p style={{ color: 'var(--text-3)', fontSize: 13 }}>Check Fixtures for the full schedule.</p>
              </div>
            )}
          </div>
        )}

        {/* ── FIXTURES TAB (exact play order) ── */}
        {tab === 'fixtures' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            {([
              { title: 'Round 1', match: (r: MatchRecord) => r.round === 1 },
              { title: 'Round 2 · points carried forward', match: (r: MatchRecord) => r.round === 2 },
              { title: 'Final', match: (r: MatchRecord) => r.round === 'final' },
            ] as const).map(section => {
              const matches = ALL_MATCHES.filter(section.match);
              if (matches.length === 0) return null;
              return (
                <div key={section.title}>
                  <SectionLabel>{section.title}</SectionLabel>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {matches.map(rec => (
                      <FixtureRow key={rec.match.id} rec={rec} num={ALL_MATCHES.indexOf(rec) + 1} idxInSub={0}
                        showGroup ov={overviews[rec.match.id]} bracket={bracket} navigate={navigate} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── TABLE TAB ── */}
        {tab === 'table' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Round 1 / Round 2 sub-tabs */}
            <div style={{ display: 'flex', gap: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 4 }}>
              {([1, 2] as const).map(r => {
                const active = tableRound === r;
                const locked = r === 2 && !bracket.round1Complete;
                return (
                  <button key={r} onClick={() => !locked && setTableRound(r)} disabled={locked} style={{
                    flex: 1, padding: '9px 4px', borderRadius: 9, border: 'none', cursor: locked ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit', fontSize: 12, fontWeight: active ? 700 : 500,
                    background: active ? 'var(--surface-3)' : 'transparent',
                    color: active ? 'var(--text)' : locked ? 'var(--text-3)' : 'var(--text-2)',
                    opacity: locked ? 0.5 : 1,
                  }}>
                    Round {r}{locked ? ' 🔒' : ''}
                  </button>
                );
              })}
            </div>

            {tables.length === 0 && (
              <p style={{ color: 'var(--text-3)', fontSize: 13, padding: '32px 0', textAlign: 'center' }}>Loading tables…</p>
            )}

            {/* Round 1 → Group A & B */}
            {tableRound === 1 && tables.filter(t => t.key === 'A' || t.key === 'B').map(gt => (
              <GroupStandings key={gt.key} table={gt} />
            ))}

            {/* Round 2 → Group C & D (+ seeding explainer + final) */}
            {tableRound === 2 && (
              !bracket.round1Complete ? (
                <div style={{ textAlign: 'center', padding: '48px 24px' }}>
                  <div style={{ fontSize: 34, marginBottom: 10 }}>⏳</div>
                  <p style={{ color: 'var(--text)', fontWeight: 700, fontSize: 16, margin: '0 0 6px' }}>Round 2 not set yet</p>
                  <p style={{ color: 'var(--text-3)', fontSize: 13, margin: 0 }}>Groups C &amp; D form once all Round 1 matches are done.</p>
                </div>
              ) : (
                <>
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 16px' }}>
                    <p style={{ color: 'var(--text-3)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 8px' }}>How Round 2 was seeded</p>
                    <p style={{ color: 'var(--text-2)', fontSize: 12, margin: '0 0 4px' }}>
                      <b style={{ color: 'var(--green)' }}>Group C</b> = 1st Group A ({teamShort(bracket.aRank[0])}) + 2nd &amp; 3rd Group B ({teamShort(bracket.bRank[1])}, {teamShort(bracket.bRank[2])})
                    </p>
                    <p style={{ color: 'var(--text-2)', fontSize: 12, margin: 0 }}>
                      <b style={{ color: 'var(--blue)' }}>Group D</b> = 1st Group B ({teamShort(bracket.bRank[0])}) + 2nd &amp; 3rd Group A ({teamShort(bracket.aRank[1])}, {teamShort(bracket.aRank[2])})
                    </p>
                    <p style={{ color: 'var(--text-3)', fontSize: 11, margin: '8px 0 0' }}>Points carried forward from Round 1.</p>
                  </div>
                  {tables.filter(t => t.key === 'C' || t.key === 'D').map(gt => (
                    <GroupStandings key={gt.key} table={gt} />
                  ))}

                  {/* Overall standings — decides the two finalists (top 2 by points, NRR tiebreak) */}
                  {(() => {
                    const overall = [...tables.filter(t => t.key === 'C' || t.key === 'D').flatMap(t => t.rows)]
                      .sort((a, b) => b.points !== a.points ? b.points - a.points : Math.abs(b.nrr - a.nrr) > 1e-9 ? b.nrr - a.nrr : b.won - a.won);
                    if (overall.length === 0) return null;
                    return (
                      <div style={{ background: 'var(--surface)', border: '1px solid rgba(245,197,58,0.30)', borderRadius: 16, overflow: 'hidden' }}>
                        <div style={{ padding: '12px 16px 8px' }}>
                          <p style={{ color: 'rgba(245,197,58,0.9)', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>🏆 Overall — Final Qualification</p>
                          <p style={{ color: 'var(--text-3)', fontSize: 11, margin: '4px 0 0' }}>Top 2 by points reach the final (may be from the same group) · NRR breaks ties</p>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '26px 1fr 34px 34px 40px 50px', gap: 4, padding: '8px 16px', borderTop: '1px solid var(--border)', color: 'var(--text-3)', fontSize: 10, fontWeight: 700 }}>
                          <span>#</span><span>Team</span><span style={{ textAlign: 'center' }}>P</span><span style={{ textAlign: 'center' }}>W</span><span style={{ textAlign: 'center' }}>Pts</span><span style={{ textAlign: 'right' }}>NRR</span>
                        </div>
                        {overall.map((row, i) => {
                          const isFinalist = i < 2 && row.played > 0;
                          return (
                            <div key={row.team_id} style={{ display: 'grid', gridTemplateColumns: '26px 1fr 34px 34px 40px 50px', gap: 4, padding: '9px 16px', borderTop: '1px solid var(--border)', alignItems: 'center', background: isFinalist ? 'rgba(245,197,58,0.06)' : 'transparent' }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: isFinalist ? 'var(--amber)' : 'var(--text-3)' }}>{i + 1}</span>
                              <span style={{ fontSize: 12.5, fontWeight: isFinalist ? 700 : 500, color: isFinalist ? 'var(--text)' : 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{teamName(row.team_id)}{isFinalist && <span style={{ color: 'var(--amber)', fontSize: 9, fontWeight: 800, marginLeft: 5 }}>FINAL</span>}</span>
                              <span style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>{row.played}</span>
                              <span style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>{row.won}</span>
                              <span style={{ textAlign: 'center', fontSize: 13, fontWeight: 800, color: isFinalist ? 'var(--amber)' : 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{row.points}</span>
                              <span style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>{row.nrr >= 0 ? '+' : ''}{row.nrr.toFixed(2)}</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {bracket.round2Complete && (
                    <div style={{ background: 'linear-gradient(135deg, rgba(245,197,58,0.12) 0%, rgba(245,197,58,0.04) 100%)', border: '1px solid rgba(245,197,58,0.30)', borderRadius: 14, padding: '14px 16px', textAlign: 'center' }}>
                      <p style={{ color: 'rgba(245,197,58,0.85)', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', margin: '0 0 6px' }}>🏆 Final · Top 2 Overall</p>
                      <p style={{ color: 'var(--text)', fontSize: 15, fontWeight: 800, margin: 0 }}>
                        {teamName(bracket.finalHome)} <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>vs</span> {teamName(bracket.finalAway)}
                      </p>
                    </div>
                  )}
                </>
              )
            )}

            <p style={{ color: 'var(--text-3)', fontSize: 11, textAlign: 'center' }}>Win = 2 pts · Tie = 1 pt · Loss = 0 pts · NRR is the tiebreaker</p>
          </div>
        )}

        {/* ── SQUADS TAB ── */}
        {tab === 'squads' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {TEAMS.map(team => {
              const players = PLAYERS.filter(p => p.team_id === team.id);
              const captain = players.find(p => p.is_captain);
              const rest = players.filter(p => !p.is_captain);
              const teamColors: Record<string, { accent: string; bg: string; border: string }> = {
                [TEAMS[0].id]: { accent: 'var(--green)',  bg: 'rgba(255,153,51,0.07)',  border: 'rgba(255,153,51,0.22)' },
                [TEAMS[1].id]: { accent: 'var(--blue)',   bg: 'rgba(165,200,255,0.07)', border: 'rgba(165,200,255,0.22)' },
                [TEAMS[2].id]: { accent: '#1db85c',       bg: 'rgba(29,184,92,0.07)',   border: 'rgba(29,184,92,0.22)' },
                [TEAMS[3].id]: { accent: 'var(--amber)',  bg: 'rgba(245,197,58,0.07)',  border: 'rgba(245,197,58,0.22)' },
                [TEAMS[4].id]: { accent: 'var(--purple)', bg: 'rgba(176,156,248,0.07)', border: 'rgba(176,156,248,0.22)' },
                [TEAMS[5].id]: { accent: 'var(--red)',    bg: 'rgba(244,106,106,0.07)', border: 'rgba(244,106,106,0.22)' },
              };
              const c = teamColors[team.id] ?? teamColors[TEAMS[0].id];
              return (
                <div key={team.id} style={{ background: 'var(--surface)', border: `1px solid var(--border)`, borderRadius: 16, overflow: 'hidden' }}>
                  {/* Team header */}
                  <div style={{ background: c.bg, borderBottom: `1px solid ${c.border}`, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <h3 style={{ color: c.accent, fontSize: 15, fontWeight: 800, margin: 0, letterSpacing: '-0.2px' }}>{team.name}</h3>
                      <p style={{ color: 'var(--text-3)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '2px 0 0' }}>
                        {players.length} players
                      </p>
                    </div>
                    <div style={{ background: c.border, borderRadius: 8, padding: '4px 10px' }}>
                      <span style={{ color: c.accent, fontSize: 12, fontWeight: 700 }}>{team.short_name}</span>
                    </div>
                  </div>

                  {/* Captain */}
                  {captain && (
                    <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-2)', display: 'flex', alignItems: 'center', gap: 10, background: c.bg }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: c.border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>
                        👑
                      </div>
                      <div>
                        <p style={{ color: 'var(--text)', fontSize: 14, fontWeight: 700, margin: 0 }}>{captain.name}</p>
                        <p style={{ color: c.accent, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '1px 0 0' }}>Captain</p>
                      </div>
                    </div>
                  )}

                  {/* Players grid */}
                  <div style={{ padding: '10px 16px 14px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
                      {rest.map((p, i) => (
                        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 0', borderBottom: '1px solid var(--border-2)' }}>
                          <span style={{ color: 'var(--text-3)', fontSize: 9, fontWeight: 600, minWidth: 14, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{i + 2}</span>
                          <span style={{ color: 'var(--text-2)', fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* Footer / credits */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '18px 16px 26px', textAlign: 'center', flexShrink: 0 }}>
        <p style={{ color: 'var(--text-3)', fontSize: 11, margin: 0, lineHeight: 1.6 }}>
          Antwerp Indian Cricket Club · Mega Sports<br />
          Title Sponsor: Swintu Diam bv
        </p>
        <p style={{ color: 'var(--text-3)', fontSize: 10, margin: '6px 0 0', opacity: 0.6 }}>
          Built by Virat Gandhi
        </p>
      </div>
    </div>
  );
}

// ── Fixture row (schedule) ──────────────────────────────────────────────────────

function FixtureRow({ rec, num, ov, bracket, navigate, showGroup }: {
  rec: MatchRecord; num: number; idxInSub: number;
  ov: MatchOverview | undefined; bracket: Bracket;
  navigate: ReturnType<typeof useNavigate>;
  showGroup?: boolean;
}) {
  const sides = matchSides(rec, ov, bracket);
  const w = winnerOf(sides);
  const status = ov?.status ?? 'scheduled';
  const isLive = status === 'live';
  const isDone = status === 'complete';
  const tappable = isLive || isDone;

  return (
    <div
      onClick={() => tappable && navigate(`/match/${rec.match.id}`)}
      style={{
        background: isLive ? 'linear-gradient(135deg, rgba(29,184,92,0.08) 0%, var(--surface) 100%)' : 'var(--surface)',
        border: `1px solid ${isLive ? 'rgba(29,184,92,0.25)' : 'var(--border)'}`,
        borderRadius: 12, padding: '10px 14px',
        cursor: tappable ? 'pointer' : 'default', opacity: !tappable ? 0.75 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--text-3)', fontSize: 9, fontWeight: 600 }}>Match {num}</span>
          {showGroup && rec.round !== 'final' && (
            <span style={{ color: 'var(--text-3)', fontSize: 9, fontWeight: 700, background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 6, padding: '1px 6px' }}>{rec.roundLabel}</span>
          )}
        </span>
        {isLive && <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--green)', fontSize: 9, fontWeight: 700 }}><span className="live-dot" style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />LIVE</span>}
        {isDone && <span style={{ color: 'var(--text-3)', fontSize: 9 }}>Result ›</span>}
        {!tappable && !isLive && !isDone && <span style={{ color: 'var(--text-3)', fontSize: 9 }}>Upcoming</span>}
      </div>
      {rec.time && (
        <p style={{ color: 'var(--green)', fontSize: 10.5, fontWeight: 700, margin: '0 0 7px', display: 'flex', alignItems: 'center', gap: 5 }}>
          🕐 {rec.day ? `${rec.day} · ` : ''}{rec.timeWindow ?? rec.time}
        </p>
      )}
      {sides.map((s, idx) => {
        const isW = (w === 'home' && idx === 0) || (w === 'away' && idx === 1);
        return (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 0' }}>
            <span style={{ fontSize: 13, fontWeight: isW ? 700 : 500, color: isW ? 'var(--green)' : isLive ? 'var(--text)' : 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '68%' }}>{s.name}</span>
            {s.score !== null && <span style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: s.score < 0 ? 'var(--red)' : isW ? 'var(--text)' : 'var(--text-2)' }}>{s.score}</span>}
          </div>
        );
      })}
      {w && w !== 'tie' && (
        <p style={{ color: 'var(--text-3)', fontSize: 10, margin: '5px 0 0' }}>{(w === 'home' ? sides[0] : sides[1]).short} won by {Math.abs((sides[0].score ?? 0) - (sides[1].score ?? 0))} runs</p>
      )}
      {w === 'tie' && <p style={{ color: 'var(--amber)', fontSize: 10, margin: '5px 0 0', fontWeight: 600 }}>Match tied</p>}
    </div>
  );
}

// ── Group standings table ─────────────────────────────────────────────────────────

function GroupStandings({ table }: { table: GroupTable }) {
  const accent = table.key === 'A' ? 'var(--green)' : table.key === 'B' ? 'var(--blue)' : table.key === 'C' ? 'var(--green)' : 'var(--blue)';
  const [open, setOpen] = useState<string | null>(null);
  const oversPer = 12; // women's: 6 pairs × 2 overs per innings
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ color: accent, fontSize: 14, fontWeight: 800, margin: 0 }}>{table.title}</h2>
        <span style={{ color: 'var(--text-3)', fontSize: 10 }}>{table.key === 'C' || table.key === 'D' ? 'Round 2 · carried fwd' : 'Round 1'}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '16px 1fr 20px 20px 20px 20px 28px 50px', padding: '6px 12px', gap: 4, borderBottom: '1px solid var(--border-2)' }}>
        {['#', 'Team', 'P', 'W', 'L', 'T', 'Pts', 'NRR'].map((h, i) => (
          <span key={h} style={{ color: 'var(--text-3)', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: i > 1 ? 'right' : 'left' }}>{h}</span>
        ))}
      </div>
      {table.rows.map((row, i) => {
        const nrrStr = row.played === 0 ? '—' : (row.nrr >= 0 ? '+' : '') + row.nrr.toFixed(3);
        const nrrColor = row.played === 0 ? 'var(--text-3)' : row.nrr > 0 ? 'var(--blue)' : row.nrr < 0 ? 'var(--red)' : 'var(--text-3)';
        // Round-1 groups: highlight the leader (seeds as group 1st into Round 2).
        // Round-2 groups (C/D): finalists come from the OVERALL table, not the group
        // winner — so don't imply qualification here.
        const qualifies = i === 0 && row.played > 0 && (table.key === 'A' || table.key === 'B');
        const isOpen = open === row.team_id;
        const overs = row.played * oversPer;
        return (
          <div key={row.team_id} style={{ borderBottom: i < table.rows.length - 1 ? '1px solid var(--border-2)' : 'none', background: qualifies ? 'rgba(255,153,51,0.05)' : 'transparent' }}>
            <div onClick={() => setOpen(isOpen ? null : row.team_id)} style={{
              display: 'grid', gridTemplateColumns: '16px 1fr 20px 20px 20px 20px 28px 50px', padding: '9px 12px', gap: 4, cursor: 'pointer',
            }}>
              <span style={{ fontSize: 12, color: qualifies ? 'var(--amber)' : 'var(--text-3)', fontWeight: qualifies ? 700 : 400 }}>{i + 1}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: qualifies ? 'var(--text)' : 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{teamName(row.team_id)} <span style={{ color: 'var(--text-3)', fontSize: 10 }}>{isOpen ? '▾' : 'ⓘ'}</span></span>
              <span style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.played}</span>
              <span style={{ fontSize: 11, color: row.won > 0 ? 'var(--green)' : 'var(--text-3)', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: row.won > 0 ? 700 : 400 }}>{row.won}</span>
              <span style={{ fontSize: 11, color: row.lost > 0 ? 'var(--red)' : 'var(--text-3)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.lost}</span>
              <span style={{ fontSize: 11, color: row.tied > 0 ? 'var(--amber)' : 'var(--text-3)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.tied}</span>
              <span style={{ fontSize: 13, fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: qualifies ? 'var(--amber)' : 'var(--text)' }}>{row.points}</span>
              <span style={{ fontSize: 11, fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: nrrColor }}>{nrrStr}</span>
            </div>
            {isOpen && row.played > 0 && (
              <div style={{ padding: '0 12px 10px' }}>
                <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '9px 12px', fontSize: 11.5, lineHeight: 1.7, color: 'var(--text-3)' }}>
                  <div>Runs <b style={{ color: 'var(--green)' }}>scored: {row.rf}</b> · Runs <b style={{ color: 'var(--red)' }}>conceded: {row.ra}</b> over {overs} overs ({row.played} × {oversPer})</div>
                  <div style={{ color: 'var(--text-2)', marginTop: 3 }}>NRR = {row.rf}/{overs} − {row.ra}/{overs} = {(row.rf / overs).toFixed(2)} − {(row.ra / overs).toFixed(2)} = <b style={{ color: 'var(--text)' }}>{row.nrr >= 0 ? '+' : ''}{row.nrr.toFixed(3)}</b></div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Live match card ────────────────────────────────────────────────────────────

function LiveCard({ rec, liveState }: { rec: MatchRecord; liveState: LiveMatchState | null }) {
  const activeDerived = liveState
    ? (liveState.activeInnings === 2 && liveState.inn2.derived ? liveState.inn2.derived : liveState.inn1.derived)
    : null;
  const activeDels = liveState
    ? (liveState.activeInnings === 2 ? liveState.inn2.deliveries : liveState.inn1.deliveries)
    : [];
  const fallbackBatTeam = liveState?.activeInnings === 2 ? rec.match.away_team_id : rec.match.home_team_id;
  const firstStriker = activeDels.find(d => d.striker_id)?.striker_id;
  const activeBattingTeam = PLAYERS.find(p => p.id === firstStriker)?.team_id ?? fallbackBatTeam;
  const totalLegalBalls = activeDels.filter(d => d.legal_ball).length;

  return (
    <Link to={`/match/${rec.match.id}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div style={{
        background: 'linear-gradient(160deg, #251508 0%, #1a0f06 55%, var(--bg) 100%)',
        border: '1px solid rgba(255,153,51,0.24)',
        borderRadius: 16, padding: '16px',
        boxShadow: 'inset 3px 0 0 var(--green)',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -20, right: -10, width: 160, height: 120, background: 'radial-gradient(ellipse, rgba(255,153,51,0.11) 0%, transparent 68%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>

          {/* Live badge */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span className="live-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
              <span style={{ color: 'var(--green)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Live</span>
            </div>
            <span style={{ color: 'var(--text-3)', fontSize: 11 }}>Tap for full view →</span>
          </div>

          {/* Toss result */}
          {liveState?.toss?.winner_id && liveState.toss.elected && (
            <p style={{ color: 'rgba(245,197,58,0.75)', fontSize: 10, fontWeight: 600, margin: '0 0 6px' }}>
              🪙 {teamShort(liveState.toss.winner_id)} won toss · elected to {liveState.toss.elected === 'bat' ? 'bat' : 'bowl'} first
            </p>
          )}

          {/* Team name */}
          <p style={{ color: 'rgba(255,153,51,0.65)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 6px' }}>
            {teamName(activeBattingTeam)} batting
          </p>

          {/* Score */}
          {activeDerived && totalLegalBalls > 0 ? (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                  <span className="tabular" style={{
                    fontSize: 52, fontWeight: 900, lineHeight: 1, letterSpacing: '-2px',
                    color: activeDerived.total < 0 ? 'var(--red)' : 'var(--text)',
                    textShadow: '0 0 40px rgba(255,153,51,0.18)',
                  }}>
                    {activeDerived.total}
                  </span>
                  <span style={{ fontSize: 18, fontWeight: 300, color: 'rgba(255,255,255,0.2)', margin: '0 2px' }}>/</span>
                  <span className="tabular" style={{ fontSize: 18, fontWeight: 500, color: 'rgba(255,255,255,0.4)' }}>
                    {activeDerived.wickets}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ color: 'var(--text)', fontSize: 15, fontWeight: 700, margin: '0 0 2px', fontVariantNumeric: 'tabular-nums' }}>
                    Ov {activeDerived.current_absolute_over}.{activeDerived.current_ball}
                  </p>
                  <p style={{ color: 'var(--green)', fontSize: 12, margin: 0 }}>
                    RR {runRate(activeDerived.total, totalLegalBalls, rec.match.settings.balls_per_over)}
                  </p>
                </div>
              </div>

              {/* Batters */}
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '8px 10px', marginBottom: 8 }}>
                {[activeDerived.striker_id, activeDerived.non_striker_id].map((id, idx) => {
                  const name = PLAYERS.find(p => p.id === id)?.name;
                  const isStriker = idx === 0;
                  return (
                    <div key={id} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                      <span style={{ fontSize: 12, color: isStriker ? 'var(--text)' : 'var(--text-2)', fontWeight: isStriker ? 600 : 400 }}>
                        {isStriker && <span style={{ color: 'var(--green)', marginRight: 4, fontSize: 10 }}>★</span>}
                        {name ?? '—'}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
                        {activeDerived.batter_runs[id] ?? 0}
                        <span style={{ color: 'var(--text-3)' }}> ({activeDerived.batter_balls[id] ?? 0})</span>
                      </span>
                    </div>
                  );
                })}
                {liveState?.currentBowlerName && (
                  <div style={{ borderTop: '1px solid var(--border-2)', marginTop: 4, paddingTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: 'var(--text-3)', fontSize: 11 }}>Bowling</span>
                    <span style={{ color: 'var(--text-2)', fontSize: 12, fontWeight: 500 }}>{liveState.currentBowlerName}</span>
                  </div>
                )}
              </div>

              {/* This over */}
              {activeDerived.this_over_balls.length > 0 && (
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {activeDerived.this_over_balls.map(d => <BallDot key={d.id} delivery={d} small />)}
                </div>
              )}

              {/* Chase strip if inn2 is active (only once innings 1 is complete) */}
              {liveState && liveState.activeInnings === 2 && liveState.inn2.derived && liveState.inn1.derived.is_complete && (() => {
                const inn1Total = liveState.inn1.derived.total;
                const inn2Total = liveState.inn2.derived!.total;
                const target = inn1Total + 1;
                const runsNeeded = target - inn2Total;
                const isAhead = inn2Total > inn1Total;
                const totalBalls = rec.match.settings.num_pairs * rec.match.settings.overs_per_pair * rec.match.settings.balls_per_over;
                const inn2Balls = liveState.inn2.deliveries.filter(d => d.legal_ball).length;
                const ballsLeft = totalBalls - inn2Balls;
                const rrr = ballsLeft > 0 && runsNeeded > 0
                  ? ((runsNeeded / ballsLeft) * rec.match.settings.balls_per_over).toFixed(2) : '—';
                return (
                  <div style={{
                    marginTop: 8, borderRadius: 8, padding: '7px 10px',
                    background: isAhead ? 'rgba(29,184,92,0.08)' : 'rgba(255,153,51,0.08)',
                    border: `1px solid ${isAhead ? 'rgba(29,184,92,0.2)' : 'rgba(255,153,51,0.18)'}`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 9, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                        {isAhead ? 'Ahead' : 'Need'}
                      </p>
                      <p style={{ margin: '1px 0 0', fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: isAhead ? 'var(--blue)' : 'var(--amber)', lineHeight: 1 }}>
                        {isAhead ? `+${inn2Total - inn1Total}` : `${runsNeeded} from ${ballsLeft}b`}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ margin: 0, fontSize: 10, color: 'var(--text-3)' }}>Target <span style={{ color: 'var(--amber)', fontWeight: 700 }}>{target}</span></p>
                      {!isAhead && <p style={{ margin: '1px 0 0', fontSize: 10, color: 'var(--text-3)' }}>RRR <span style={{ fontWeight: 700, color: 'var(--amber)' }}>{rrr}</span></p>}
                    </div>
                  </div>
                );
              })()}
            </>
          ) : (
            <div style={{ padding: '8px 0' }}>
              <p style={{ color: 'var(--text-2)', fontSize: 16, fontWeight: 600, margin: '0 0 4px' }}>
                {teamName(rec.match.home_team_id)} vs {teamName(rec.match.away_team_id)}
              </p>
              <p style={{ color: 'var(--text-3)', fontSize: 12, margin: 0 }}>Waiting for first ball…</p>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

// ── Small helpers ──────────────────────────────────────────────────────────────

function SectionLabel({ children, live }: { children: React.ReactNode; live?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
      {live && <span className="live-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />}
      <h2 style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
        {children}
      </h2>
    </div>
  );
}

