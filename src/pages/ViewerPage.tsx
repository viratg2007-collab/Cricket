import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { deriveMatchState, reconstructPairs, bowlerFigures, formatOvers, runRate } from '../lib/engine';
import { predictWin, battingFormFactor, batterFormOf } from '../lib/winPredictor';
import { WinPredictor } from '../components/WinPredictor';
import { loadTournamentStats } from '../lib/tournamentStats';
import { fetchDeliveries, fetchMatchToss, supabase, supabaseEnabled } from '../lib/supabase';
import { anyMatchRecord, anyPairs, anyPlayer, anyTeam, anyPar, isMensId } from '../lib/resolve';
import { BallDot } from '../components/BallDot';
import { ManhattanChart } from '../components/ManhattanChart';
import type { Delivery, DerivedMatchState, Pair, Player, Team } from '../lib/types';

function getPlayer(id: string): Player | undefined { return anyPlayer(id); }
function getTeam(id: string): Team | undefined { return anyTeam(id); }

// Which team is batting in this innings — derived from the actual deliveries'
// striker (correct even when the toss flipped the batting order), with the
// home/away position as fallback before any ball is bowled.
function battingTeamFromDeliveries(dels: Delivery[], fallback: string): string {
  const first = dels.find(d => d.striker_id);
  return getPlayer(first?.striker_id ?? '')?.team_id ?? fallback;
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

function readLocalPairs(matchId: string, inning: 1 | 2): Pair[] {
  try {
    const raw = localStorage.getItem(`cricket_match_${matchId}_v2`);
    if (!raw) return [];
    const st = JSON.parse(raw) as { inn1?: { pairs?: Pair[] }; inn2?: { pairs?: Pair[] } };
    const pairs = inning === 1 ? st.inn1?.pairs : st.inn2?.pairs;
    return (pairs ?? []).filter(p => p.player1_id && p.player2_id);
  } catch { return []; }
}

interface RelayData {
  d1: Delivery[]; d2: Delivery[];
  pairs1: Pair[] | null; pairs2: Pair[] | null;
  toss: { winner_id: string | null; elected: 'bat' | 'bowl' | null } | null;
}

async function fetchFromRelay(matchId: string): Promise<RelayData | null> {
  if (supabaseEnabled) return null;
  try {
    const res = await fetch(`http://${window.location.hostname}:5180/state/${matchId}`);
    if (!res.ok) return null;
    const data = await res.json() as {
      inn1?: { deliveries?: Delivery[]; pairs?: Pair[] };
      inn2?: { deliveries?: Delivery[]; pairs?: Pair[] };
      toss?: { winner_id?: string | null; elected?: 'bat' | 'bowl' | null };
    } | null;
    if (!data) return null;
    const p1 = (data.inn1?.pairs ?? []).filter((p: Pair) => p.player1_id && p.player2_id);
    const p2 = (data.inn2?.pairs ?? []).filter((p: Pair) => p.player1_id && p.player2_id);
    return {
      d1: (data.inn1?.deliveries ?? []).filter(d => !d.is_deleted),
      d2: (data.inn2?.deliveries ?? []).filter(d => !d.is_deleted),
      pairs1: p1.length > 0 ? p1 : null,
      pairs2: p2.length > 0 ? p2 : null,
      toss: data.toss ? { winner_id: data.toss.winner_id ?? null, elected: data.toss.elected ?? null } : null,
    };
  } catch { return null; }
}

function sr(r: number, b: number) { return b === 0 ? '—' : ((r / b) * 100).toFixed(1); }
function econ(r: number, o: number, eb: number, bpo: number) {
  const t = o + eb / bpo; return t === 0 ? '—' : (r / t).toFixed(1);
}

type Tab = 'live' | 'scorecard' | 'ball-by-ball' | 'stats';

// ── Entry ─────────────────────────────────────────────────────────────────────

export function ViewerPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const rec = matchId ? anyMatchRecord(matchId) : undefined;

  if (!rec) {
    return (
      <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🏏</div>
        <h1 style={{ color: 'var(--text)', fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>Match not found</h1>
        <Link to="/" style={{ color: 'var(--green)', fontSize: 13, textDecoration: 'none', marginTop: 8 }}>← Back</Link>
      </div>
    );
  }
  return <MatchDetail matchId={matchId!} rec={rec} />;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function MatchDetail({ matchId, rec }: { matchId: string; rec: NonNullable<ReturnType<typeof anyMatchRecord>> }) {
  const { match, innings1_id, innings2_id } = rec;
  const settings = match.settings;

  const [inn1Del, setInn1Del] = useState<Delivery[]>([]);
  const [inn2Del, setInn2Del] = useState<Delivery[]>([]);
  const [inn1Pairs, setInn1Pairs] = useState<Pair[]>(() => anyPairs(match.home_team_id, matchId));
  const [inn2Pairs, setInn2Pairs] = useState<Pair[]>(() => anyPairs(match.away_team_id, matchId));
  const [toss, setToss] = useState<{ winner_id: string | null; elected: 'bat' | 'bowl' | null } | null>(null);
  const [tourBatting, setTourBatting] = useState<{ player_id: string; runs: number; balls: number }[]>([]);
  const [par, setPar] = useState(80);
  const [connected, setConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [tab, setTab] = useState<Tab>('live');
  const [activeInnings, setActiveInnings] = useState<1 | 2>(1);
  const userPickedInnings = useRef(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadRef   = useRef<() => void>(() => {});
  const loadSeqRef = useRef(0);

  useEffect(() => {
    const load = async () => {
      // Guard against out-of-order async completions (realtime + poll + focus can
      // overlap): only the most recent load may apply its results.
      const seq = ++loadSeqRef.current;
      const stale = () => seq !== loadSeqRef.current;

      // Start with localStorage — always available on the scorer's device
      let d1 = readLocalDeliveries(matchId, 1);
      let d2 = readLocalDeliveries(matchId, 2);

      // Read scorer-selected pairs from localStorage (more accurate than defaults)
      const localPairs1 = readLocalPairs(matchId, 1);
      const localPairs2 = readLocalPairs(matchId, 2);
      if (localPairs1.length > 0) setInn1Pairs(localPairs1);
      if (localPairs2.length > 0) setInn2Pairs(localPairs2);

      // Overlay relay data if it has MORE deliveries (cross-device viewers)
      const relay = await fetchFromRelay(matchId);
      if (relay) {
        if (relay.d1.length > d1.length) d1 = relay.d1;
        if (relay.d2.length > d2.length) d2 = relay.d2;
        // Relay pairs take priority over localStorage pairs
        if (relay.pairs1 && relay.pairs1.length > 0) setInn1Pairs(relay.pairs1);
        if (relay.pairs2 && relay.pairs2.length > 0) setInn2Pairs(relay.pairs2);
        if (relay.toss) setToss(relay.toss);
      }

      // Fall back to Supabase if both sources are empty
      if (d1.length === 0 && supabaseEnabled && supabase) {
        [d1, d2] = await Promise.all([fetchDeliveries(innings1_id), fetchDeliveries(innings2_id)]);
      }

      // Toss comes from Supabase cross-device (relay is gated off when Supabase is on)
      if (supabaseEnabled) {
        const t = await fetchMatchToss(matchId);
        if (t && !stale()) setToss(t);
      }

      if (stale()) return; // a newer load superseded this one — drop stale data
      setInn1Del(d1);
      setInn2Del(d2);
      if (d2.length > 0 && !userPickedInnings.current) setActiveInnings(2);
      setConnected(true);
      setLastUpdated(new Date());
    };

    loadRef.current = load;
    load();

    if (supabaseEnabled && supabase) {
      const ch = supabase
        .channel(`viewer-${matchId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries', filter: `innings_id=eq.${innings1_id}` }, load)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries', filter: `innings_id=eq.${innings2_id}` }, load)
        .subscribe(s => setConnected(s === 'SUBSCRIBED'));
      // Safety net against dropped realtime (sleep / network change)
      const backup = setInterval(load, 20000);
      return () => { supabase.removeChannel(ch); clearInterval(backup); };
    } else {
      pollingRef.current = setInterval(load, 1500);
      return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
    }
  }, [matchId, innings1_id, innings2_id]);

  // Reload immediately when the viewer's tab/screen comes back into focus
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) loadRef.current(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  // Tournament batting form + par score (for the win predictor) — refresh slowly.
  useEffect(() => {
    const load = () => {
      loadTournamentStats(isMensId(matchId) ? 'mens' : 'womens').then(s => setTourBatting(s.batting.map(r => ({ player_id: r.player_id, runs: r.runs, balls: r.balls }))));
      anyPar(matchId).then(setPar);
    };
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  // Reconstruct pairs from deliveries so cross-device viewers (who only have
  // deliveries, not the synced pairs table) show the correct batters.
  const realInn1Pairs = reconstructPairs(inn1Del, inn1Pairs);
  const realInn2Pairs = reconstructPairs(inn2Del, inn2Pairs);

  const derived1 = deriveMatchState(inn1Del, realInn1Pairs, settings);
  const derived2 = deriveMatchState(inn2Del, realInn2Pairs, settings);

  const activeDerived = activeInnings === 1 ? derived1 : derived2;
  const activePairs  = activeInnings === 1 ? realInn1Pairs : realInn2Pairs;
  const activeDel    = activeInnings === 1 ? inn1Del : inn2Del;
  const battingTeamId = activeInnings === 1
    ? battingTeamFromDeliveries(inn1Del, match.home_team_id)
    : battingTeamFromDeliveries(inn2Del, match.away_team_id);
  const totalLegalBalls = activeDel.filter(d => d.legal_ball).length;
  const hasInn1 = inn1Del.length > 0;
  const hasInn2 = inn2Del.length > 0;

  const currentBowler = (() => {
    const last = [...activeDel].reverse().find(d => d.legal_ball && d.extra_type !== 'strike_override');
    return last ? getPlayer(last.bowler_id) : undefined;
  })();

  const tabs: { key: Tab; label: string }[] = [
    { key: 'live', label: activeDerived.is_complete ? 'Summary' : 'Live' },
    { key: 'scorecard', label: 'Scorecard' },
    { key: 'ball-by-ball', label: 'Ball by Ball' },
    { key: 'stats', label: 'Stats' },
  ];

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px 8px', flexShrink: 0 }}>
        <Link to={isMensId(matchId) ? '/mens' : '/womens'} style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-2)',
          borderRadius: 20, padding: '5px 12px', color: 'var(--text-2)', fontSize: 12, fontWeight: 600,
          textDecoration: 'none',
        }}>← Exit to {isMensId(matchId) ? "Men's" : "Women's"} matches</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ background: 'white', borderRadius: 6, padding: '2px 4px', width: 26, height: 28, boxShadow: '0 1px 6px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <img src="/aicc-logo.jpg" alt="AICC" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div style={{ background: 'white', borderRadius: 6, padding: '2px 5px', boxShadow: '0 1px 6px rgba(0,0,0,0.3)' }}>
            <img src="/mega-sports-logo.jpg" alt="Mega Sports" style={{ height: 22, width: 'auto', display: 'block', objectFit: 'contain' }} />
          </div>
          <div style={{ background: 'white', borderRadius: '50%', width: 28, height: 28, overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.3)', flexShrink: 0 }}>
            <img src="/aia-logo.jpg" alt="AIA" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {supabaseEnabled
            ? connected
              ? <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--green)', fontSize: 11, fontWeight: 600 }}>
                  <span className="live-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />LIVE
                </span>
              : <span style={{ color: 'var(--amber)', fontSize: 11 }}>Connecting…</span>
            : <span style={{ color: 'var(--text-3)', fontSize: 11 }}>local</span>
          }
        </div>
      </div>

      {/* Score hero */}
      <div style={{
        background: 'linear-gradient(175deg, #201305 0%, #160e05 50%, var(--bg) 100%)',
        margin: '0 12px 0', borderRadius: 16, padding: '14px 16px',
        border: '1px solid rgba(255,153,51,0.14)', position: 'relative', overflow: 'hidden', flexShrink: 0,
      }}>
        <div style={{ position: 'absolute', top: -30, right: -10, width: 160, height: 130, background: 'radial-gradient(ellipse, rgba(255,153,51,0.11) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          {/* Match name */}
          <p style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 500, margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {getTeam(match.home_team_id)?.name} <span style={{ color: 'var(--text-3)' }}>vs</span> {getTeam(match.away_team_id)?.name}
          </p>
          {/* Toss result */}
          {toss?.winner_id && toss.elected && (
            <p style={{ color: 'var(--amber)', fontSize: 11, fontWeight: 600, margin: '0 0 8px' }}>
              🪙 {getTeam(toss.winner_id)?.short_name} won the toss &amp; elected to {toss.elected} first
            </p>
          )}

          {/* Innings toggle */}
          {(hasInn1 || hasInn2) && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {([1, 2] as const).map(n => {
                const isActive = activeInnings === n;
                const teamId = n === 1 ? match.home_team_id : match.away_team_id;
                const d = n === 1 ? derived1 : derived2;
                const hasData = n === 1 ? hasInn1 : hasInn2;
                return (
                  <button key={n} onClick={() => { userPickedInnings.current = true; setActiveInnings(n); }} disabled={n === 2 && !hasInn2}
                    style={{
                      flex: 1, padding: '7px 8px', borderRadius: 9,
                      background: isActive ? 'rgba(255,153,51,0.12)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${isActive ? 'rgba(255,153,51,0.28)' : 'var(--border)'}`,
                      color: isActive ? 'var(--green)' : hasData ? 'var(--text-2)' : 'var(--text-3)',
                      fontSize: 12, fontWeight: isActive ? 600 : 400, fontFamily: 'inherit',
                      cursor: (n === 2 && !hasInn2) ? 'not-allowed' : 'pointer',
                      opacity: (n === 2 && !hasInn2) ? 0.4 : 1,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                    <span>{getTeam(teamId)?.short_name}</span>
                    {hasData && <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                      {d.total}<span style={{ opacity: 0.5, fontWeight: 300 }}>/{d.wickets}</span>
                    </span>}
                  </button>
                );
              })}
            </div>
          )}

          {/* Score */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div>
              <p style={{ color: 'rgba(255,153,51,0.65)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 4px' }}>
                {getTeam(battingTeamId)?.name} batting
              </p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                <span className="tabular score-glow" style={{ fontSize: 56, fontWeight: 900, lineHeight: 1, letterSpacing: '-2px', color: activeDerived.total < 0 ? 'var(--red)' : 'var(--text)' }}>
                  {activeDerived.total}
                </span>
                <span style={{ fontSize: 20, fontWeight: 300, color: 'rgba(255,255,255,0.2)', margin: '0 2px' }}>/</span>
                <span className="tabular" style={{ fontSize: 20, fontWeight: 500, color: 'rgba(255,255,255,0.4)' }}>{activeDerived.wickets}</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              {totalLegalBalls > 0 ? (
                <>
                  <p style={{ color: 'var(--text)', fontSize: 16, fontWeight: 700, margin: '0 0 2px', fontVariantNumeric: 'tabular-nums' }}>
                    {activeDerived.is_complete ? formatOvers(totalLegalBalls, settings.balls_per_over) : `${activeDerived.current_absolute_over}.${activeDerived.current_ball}`} ov
                  </p>
                  <p style={{ color: 'var(--green)', fontSize: 12, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                    RR {runRate(activeDerived.total, totalLegalBalls, settings.balls_per_over)}
                  </p>
                </>
              ) : <p style={{ color: 'rgba(255,153,51,0.4)', fontSize: 12, margin: 0 }}>Not started</p>}
            </div>
          </div>

          {/* Chase strip — innings 2 live */}
          {activeInnings === 2 && hasInn1 && derived1.is_complete && !derived2.is_complete && (() => {
            const inn1Total = derived1.total;
            const target = inn1Total + 1;
            const runsNeeded = target - derived2.total;
            const totalBalls = match.settings.num_pairs * match.settings.overs_per_pair * match.settings.balls_per_over;
            const inn2Balls = inn2Del.filter(d => !d.is_deleted && d.legal_ball).length;
            const ballsLeft = totalBalls - inn2Balls;
            const isAhead = derived2.total > inn1Total;
            const rrr = ballsLeft > 0 && runsNeeded > 0
              ? ((runsNeeded / ballsLeft) * match.settings.balls_per_over).toFixed(2) : '—';
            return (
              <div style={{
                marginTop: 10, padding: '10px 12px', borderRadius: 10,
                background: isAhead ? 'rgba(29,184,92,0.09)' : 'rgba(255,153,51,0.09)',
                border: `1px solid ${isAhead ? 'rgba(29,184,92,0.22)' : 'rgba(255,153,51,0.22)'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ color: 'var(--text-3)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {isAhead ? 'Currently ahead' : 'Chasing'}
                  </span>
                  <span style={{ color: 'var(--amber)', fontSize: 12, fontWeight: 700 }}>Target {target}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 20, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: isAhead ? 'var(--blue)' : 'var(--amber)', lineHeight: 1 }}>
                      {isAhead ? `+${derived2.total - inn1Total}` : `Need ${runsNeeded}`}
                    </p>
                    {!isAhead && <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--text-3)' }}>{ballsLeft} balls remaining</p>}
                    {isAhead && <p style={{ margin: '3px 0 0', fontSize: 10, color: 'var(--text-3)' }}>All 12 overs must be played</p>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {!isAhead && <p style={{ margin: 0, fontSize: 12, color: 'var(--text-2)' }}>RRR <span style={{ fontWeight: 700, color: 'var(--amber)' }}>{rrr}</span></p>}
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-3)' }}>CRR <span style={{ fontWeight: 600, color: 'var(--text-2)' }}>{runRate(derived2.total, inn2Balls, match.settings.balls_per_over)}</span></p>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Match result — both innings complete */}
          {hasInn1 && hasInn2 && derived1.is_complete && derived2.is_complete && (() => {
            const inn1Score = derived1.total;
            const inn2Score = derived2.total;
            const winTeamId = inn2Score > inn1Score
              ? match.away_team_id
              : inn1Score > inn2Score ? match.home_team_id : null;
            const winTeam = winTeamId ? getTeam(winTeamId) : null;
            const margin = Math.abs(inn2Score - inn1Score);
            return (
              <div style={{
                marginTop: 10, padding: '12px 14px', borderRadius: 10,
                background: 'linear-gradient(135deg, rgba(255,153,51,0.12) 0%, rgba(255,153,51,0.04) 100%)',
                border: '1px solid rgba(255,153,51,0.28)', textAlign: 'center',
              }}>
                <p style={{ color: 'var(--text-3)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 5px' }}>Match Result</p>
                {winTeam ? (
                  <>
                    <p style={{ color: 'var(--amber)', fontSize: 18, fontWeight: 900, margin: '0 0 2px' }}>{winTeam.name} win!</p>
                    <p style={{ color: 'var(--text-2)', fontSize: 12, margin: 0 }}>by {margin} run{margin !== 1 ? 's' : ''}</p>
                  </>
                ) : (
                  <p style={{ color: 'var(--text-2)', fontSize: 16, fontWeight: 800, margin: 0 }}>Match Tied</p>
                )}
              </div>
            );
          })()}

          {activeDerived.is_complete && !derived2?.is_complete && (
            <div style={{ marginTop: 10, background: 'rgba(255,153,51,0.07)', borderRadius: 8, padding: '5px 12px', textAlign: 'center' }}>
              <span style={{ color: 'var(--green)', fontSize: 12, fontWeight: 600 }}>Innings 1 Complete</span>
            </div>
          )}
        </div>
      </div>

      {/* Win Predictor — during a live match (hidden once fully complete) */}
      {totalLegalBalls > 0 && !(derived1.is_complete && derived2.is_complete) && (() => {
        const firstTeam = battingTeamFromDeliveries(inn1Del, match.home_team_id);
        const secondTeam = battingTeamFromDeliveries(inn2Del, match.away_team_id);
        // Form of the batting team's current pair (in-form batters lift their chase).
        const battingDerived = hasInn2 ? derived2 : derived1;
        const cap = (id: string) => !!getPlayer(id)?.is_captain;
        const ff = battingFormFactor(
          batterFormOf(battingDerived.striker_id, tourBatting, cap(battingDerived.striker_id)),
          batterFormOf(battingDerived.non_striker_id, tourBatting, cap(battingDerived.non_striker_id)),
        );
        const pred = predictWin(
          { total: derived1.total, deliveries: inn1Del },
          { total: derived2.total, deliveries: inn2Del },
          hasInn2 ? 2 : 1, settings, ff, par,
        );
        return (
          <div style={{ margin: '10px 12px 0', flexShrink: 0 }}>
            <WinPredictor
              firstShort={getTeam(firstTeam)?.short_name ?? '?'}
              secondShort={getTeam(secondTeam)?.short_name ?? '?'}
              prediction={pred} activeInnings={hasInn2 ? 2 : 1}
            />
          </div>
        );
      })()}

      {/* Tab bar */}
      {totalLegalBalls > 0 && (
        <div style={{ display: 'flex', margin: '10px 12px 0', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 4, gap: 3, flexShrink: 0 }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flex: 1, padding: '7px 4px', borderRadius: 9,
              background: tab === t.key ? 'var(--surface-3)' : 'transparent',
              border: `1px solid ${tab === t.key ? 'var(--border)' : 'transparent'}`,
              color: tab === t.key ? 'var(--text)' : 'var(--text-3)',
              fontSize: 11, fontWeight: tab === t.key ? 600 : 400,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 32px' }}>
        {totalLegalBalls === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '64px 24px' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🏏</div>
            <p style={{ color: 'var(--text)', fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>Waiting for first ball…</p>
            <p style={{ color: 'var(--text-3)', fontSize: 13, margin: 0 }}>
              {getTeam(match.away_team_id)?.name} will bowl to {getTeam(match.home_team_id)?.name}
            </p>
          </div>
        )}

        {totalLegalBalls > 0 && tab === 'live' && (
          <LiveTab derived={activeDerived} currentBowler={currentBowler} activeDel={activeDel} settings={settings} />
        )}
        {totalLegalBalls > 0 && tab === 'scorecard' && (
          <ScorecardTab derived={activeDerived} pairs={activePairs} settings={settings} activeDel={activeDel} />
        )}
        {totalLegalBalls > 0 && tab === 'ball-by-ball' && (
          <BallByBallTab activeDel={activeDel} settings={settings} />
        )}
        {totalLegalBalls > 0 && tab === 'stats' && (
          <StatsTab derived={activeDerived} pairs={activePairs} totalLegalBalls={totalLegalBalls} settings={settings} />
        )}
      </div>

      {lastUpdated && (
        <p style={{ color: 'var(--text-3)', fontSize: 10, textAlign: 'center', padding: '6px 0', flexShrink: 0 }}>
          Updated {lastUpdated.toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}

// ── Live tab ──────────────────────────────────────────────────────────────────

function LiveTab({ derived, currentBowler, activeDel, settings }: {
  derived: DerivedMatchState;
  currentBowler: Player | undefined;
  activeDel: Delivery[];
  settings: NonNullable<ReturnType<typeof anyMatchRecord>>['match']['settings'];
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {derived.is_complete ? (
        <VCard>
          <p style={{ color: 'var(--text-3)', fontSize: 12, textAlign: 'center', padding: '8px 0' }}>Innings complete — see Scorecard for full details</p>
        </VCard>
      ) : (
        <>
          {/* Batters */}
          <VCard>
            <SHead>At the crease</SHead>
            <div style={{ marginBottom: 10 }}>
              {[
                { id: derived.striker_id, isStriker: true },
                { id: derived.non_striker_id, isStriker: false },
              ].map(({ id, isStriker }) => {
                const p = getPlayer(id);
                return (
                  <div key={id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: isStriker ? 'var(--green)' : 'var(--text-3)', display: 'inline-block', flexShrink: 0 }} />
                      <div>
                        <p style={{ color: isStriker ? 'var(--text)' : 'var(--text-2)', fontSize: 14, fontWeight: isStriker ? 600 : 400, margin: 0 }}>
                          {p?.name ?? '—'}
                          {isStriker && <span style={{ color: 'var(--green)', fontSize: 11, marginLeft: 5 }}>★</span>}
                        </p>
                        <p style={{ color: 'var(--text-3)', fontSize: 10, margin: '1px 0 0' }}>{isStriker ? 'On strike' : 'Non-striker'}</p>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                        {derived.batter_runs[id] ?? 0}
                      </span>
                      <span style={{ color: 'var(--text-3)', fontSize: 12 }}> ({derived.batter_balls[id] ?? 0})</span>
                      {(derived.batter_dismissals[id] ?? 0) > 0 && (
                        <p style={{ color: 'var(--red)', fontSize: 10, margin: '1px 0 0' }}>
                          {derived.batter_dismissals[id]}× out
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>🔴</div>
                <div>
                  <p style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600, margin: 0 }}>{currentBowler?.name ?? '—'}</p>
                  <p style={{ color: 'var(--text-3)', fontSize: 10, margin: '1px 0 0' }}>Bowling</p>
                </div>
              </div>
              {currentBowler && (
                <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
                  {bowlerFigures(
                    derived.bowler_overs[currentBowler.id] ?? 0,
                    derived.bowler_extra_balls[currentBowler.id] ?? 0,
                    derived.bowler_runs[currentBowler.id] ?? 0,
                    derived.bowler_wickets[currentBowler.id] ?? 0,
                  )}
                </span>
              )}
            </div>
          </VCard>

          {/* This over */}
          {(() => {
            const lastOverNum = settings.overs_per_innings - 1;
            const displayBalls = derived.is_complete
              ? activeDel.filter(d => !d.is_deleted && d.over_number === lastOverNum && d.extra_type !== 'strike_override')
              : derived.this_over_balls;
            const overLabel = derived.is_complete ? lastOverNum : derived.current_absolute_over;
            return (
              <VCard>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <SHead style={{ margin: 0 }}>Over {overLabel}</SHead>
                  {derived.awaiting_rebowl && (
                    <span style={{ color: 'var(--red)', fontSize: 11, fontWeight: 600 }}>Re-bowl required</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {displayBalls.length === 0
                    ? <span style={{ color: 'var(--text-3)', fontSize: 13 }}>New over — no balls yet</span>
                    : displayBalls.map(d => <BallDot key={d.id} delivery={d} />)}
                </div>
              </VCard>
            );
          })()}

          {/* Pair info */}
          <VCard>
            <SHead>Pair {derived.pair_index + 1} of {settings.num_pairs}</SHead>
            {derived.current_pair && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ color: 'var(--text-2)', fontSize: 13, margin: 0 }}>
                  {getPlayer(derived.current_pair.player1_id)?.name} &amp; {getPlayer(derived.current_pair.player2_id)?.name}
                </p>
                <span style={{ color: 'var(--green)', fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {(derived.pair_totals[derived.current_pair.id] ?? 0) >= 0 ? '+' : ''}{derived.pair_totals[derived.current_pair.id] ?? 0}
                </span>
              </div>
            )}
          </VCard>
        </>
      )}
    </div>
  );
}

// ── Scorecard tab ─────────────────────────────────────────────────────────────

function ScorecardTab({ derived, pairs, settings, activeDel }: {
  derived: DerivedMatchState; pairs: Pair[];
  settings: NonNullable<ReturnType<typeof anyMatchRecord>>['match']['settings'];
  activeDel: Delivery[];
}) {
  const extras = activeDel.filter(d => !d.is_deleted && d.extra_type !== 'none' && d.extra_type !== 'strike_override')
    .reduce((s, d) => s + d.extra_value, 0);
  const totalLegal = activeDel.filter(d => d.legal_ball).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Batting */}
      <VCard>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 34px 30px 50px 46px', gap: '2px 10px', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid var(--border-2)' }}>
          {['Batter', 'R', 'B', 'SR', 'Out'].map((h, i) => (
            <span key={h} style={{ color: 'var(--text-3)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: i > 0 ? 'right' : 'left' }}>{h}</span>
          ))}
        </div>
        {[...pairs].sort((a, b) => a.pair_number - b.pair_number).map(pair => {
          const pairTotal = derived.pair_totals[pair.id] ?? 0;
          const isCurrent = pair.id === derived.current_pair?.id;
          return (
            <div key={pair.id} style={{ marginBottom: 10, background: isCurrent ? 'rgba(255,153,51,0.04)' : 'transparent', borderRadius: isCurrent ? 8 : 0, padding: isCurrent ? '4px 6px' : '0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 600 }}>Pair {pair.pair_number}</span>
                <span style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: pairTotal < 0 ? 'var(--red)' : 'var(--green)' }}>
                  {pairTotal >= 0 ? '+' : ''}{pairTotal}
                </span>
              </div>
              {[pair.player1_id, pair.player2_id].map(pid => {
                const p = getPlayer(pid); if (!p) return null;
                const isStriker = derived.striker_id === pid;
                const balls = derived.batter_balls[pid] ?? 0;
                const runs = derived.batter_runs[pid] ?? 0;
                return (
                  <div key={pid} style={{ display: 'grid', gridTemplateColumns: '1fr 34px 30px 50px 46px', gap: '2px 10px', padding: '4px 0', borderBottom: '1px solid var(--border-2)' }}>
                    <span style={{ fontSize: 13, color: isStriker ? 'var(--green)' : 'var(--text-2)', fontWeight: isStriker ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name}{isStriker && ' ★'}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{runs}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{balls}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{sr(runs, balls)}</span>
                    <span style={{ fontSize: 12, color: 'var(--red)', textAlign: 'right' }}>{(derived.batter_dismissals[pid] ?? 0) > 0 ? `${derived.batter_dismissals[pid]}×` : '—'}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
        {/* Extras + total */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-3)', fontSize: 12 }}>Extras</span>
          <span style={{ color: 'var(--text-2)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{extras}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ color: 'var(--text)', fontSize: 14, fontWeight: 700 }}>Total</span>
          <span style={{ color: 'var(--text)', fontSize: 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
            {derived.total}/{derived.wickets} <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 400 }}>({formatOvers(totalLegal, settings.balls_per_over)} ov)</span>
          </span>
        </div>
      </VCard>

      {/* Bowling */}
      {Object.keys(derived.bowler_overs).length > 0 && (
        <VCard>
          <SHead>Bowling</SHead>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 34px 30px 50px 46px', gap: '2px 10px', marginBottom: 6 }}>
            {['Bowler', 'O', 'R', 'W', 'Econ'].map((h, i) => (
              <span key={h} style={{ color: 'var(--text-3)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: i > 0 ? 'right' : 'left' }}>{h}</span>
            ))}
          </div>
          {Object.keys(derived.bowler_overs).map(id => {
            const p = getPlayer(id); if (!p) return null;
            const o = derived.bowler_overs[id] ?? 0, eb = derived.bowler_extra_balls[id] ?? 0;
            const r = derived.bowler_runs[id] ?? 0, w = derived.bowler_wickets[id] ?? 0;
            const econVal = parseFloat(econ(r, o, eb, settings.balls_per_over));
            return (
              <div key={id} style={{ display: 'grid', gridTemplateColumns: '1fr 34px 30px 50px 46px', gap: '2px 10px', padding: '5px 0', borderBottom: '1px solid var(--border-2)' }}>
                <span style={{ fontSize: 13, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{eb > 0 ? `${o}.${eb}` : o}</span>
                <span style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: w > 0 ? 'var(--text)' : 'var(--text-3)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{w}</span>
                <span style={{ fontSize: 12, color: econVal <= 6 ? 'var(--green)' : econVal >= 12 ? 'var(--red)' : 'var(--text-3)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{econ(r, o, eb, settings.balls_per_over)}</span>
              </div>
            );
          })}
        </VCard>
      )}

      {/* Fall of Wickets */}
      {derived.fall_of_wickets.length > 0 && (
        <VCard>
          <SHead>Fall of Wickets</SHead>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {derived.fall_of_wickets.map((fow, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border-2)' }}>
                <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                  {fow.wicket_num}. {getPlayer(fow.player_id)?.name}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
                  {fow.total} — ov {fow.over_display}
                </span>
              </div>
            ))}
          </div>
        </VCard>
      )}
    </div>
  );
}

// ── Ball by Ball tab ──────────────────────────────────────────────────────────

function BallByBallTab({ activeDel, settings }: {
  activeDel: Delivery[];
  settings: NonNullable<ReturnType<typeof anyMatchRecord>>['match']['settings'];
}) {
  const legalDels = activeDel.filter(d => !d.is_deleted && d.extra_type !== 'strike_override');

  // Group by absolute over
  const overMap = new Map<number, Delivery[]>();
  for (const d of legalDels) {
    const key = d.over_number;
    if (!overMap.has(key)) overMap.set(key, []);
    overMap.get(key)!.push(d);
  }
  const overs = [...overMap.entries()].sort(([a], [b]) => a - b);

  if (overs.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0' }}>
        <p style={{ color: 'var(--text-3)', fontSize: 13 }}>No balls recorded yet</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {[...overs].reverse().map(([overNum, balls]) => {
        const netEffect = balls.reduce((s, d) => s + d.net_run_effect, 0);
        const wickets = balls.filter(d => d.is_wicket).length;
        const bowler = getPlayer(balls[0]?.bowler_id);
        const pairNum = Math.floor(overNum / settings.overs_per_pair) + 1;

        return (
          <VCard key={overNum}>
            {/* Over header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div>
                <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 700 }}>Over {overNum + 1}</span>
                <span style={{ color: 'var(--text-3)', fontSize: 11, marginLeft: 8 }}>Pair {pairNum}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: netEffect < 0 ? 'var(--red)' : 'var(--text-2)' }}>
                  {netEffect >= 0 ? '+' : ''}{netEffect}
                </span>
                {wickets > 0 && (
                  <span style={{ color: 'var(--red)', fontSize: 11, marginLeft: 6 }}>{wickets}W</span>
                )}
              </div>
            </div>

            {/* Balls */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {balls.map(d => <BallDot key={d.id} delivery={d} />)}
            </div>

            {/* Bowler + batter detail */}
            <div style={{ borderTop: '1px solid var(--border-2)', paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-3)', fontSize: 11 }}>
                <span style={{ color: 'var(--text-2)', fontWeight: 500 }}>{bowler?.name ?? '—'}</span> bowling
              </span>
              {/* Ball-by-ball text summary */}
              <span style={{ color: 'var(--text-3)', fontSize: 11, fontFamily: 'monospace', letterSpacing: '0.05em' }}>
                {balls.map(d => {
                  if (d.is_wicket) return 'W';
                  if (d.extra_type === 'wide') return 'Wd';
                  if (d.extra_type === 'no_ball') return 'NB';
                  if (d.extra_type === 'bye') return `${d.extra_value}b`;
                  if (d.extra_type === 'leg_bye') return `${d.extra_value}lb`;
                  return d.runs_off_bat === 0 ? '·' : String(d.runs_off_bat);
                }).join(' · ')}
              </span>
            </div>
          </VCard>
        );
      })}
    </div>
  );
}

// ── Stats tab ─────────────────────────────────────────────────────────────────

function StatsTab({ derived, pairs, totalLegalBalls, settings }: {
  derived: DerivedMatchState; pairs: Pair[];
  totalLegalBalls: number;
  settings: { balls_per_over: number; overs_per_innings: number };
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <VCard>
        <SHead>Runs per Over</SHead>
        <ManhattanChart perOverRuns={derived.per_over_runs} totalOvers={settings.overs_per_innings} currentAbsoluteOver={derived.current_absolute_over} isComplete={derived.is_complete} />
      </VCard>

      <VCard>
        <SHead>Partnerships</SHead>
        <div style={{ display: 'grid', gridTemplateColumns: '20px 1fr 40px 32px 46px', gap: '2px 8px', marginBottom: 6 }}>
          {['#', 'Pair', 'R', 'B', 'RR'].map((h, i) => (
            <span key={h} style={{ color: 'var(--text-3)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: i > 1 ? 'right' : 'left' }}>{h}</span>
          ))}
        </div>
        {[...pairs].sort((a, b) => a.pair_number - b.pair_number).map(pair => {
          const p1 = getPlayer(pair.player1_id), p2 = getPlayer(pair.player2_id);
          const runs = derived.pair_totals[pair.id] ?? 0;
          const balls = derived.pair_balls[pair.id] ?? 0;
          const outs = derived.pair_wickets[pair.id] ?? 0;
          const rr = balls > 0 ? ((runs / balls) * settings.balls_per_over).toFixed(1) : '—';
          const isCurrent = pair.id === derived.current_pair?.id;
          return (
            <div key={pair.id} style={{ display: 'grid', gridTemplateColumns: '20px 1fr 40px 32px 46px', gap: '2px 8px', padding: '5px 0', borderBottom: '1px solid var(--border-2)', color: isCurrent ? 'var(--green)' : 'inherit' }}>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{pair.pair_number}</span>
              <span style={{ fontSize: 12, color: isCurrent ? 'var(--green)' : 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p1?.name} &amp; {p2?.name}
                {outs > 0 && <span style={{ color: 'var(--red)', marginLeft: 4 }}>×{outs}</span>}
              </span>
              <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: runs < 0 ? 'var(--red)' : 'var(--text)', textAlign: 'right', fontWeight: 600 }}>{runs}</span>
              <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: 'var(--text-3)', textAlign: 'right' }}>{balls || '—'}</span>
              <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: 'var(--amber)', textAlign: 'right' }}>{rr}</span>
            </div>
          );
        })}
      </VCard>

      <VCard>
        <SHead>Batting Breakdown</SHead>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 32px 28px 50px 30px 30px', gap: '2px 8px', marginBottom: 6 }}>
          {['Batter', 'R', 'B', 'SR', '4s', '6s'].map((h, i) => (
            <span key={h} style={{ color: 'var(--text-3)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: i > 0 ? 'right' : 'left' }}>{h}</span>
          ))}
        </div>
        {[...pairs].sort((a, b) => a.pair_number - b.pair_number).flatMap(pair =>
          [pair.player1_id, pair.player2_id].map(pid => {
            const p = getPlayer(pid); if (!p) return null;
            const r = derived.batter_runs[pid] ?? 0, b = derived.batter_balls[pid] ?? 0;
            if (b === 0) return null;
            const isStriker = derived.striker_id === pid;
            return (
              <div key={pid} style={{ display: 'grid', gridTemplateColumns: '1fr 32px 28px 50px 30px 30px', gap: '2px 8px', padding: '5px 0', borderBottom: '1px solid var(--border-2)' }}>
                <span style={{ fontSize: 12, color: isStriker ? 'var(--green)' : 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}{isStriker && ' ★'}
                </span>
                <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: 'var(--text)', textAlign: 'right', fontWeight: 600 }}>{r}</span>
                <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: 'var(--text-3)', textAlign: 'right' }}>{b}</span>
                <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: parseFloat(sr(r, b)) >= 150 ? 'var(--green)' : 'var(--text-3)', textAlign: 'right' }}>{sr(r, b)}</span>
                <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: 'var(--blue)', textAlign: 'right' }}>{derived.batter_fours[pid] || '—'}</span>
                <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: 'var(--purple)', textAlign: 'right' }}>{derived.batter_sixes[pid] || '—'}</span>
              </div>
            );
          }).filter(Boolean)
        )}
      </VCard>

      <p style={{ color: 'var(--text-3)', fontSize: 11, textAlign: 'center' }}>
        {formatOvers(totalLegalBalls, settings.balls_per_over)} overs · RR {runRate(derived.total, totalLegalBalls, settings.balls_per_over)}
      </p>
    </div>
  );
}

// ── Micro helpers ─────────────────────────────────────────────────────────────

function VCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px' }}>
      {children}
    </div>
  );
}

function SHead({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <p style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px', ...style }}>
      {children}
    </p>
  );
}
