import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RotateCcw, ArrowLeftRight } from 'lucide-react';
import { useGame } from '../context/GameContext';
import { BallDot } from '../components/BallDot';
import { BowlerModal } from '../components/BowlerModal';
import { bowlerFigures, deriveMatchState, formatOvers, runRate } from '../lib/engine';
import { predictWin, battingFormFactor, batterFormOf } from '../lib/winPredictor';
import { WinPredictor } from '../components/WinPredictor';
import { loadTournamentStats } from '../lib/tournamentStats';
import { anyPar, anySchedule, anyPlayersOfTeam, anyMatchRecord, isMensId } from '../lib/resolve';
import { getCompletedMatchIds, recordMatchComplete, setLiveMatchId, getEffectiveStatus } from '../lib/matchState';
import type { ExtraType, WicketType } from '../lib/types';

type ExtraModal = 'none' | 'bye' | 'leg_bye' | 'wicket_type';

// ─── helpers ────────────────────────────────────────────────────────────────

const S = {
  bg:       'var(--bg)',
  surface:  'var(--surface)',
  surface2: 'var(--surface-2)',
  border:   'var(--border)',
  text:     'var(--text)',
  text2:    'var(--text-2)',
  text3:    'var(--text-3)',
  green:    'var(--green)',
  red:      'var(--red)',
  amber:    'var(--amber)',
  purple:   'var(--purple)',
  orange:   'var(--orange)',
};

// ─── Run button ──────────────────────────────────────────────────────────────

function RunBtn({ n, onClick }: { n: number; onClick: () => void }) {
  const styles: Record<number, React.CSSProperties> = {
    0: { background: 'transparent', borderColor: 'rgba(255,255,255,0.07)', color: '#334155' },
    1: { background: 'var(--surface-2)', borderColor: 'rgba(255,255,255,0.10)', color: '#f1f5f9' },
    2: { background: 'var(--surface-2)', borderColor: 'rgba(255,255,255,0.10)', color: '#f1f5f9' },
    3: { background: 'var(--surface-2)', borderColor: 'rgba(255,255,255,0.10)', color: '#f1f5f9' },
    4: { background: 'var(--amber-2)', borderColor: 'rgba(245,158,11,0.35)', color: '#fcd34d' },
    6: { background: 'var(--purple-2)', borderColor: 'rgba(168,85,247,0.35)', color: '#e9d5ff' },
  };
  return (
    <button
      onClick={onClick}
      className="tap"
      style={{
        width: '100%', aspectRatio: '1',
        maxWidth: 120, maxHeight: 120,
        borderRadius: '50%',
        border: '1.5px solid',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 800,
        fontSize: n === 6 ? 28 : n === 0 ? 18 : 24,
        fontFamily: 'inherit',
        ...(styles[n] ?? styles[1]),
      }}
    >
      {n === 0 ? '·' : n}
    </button>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function ScorerView() {
  const { state, derived, dispatch, getPlayer, getTeam, syncStatus, queuedCount } = useGame();
  const navigate = useNavigate();
  const exitToDashboard = () => {
    if (confirm('Exit to the match list? Your progress is saved and you can resume this match anytime.')) {
      navigate(isMensId(state.matchId) ? '/mens/score' : '/score');
    }
  };
  const { phase, match } = state;
  const slot = state.activeInnings === 1 ? state.inn1 : state.inn2;
  const deliveries = slot.deliveries;
  const innings = slot.innings;
  const settings = match.settings;

  const [manualFlip, setManualFlip] = useState(false);
  const [extraModal, setExtraModal] = useState<ExtraModal>('none');
  const [showScorecard, setShowScorecard] = useState(false);
  const [tourBatting, setTourBatting] = useState<{ player_id: string; runs: number; balls: number }[]>([]);
  const [par, setPar] = useState(80);

  useEffect(() => {
    const load = () => {
      loadTournamentStats(isMensId(state.matchId) ? 'mens' : 'womens').then(s => setTourBatting(s.batting.map(r => ({ player_id: r.player_id, runs: r.runs, balls: r.balls }))));
      anyPar(state.matchId).then(setPar);
    };
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  const striker    = getPlayer(derived.striker_id);
  const nonStriker = getPlayer(derived.non_striker_id);
  const bowler     = getPlayer(state.current_bowler_id);
  const battingTeam = getTeam(innings.batting_team_id);
  const pair = derived.current_pair;
  const p1 = pair ? getPlayer(pair.player1_id) : null;
  const p2 = pair ? getPlayer(pair.player2_id) : null;

  const legalBowled = deliveries.filter(d => !d.is_deleted && d.legal_ball).length;
  const totalMatchBalls = settings.num_pairs * settings.overs_per_pair * settings.balls_per_over;
  const legalRemaining = totalMatchBalls - legalBowled;
  const overDisplay = `${derived.current_absolute_over}.${derived.current_ball}`;
  const rr = runRate(derived.total, legalBowled, settings.balls_per_over);

  // Chase calculations (innings 2 only)
  const chasing = state.activeInnings === 2 && state.inn1.final_score !== null;
  const inn1Total = state.inn1.final_score ?? 0;
  const chaseTarget = inn1Total + 1;
  const runsNeeded = chaseTarget - derived.total;
  const isAhead = chasing && derived.total > inn1Total;
  const rrr = chasing && legalRemaining > 0 && runsNeeded > 0
    ? ((runsNeeded / legalRemaining) * settings.balls_per_over).toFixed(2)
    : '—';

  function record(runs_off_bat: number, extra_type: ExtraType, extra_value: number, is_wicket: boolean, wicket_type?: WicketType, fielder_id?: string) {
    dispatch({ type: 'RECORD_DELIVERY', payload: { runs_off_bat, extra_type, extra_value, is_wicket, wicket_type, fielder_id, manual_strike_flip: manualFlip } });
    setManualFlip(false);
  }

  // ── Phase: toss ───────────────────────────────────────────────────────────

  if (phase === 'toss') {
    return <TossScreen />;
  }

  // ── Phase: select pair ────────────────────────────────────────────────────

  if (phase === 'select_pair') {
    return <PairSelectScreen />;
  }

  // ── Phase: setup (bowler selection after pair confirmed) ──────────────────

  if (phase === 'setup') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-5" style={{ background: S.bg, maxWidth: 480, margin: '0 auto' }}>
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 style={{ color: S.text, fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>{getTeam(match.home_team_id)?.name} vs {getTeam(match.away_team_id)?.name}</h1>
            <p style={{ color: S.text3, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 2px' }}>{match.name}</p>
            <p style={{ color: S.text3, fontSize: 13, margin: '0 0 12px' }}>
              Innings {state.activeInnings} · {battingTeam?.name} batting
            </p>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 16px' }}>
              <p style={{ color: S.text3, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>
                Pair {derived.pair_index + 1} batting
              </p>
              <p style={{ color: S.green, fontWeight: 700, fontSize: 15, margin: 0 }}>
                {p1?.name ?? '?'} &amp; {p2?.name ?? '?'}
              </p>
            </div>
          </div>
          <p style={{ color: S.text3, fontSize: 13, textAlign: 'center', marginBottom: 12 }}>
            Select bowler
          </p>
          <BowlerModal onSelect={id => dispatch({ type: 'SET_BOWLER', bowler_id: id })} />
        </div>
      </div>
    );
  }

  // ── Phase: end of over / pair set ─────────────────────────────────────────

  if (phase === 'end_of_over' || phase === 'end_of_pair_set') {
    const isEndOfPairSet = phase === 'end_of_pair_set';
    // The pair that JUST finished = the one the last delivery belonged to (the derived
    // state has already advanced to the next, still-empty pair by this point).
    const lastReal = [...deliveries].reverse().find(d => !d.is_deleted && d.extra_type !== 'strike_override');
    const donePair = lastReal ? slot.pairs.find(p => p.id === lastReal.pair_id) : undefined;
    const donePairNum = donePair?.pair_number ?? derived.pair_index;
    const doneP1 = donePair ? getPlayer(donePair.player1_id) : undefined;
    const doneP2 = donePair ? getPlayer(donePair.player2_id) : undefined;
    const doneTotal = derived.pair_totals[donePair?.id ?? ''] ?? 0;
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-5" style={{ background: S.bg, maxWidth: 480, margin: '0 auto' }}>
        <div className="w-full max-w-sm text-center">
          {isEndOfPairSet ? (
            <>
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: 'var(--green-2)', border: '1px solid rgba(255,153,51,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 20px', fontSize: 32,
              }}>✓</div>
              <h2 style={{ color: S.text, fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>
                Pair {donePairNum} Complete
              </h2>
              <p style={{ color: S.text3, fontSize: 13, margin: '0 0 4px' }}>
                {doneP1?.name} &amp; {doneP2?.name}
              </p>
              <p style={{ color: doneTotal < 0 ? S.red : S.green, fontSize: 36, fontWeight: 800, margin: '8px 0 28px', letterSpacing: '-1px' }}>
                {doneTotal >= 0 ? '+' : ''}{doneTotal}
              </p>
              <button
                onClick={() => dispatch({ type: 'NEXT_PAIR' })}
                className="tap w-full"
                style={{
                  padding: '16px', borderRadius: 14, fontWeight: 700, fontSize: 16,
                  background: 'var(--green)', color: '#1a0800', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Select Pair {donePairNum + 1} →
              </button>
            </>
          ) : (
            <>
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 20px', fontSize: 28, color: S.text2,
              }}>↺</div>
              <h2 style={{ color: S.text, fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>
                Over {derived.current_absolute_over} Complete
              </h2>
              <p style={{ color: S.text3, fontSize: 13, margin: '0 0 16px' }}>Select next bowler</p>
              <BowlerModal onSelect={id => dispatch({ type: 'SET_BOWLER', bowler_id: id })} />
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Phase: innings break ──────────────────────────────────────────────────

  if (phase === 'innings_break') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-5" style={{ background: S.bg, maxWidth: 480, margin: '0 auto' }}>
        <div className="w-full max-w-sm text-center">
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            background: 'var(--green-2)', border: '1px solid rgba(255,153,51,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px', fontSize: 36,
          }}>✓</div>
          <p style={{ color: S.text3, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Innings 1 Complete</p>
          <h2 style={{ color: S.text, fontSize: 20, fontWeight: 600, margin: '0 0 12px' }}>
            {getTeam(innings.batting_team_id)?.name}
          </h2>
          <p style={{ color: S.green, fontSize: 72, fontWeight: 900, letterSpacing: '-3px', lineHeight: 1, margin: '0 0 24px' }}>
            {derived.total}
          </p>

          <div className="card p-4 mb-4 text-left">
            <p style={{ color: S.text3, fontSize: 12, marginBottom: 4 }}>Now batting</p>
            <p style={{ color: S.text, fontWeight: 700, fontSize: 17, margin: '0 0 4px' }}>
              {getTeam(innings.bowling_team_id)?.name}
            </p>
            <p style={{ color: S.text2, fontSize: 13 }}>
              Target: <span style={{ color: S.amber, fontWeight: 700 }}>{derived.total + 1}</span>
            </p>
          </div>
          <div style={{ background: 'rgba(255,153,51,0.08)', border: '1px solid rgba(255,153,51,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 24, textAlign: 'left' }}>
            <p style={{ color: S.amber, fontSize: 12, fontWeight: 700, margin: '0 0 3px' }}>Both teams must bowl all 12 overs</p>
            <p style={{ color: S.text3, fontSize: 11, margin: 0 }}>Wickets = −{settings.dismissal_penalty * -1} runs. The chasing team cannot win early — highest score after 12 overs wins.</p>
          </div>

          <button
            onClick={() => dispatch({ type: 'START_INNINGS_2' })}
            className="tap w-full"
            style={{
              padding: '16px', borderRadius: 14, fontWeight: 700, fontSize: 16,
              background: 'var(--green)', color: '#1a0800', border: 'none', cursor: 'pointer',
            }}
          >
            Start Innings 2
          </button>
          <Link to="/" style={{ display: 'block', marginTop: 16, color: S.text3, fontSize: 13, textDecoration: 'none' }}>
            ← Back to tournament
          </Link>
        </div>
      </div>
    );
  }

  // ── Phase: complete ───────────────────────────────────────────────────────

  if (phase === 'complete') return <ScorecardView />;

  // ── MAIN SCORING VIEW ─────────────────────────────────────────────────────

  const awaitingRebowl = derived.awaiting_rebowl;
  const isFinalBall = derived.next_ball.is_last_ball_of_pair_set;

  return (
    <div className="flex flex-col min-h-dvh" style={{ background: S.bg, maxWidth: 480, margin: '0 auto' }}>

      {/* ── Sync banner ── */}
      {(syncStatus === 'offline' || syncStatus === 'queued' || syncStatus === 'syncing' || syncStatus === 'error') && (
        <div style={{
          padding: '8px 16px', textAlign: 'center', fontSize: 12, fontWeight: 600,
          background: syncStatus === 'error' ? 'rgba(239,68,68,0.15)' : syncStatus === 'syncing' ? 'rgba(59,130,246,0.15)' : 'rgba(245,158,11,0.12)',
          color: syncStatus === 'error' ? '#fca5a5' : syncStatus === 'syncing' ? '#93c5fd' : '#fcd34d',
          borderBottom: '1px solid var(--border)',
        }}>
          {syncStatus === 'offline' && 'Offline — scoring locally'}
          {syncStatus === 'queued' && `Offline — ${queuedCount} ball${queuedCount !== 1 ? 's' : ''} queued`}
          {syncStatus === 'syncing' && `Syncing ${queuedCount} ball${queuedCount !== 1 ? 's' : ''}…`}
          {syncStatus === 'error' && 'Sync failed — undo to retry'}
        </div>
      )}

      {/* ── Alert banners ── */}
      {awaitingRebowl && (
        <div style={{ padding: '10px 16px', background: 'rgba(239,68,68,0.15)', borderBottom: '1px solid rgba(239,68,68,0.2)', textAlign: 'center' }}>
          <span style={{ color: '#fca5a5', fontSize: 13, fontWeight: 600 }}>Last ball of pair was Wide/No Ball — Re-bowl required</span>
        </div>
      )}
      {!awaitingRebowl && isFinalBall && (
        <div style={{ padding: '10px 16px', background: 'rgba(245,158,11,0.12)', borderBottom: '1px solid rgba(245,158,11,0.2)', textAlign: 'center' }}>
          <span style={{ color: '#fcd34d', fontSize: 13, fontWeight: 600 }}>Last ball of pair — must be a legal delivery</span>
        </div>
      )}

      {/* ── Score header ── */}
      <div style={{
        background: 'linear-gradient(175deg, #201305 0%, #160e05 55%, var(--bg) 100%)',
        borderBottom: '1px solid rgba(255,153,51,0.10)',
        position: 'relative', overflow: 'hidden', padding: '20px 20px 16px',
      }}>
        {/* Green radial glow */}
        <div style={{
          position: 'absolute', top: -20, left: '50%', transform: 'translateX(-50%)',
          width: 240, height: 120, pointerEvents: 'none',
          background: 'radial-gradient(ellipse at 50% 0%, rgba(255,153,51,0.18) 0%, transparent 70%)',
        }} />

        <div style={{ position: 'relative' }}>
          {/* Exit to match list */}
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 10 }}>
            <button onClick={exitToDashboard} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-2)',
              borderRadius: 20, padding: '5px 12px', color: S.text2, fontSize: 11, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>← Exit to Match List</button>
          </div>
          {/* Top row: team + live */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <p style={{ color: 'rgba(34,197,94,0.7)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>
              {battingTeam?.name}
            </p>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,153,51,0.12)', border: '1px solid rgba(255,153,51,0.25)', borderRadius: 99, padding: '2px 8px', fontSize: 11, fontWeight: 600, color: S.green }}>
              <span className="live-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: S.green, display: 'inline-block' }} />
              LIVE
            </span>
          </div>

          {/* Score */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
            <span className="tabular score-glow" style={{
              fontSize: 64, fontWeight: 900, lineHeight: 1, letterSpacing: '-2px',
              color: derived.total < 0 ? '#fca5a5' : S.text,
            }}>
              {derived.total}
            </span>
            <span style={{ fontSize: 22, fontWeight: 300, color: 'rgba(255,255,255,0.25)', margin: '0 2px' }}>/</span>
            <span className="tabular" style={{ fontSize: 22, fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>
              {derived.wickets}
            </span>
          </div>

          {/* Sub stats */}
          <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
            {[
              { label: 'Over', val: overDisplay },
              { label: 'CRR', val: rr },
              { label: `${derived.over_within_pair + 1}/${settings.overs_per_pair}`, val: 'pair' },
              { label: 'Left', val: `${legalRemaining}b` },
            ].map(({ label, val }) => (
              <div key={label}>
                <span style={{ color: S.text3, fontSize: 11, fontWeight: 500 }}>{label} </span>
                <span className="tabular" style={{ color: S.text2, fontSize: 12, fontWeight: 600 }}>{val}</span>
              </div>
            ))}
          </div>

          {/* Chase strip — innings 2 */}
          {chasing && (
            <div style={{
              marginTop: 12, padding: '10px 14px', borderRadius: 11,
              background: isAhead ? 'rgba(29,184,92,0.10)' : 'rgba(255,153,51,0.10)',
              border: `1px solid ${isAhead ? 'rgba(29,184,92,0.25)' : 'rgba(255,153,51,0.25)'}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <p style={{ margin: 0, fontSize: 10, color: S.text3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {isAhead ? 'Currently ahead' : 'Need'}
                </p>
                <p style={{ margin: '3px 0 0', fontSize: 22, fontWeight: 900, letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums', lineHeight: 1, color: isAhead ? 'var(--blue)' : S.amber }}>
                  {isAhead
                    ? `+${derived.total - inn1Total}`
                    : <>{runsNeeded} <span style={{ fontSize: 12, fontWeight: 500, color: S.text3 }}>from {legalRemaining}b</span></>
                  }
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: 0, fontSize: 11, color: S.text3 }}>
                  Target <span style={{ color: S.amber, fontWeight: 700 }}>{chaseTarget}</span>
                </p>
                <p style={{ margin: '3px 0 0', fontSize: 11, color: S.text2 }}>
                  RRR <span style={{ fontWeight: 700, color: isAhead ? 'var(--blue)' : S.amber }}>{isAhead ? '—' : rrr}</span>
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 9, color: S.text3, opacity: 0.7 }}>All 12 overs must be played</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Pair label ── */}
      <div style={{ padding: '8px 20px', borderBottom: '1px solid var(--border-2)', background: 'var(--surface)' }}>
        <p style={{ color: S.text3, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
          Pair {derived.pair_index + 1} of {settings.num_pairs}
          {p1 && <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}> · {p1.name} &amp; {p2?.name}</span>}
        </p>
      </div>

      {/* ── Win Predictor ── */}
      {(() => {
        const d1 = deriveMatchState(state.inn1.deliveries, state.inn1.pairs, settings);
        const d2 = deriveMatchState(state.inn2.deliveries, state.inn2.pairs, settings);
        const hasInn2 = state.inn2.deliveries.some(d => !d.is_deleted);
        const bd = hasInn2 ? d2 : d1;
        const cap = (id: string) => !!getPlayer(id)?.is_captain;
        const ff = battingFormFactor(
          batterFormOf(bd.striker_id, tourBatting, cap(bd.striker_id)),
          batterFormOf(bd.non_striker_id, tourBatting, cap(bd.non_striker_id)),
        );
        const pred = predictWin(
          { total: d1.total, deliveries: state.inn1.deliveries },
          { total: d2.total, deliveries: state.inn2.deliveries },
          hasInn2 ? 2 : 1, settings, ff, par,
        );
        return (
          <div style={{ padding: '10px 16px 0' }}>
            <WinPredictor
              firstShort={getTeam(state.inn1.innings.batting_team_id)?.short_name ?? '?'}
              secondShort={getTeam(state.inn2.innings.batting_team_id)?.short_name ?? '?'}
              prediction={pred} activeInnings={hasInn2 ? 2 : 1}
            />
          </div>
        );
      })()}

      {/* ── Batters + bowler ── */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        {/* Batters */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          {[
            { player: striker, id: derived.striker_id, isStriker: true },
            { player: nonStriker, id: derived.non_striker_id, isStriker: false },
          ].map(({ player, id, isStriker }) => (
            <div key={id} style={{ flex: 1, textAlign: isStriker ? 'left' : 'right' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: isStriker ? 'flex-start' : 'flex-end' }}>
                {!isStriker && <span style={{ fontSize: 13, color: S.text2, fontWeight: 500 }}>{player?.name ?? '—'}</span>}
                <span style={{
                  width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                  background: isStriker ? S.green : S.text3,
                }} />
                {isStriker && (
                  <span style={{ fontSize: 14, color: S.text, fontWeight: 600 }}>
                    {player?.name ?? '—'} <span style={{ color: S.green, fontSize: 12 }}>★</span>
                  </span>
                )}
              </div>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: S.text3, fontFamily: 'monospace', textAlign: isStriker ? 'left' : 'right', paddingLeft: isStriker ? 13 : 0, paddingRight: isStriker ? 0 : 13 }}>
                <span style={{ color: S.text2 }}>{derived.batter_runs[id] ?? 0}</span>
                <span style={{ color: S.text3 }}> ({derived.batter_balls[id] ?? 0})</span>
                {(derived.batter_dismissals[id] ?? 0) > 0 && <span style={{ color: '#f87171' }}> ×{derived.batter_dismissals[id]}</span>}
              </p>
            </div>
          ))}
        </div>

        {/* Bowler */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          <p style={{ margin: 0, fontSize: 13, color: S.text2 }}>
            <span style={{ color: S.text3 }}>Bowling · </span>
            <span style={{ fontWeight: 600, color: S.text }}>{bowler?.name ?? '—'}</span>
          </p>
          {bowler && (
            <span style={{ fontFamily: 'monospace', fontSize: 12, color: S.text3 }}>
              {bowlerFigures(derived.bowler_overs[bowler.id] ?? 0, derived.bowler_extra_balls[bowler.id] ?? 0, derived.bowler_runs[bowler.id] ?? 0, derived.bowler_wickets[bowler.id] ?? 0)}
            </span>
          )}
        </div>
      </div>

      {/* ── This over ── */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <p style={{ color: S.text3, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0, flexShrink: 0 }}>
            Over {derived.current_absolute_over}
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {derived.this_over_balls.length === 0
              ? <span style={{ color: S.text3, fontSize: 13 }}>New over</span>
              : derived.this_over_balls.map(d => <BallDot key={d.id} delivery={d} small />)}
          </div>
        </div>
      </div>

      {/* ── Manual flip indicator ── */}
      {manualFlip && (
        <div style={{ padding: '8px 20px', background: 'rgba(245,158,11,0.1)', borderBottom: '1px solid rgba(245,158,11,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#fcd34d', fontSize: 12, fontWeight: 600 }}>Strike will swap on next ball</span>
          <button onClick={() => setManualFlip(false)} style={{ color: '#f59e0b', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
        </div>
      )}

      {/* ── Scoring buttons ── */}
      <div style={{ flex: 1, padding: '16px 16px 8px' }}>

        {/* Run grid: 1 2 3 / 4 6 · */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 10, justifyItems: 'center' }}>
          <RunBtn n={1} onClick={() => record(1,'none',0,false)} />
          <RunBtn n={2} onClick={() => record(2,'none',0,false)} />
          <RunBtn n={3} onClick={() => record(3,'none',0,false)} />
          <RunBtn n={4} onClick={() => record(4,'none',0,false)} />
          <RunBtn n={6} onClick={() => record(6,'none',0,false)} />
          <RunBtn n={0} onClick={() => record(0,'none',0,false)} />
        </div>

        {/* Extras row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <ExtraBtn label={`WIDE +${settings.wide_value}`} onClick={() => record(0,'wide',settings.wide_value,false)} color="orange" />
          <ExtraBtn label={`NO BALL +${settings.no_ball_value}`} onClick={() => record(0,'no_ball',settings.no_ball_value,false)} color="orange" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <ExtraBtn label="BYE" onClick={() => setExtraModal('bye')} color="muted" />
          <ExtraBtn label="LEG BYE" onClick={() => setExtraModal('leg_bye')} color="muted" />
        </div>

        {/* Wicket */}
        <button
          onClick={() => setExtraModal('wicket_type')}
          className="tap w-full"
          style={{
            padding: '16px', borderRadius: 12, marginBottom: 8,
            background: 'linear-gradient(135deg, rgba(127,29,29,0.6) 0%, rgba(185,28,28,0.4) 100%)',
            border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5',
            fontWeight: 800, fontSize: 16, cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}
        >
          WICKET
          <span style={{ opacity: 0.6, fontWeight: 400, fontSize: 14 }}>
            {settings.dismissal_penalty}
          </span>
        </button>

        {/* Undo + swap */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <button
            onClick={() => { dispatch({ type: 'UNDO' }); setManualFlip(false); }}
            className="tap"
            style={{
              padding: '13px 8px', borderRadius: 10,
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              color: S.text2, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <RotateCcw size={15} /> Undo
          </button>
          <button
            onClick={() => setManualFlip(f => !f)}
            className="tap"
            style={{
              padding: '13px 8px', borderRadius: 10,
              background: manualFlip ? 'rgba(245,158,11,0.15)' : 'var(--surface-2)',
              border: manualFlip ? '1px solid rgba(245,158,11,0.35)' : '1px solid var(--border)',
              color: manualFlip ? '#fcd34d' : S.text2,
              fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <ArrowLeftRight size={15} /> Swap
          </button>
        </div>

        {/* Scorecard toggle */}
        <button
          onClick={() => setShowScorecard(s => !s)}
          style={{
            width: '100%', padding: '10px', borderRadius: 10,
            background: 'transparent', border: '1px solid var(--border)',
            color: S.text3, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          {showScorecard ? 'Hide' : 'View'} Scorecard
        </button>
      </div>

      {showScorecard && <InlineScorecard />}

      {/* ── Modals ── */}
      {extraModal === 'wicket_type' && (
        <WicketModal
          bowlingTeamId={innings.bowling_team_id}
          onConfirm={(wt, fielderId) => { record(0,'none',0,true,wt,fielderId); setExtraModal('none'); }}
          onCancel={() => setExtraModal('none')}
        />
      )}
      {(extraModal === 'bye' || extraModal === 'leg_bye') && (
        <RunsModal
          label={extraModal === 'bye' ? 'Bye' : 'Leg Bye'}
          onConfirm={n => { record(0, extraModal === 'bye' ? 'bye' : 'leg_bye', n, false); setExtraModal('none'); }}
          onCancel={() => setExtraModal('none')}
        />
      )}
    </div>
  );
}

// ─── Extra button helper ─────────────────────────────────────────────────────

function ExtraBtn({ label, onClick, color }: { label: string; onClick: () => void; color: 'orange' | 'muted' }) {
  const s: React.CSSProperties = color === 'orange'
    ? { background: 'var(--orange-2)', border: '1px solid rgba(249,115,22,0.25)', color: '#fdba74' }
    : { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)' };
  return (
    <button onClick={onClick} className="tap" style={{
      padding: '13px 6px', borderRadius: 10,
      fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
      ...s,
    }}>
      {label}
    </button>
  );
}

// ─── Modals ──────────────────────────────────────────────────────────────────

function Sheet({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-end', zIndex: 50 }}>
      <div style={{ width: '100%', background: 'var(--surface)', borderRadius: '20px 20px 0 0', border: '1px solid var(--border)', padding: 20 }}>
        {children}
      </div>
    </div>
  );
}

function WicketModal({ bowlingTeamId, onConfirm, onCancel }: {
  bowlingTeamId: string;
  onConfirm: (wt: WicketType | undefined, fielderId?: string) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<'type' | 'fielder'>('type');
  const [pendingType, setPendingType] = useState<WicketType | undefined>();

  const needsFielder = (wt: WicketType) => wt === 'caught' || wt === 'run_out' || wt === 'stumped';
  const bowlingPlayers = anyPlayersOfTeam(bowlingTeamId);

  function handleTypeSelect(wt: WicketType) {
    if (needsFielder(wt)) { setPendingType(wt); setStep('fielder'); }
    else onConfirm(wt);
  }

  if (step === 'fielder') {
    const label = pendingType === 'caught' ? 'Caught by' : pendingType === 'stumped' ? 'Stumped by' : 'Run out by';
    return (
      <Sheet>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <button onClick={() => setStep('type')} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 20, padding: '0 4px', lineHeight: 1 }}>←</button>
          <p style={{ color: 'var(--text)', fontWeight: 700, fontSize: 16, margin: 0 }}>{label}</p>
        </div>
        <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {bowlingPlayers.map(p => (
            <button key={p.id} onClick={() => onConfirm(pendingType, p.id)} className="tap" style={{
              padding: '13px 14px', borderRadius: 10, textAlign: 'left',
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              color: 'var(--text)', fontWeight: 500, fontSize: 14,
              cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span>{p.name}</span>
              {p.role === 'wicketkeeper' && <span style={{ color: 'var(--text-3)', fontSize: 10, fontWeight: 600 }}>WK</span>}
            </button>
          ))}
        </div>
        <button onClick={() => onConfirm(pendingType, undefined)} style={{
          width: '100%', padding: '11px', borderRadius: 10, marginBottom: 8,
          background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-3)',
          fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
        }}>Skip — fielder unknown</button>
        <button onClick={onCancel} style={{
          width: '100%', padding: '11px', borderRadius: 10,
          background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-3)',
          fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
        }}>Cancel</button>
      </Sheet>
    );
  }

  const types: WicketType[] = ['bowled', 'caught', 'run_out', 'stumped', 'hit_wicket', 'lbw'];
  return (
    <Sheet>
      <p style={{ color: 'var(--text)', fontWeight: 700, fontSize: 17, margin: '0 0 16px' }}>Wicket type</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        {types.map(wt => (
          <button key={wt} onClick={() => handleTypeSelect(wt)} className="tap" style={{
            padding: '13px 8px', borderRadius: 10,
            background: 'var(--red-2)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5',
            fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          }}>
            <span style={{ textTransform: 'capitalize' }}>{wt.split('_').join(' ')}</span>
            {needsFielder(wt) && <span style={{ fontSize: 9, opacity: 0.55, fontWeight: 400 }}>+ select fielder</span>}
          </button>
        ))}
      </div>
      <button onClick={() => onConfirm(undefined)} className="tap w-full" style={{
        padding: '14px', borderRadius: 10, marginBottom: 8,
        background: 'var(--red-2)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5',
        fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
      }}>Wicket (skip type)</button>
      <button onClick={onCancel} style={{
        width: '100%', padding: '12px', borderRadius: 10,
        background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-3)',
        fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
      }}>Cancel</button>
    </Sheet>
  );
}

function RunsModal({ label, onConfirm, onCancel }: { label: string; onConfirm: (n: number) => void; onCancel: () => void }) {
  return (
    <Sheet>
      <p style={{ color: 'var(--text)', fontWeight: 700, fontSize: 17, margin: '0 0 16px' }}>{label} — runs</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 10 }}>
        {[1, 2, 3, 4].map(n => (
          <button key={n} onClick={() => onConfirm(n)} className="tap" style={{
            aspectRatio: '1', borderRadius: '50%',
            background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)',
            fontWeight: 800, fontSize: 26, cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{n}</button>
        ))}
      </div>
      <button onClick={onCancel} style={{
        width: '100%', padding: '12px', borderRadius: 10,
        background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-3)',
        fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
      }}>Cancel</button>
    </Sheet>
  );
}

// ─── Inline scorecard ────────────────────────────────────────────────────────

function InlineScorecard() {
  const { state, derived, getPlayer } = useGame();
  const slot = state.activeInnings === 1 ? state.inn1 : state.inn2;

  return (
    <div style={{ padding: '0 16px 24px', borderTop: '1px solid var(--border)' }}>
      <div style={{ paddingTop: 20 }}>
        {/* Batting */}
        <SectionHead>Batting</SectionHead>
        {[...slot.pairs].sort((a, b) => a.pair_number - b.pair_number).map(pair => {
          const p1 = getPlayer(pair.player1_id), p2 = getPlayer(pair.player2_id);
          const pairTotal = derived.pair_totals[pair.id] ?? 0;
          const isCurrent = pair.id === derived.current_pair?.id;
          return (
            <div key={pair.id} style={{
              borderRadius: 10, padding: '10px 12px', marginBottom: 6,
              background: isCurrent ? 'rgba(34,197,94,0.06)' : 'var(--surface)',
              border: `1px solid ${isCurrent ? 'rgba(34,197,94,0.2)' : 'var(--border)'}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Pair {pair.pair_number}</span>
                <span style={{ color: pairTotal < 0 ? '#f87171' : 'var(--green)', fontSize: 12, fontWeight: 700, fontFamily: 'monospace' }}>
                  {pairTotal >= 0 ? '+' : ''}{pairTotal}
                </span>
              </div>
              {[p1, p2].filter(Boolean).map(p => p && (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                  <span style={{ fontSize: 12, color: derived.striker_id === p.id ? 'var(--green)' : 'var(--text-2)', fontWeight: derived.striker_id === p.id ? 600 : 400 }}>
                    {p.name}{derived.striker_id === p.id && ' ★'}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'monospace' }}>
                    {derived.batter_runs[p.id] ?? 0} ({derived.batter_balls[p.id] ?? 0})
                    {(derived.batter_dismissals[p.id] ?? 0) > 0 && <span style={{ color: '#f87171' }}> ×{derived.batter_dismissals[p.id]}</span>}
                  </span>
                </div>
              ))}
            </div>
          );
        })}

        {/* Bowling */}
        {Object.keys(derived.bowler_overs).length > 0 && <>
          <SectionHead>Bowling</SectionHead>
          {Object.keys(derived.bowler_overs).map(id => {
            const p = getPlayer(id); if (!p) return null;
            const o = derived.bowler_overs[id] ?? 0, eb = derived.bowler_extra_balls[id] ?? 0;
            const r = derived.bowler_runs[id] ?? 0, w = derived.bowler_wickets[id] ?? 0;
            const atLimit = o >= state.match.settings.max_overs_per_bowler;
            return (
              <div key={id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: atLimit ? '#f87171' : 'var(--text-2)' }}>
                  {p.name}{id === state.current_bowler_id && <span style={{ color: 'var(--green)', marginLeft: 4 }}>●</span>}
                </span>
                <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-3)' }}>{bowlerFigures(o, eb, r, w)}</span>
              </div>
            );
          })}
        </>}

        {derived.fall_of_wickets.length > 0 && <>
          <SectionHead>Fall of Wickets</SectionHead>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {derived.fall_of_wickets.map((fow, i) => (
              <span key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 8px', fontSize: 11, color: 'var(--text-2)' }}>
                {fow.total}-{fow.wicket_num} ({getPlayer(fow.player_id)?.name}, {fow.over_display})
              </span>
            ))}
          </div>
        </>}
      </div>
    </div>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return <p style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '16px 0 8px' }}>{children}</p>;
}

// ─── End-of-match full scorecard ─────────────────────────────────────────────

function ScorecardView() {
  const { state, derived: inn2Derived, getPlayer, getTeam, dispatch } = useGame();
  const navigate = useNavigate();
  const [recorded, setRecorded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const settings = state.match.settings;

  const inn1Derived = deriveMatchState(state.inn1.deliveries, state.inn1.pairs, settings);
  const inn1Score = inn1Derived.total;
  const inn2Score = inn2Derived.total;

  const winnerTeamId = inn2Score > inn1Score
    ? state.inn2.innings.batting_team_id
    : inn1Score > inn2Score
      ? state.inn1.innings.batting_team_id
      : null;
  const winnerTeam = winnerTeamId ? getTeam(winnerTeamId) : null;
  const margin = Math.abs(inn2Score - inn1Score);

  // Find next unplayed match
  const schedule = anySchedule(state.matchId);
  const currentIdx = schedule.findIndex(r => r.match.id === state.matchId);
  const completedIds = getCompletedMatchIds();
  const nextMatch = currentIdx >= 0
    ? schedule.slice(currentIdx + 1).find(r => {
        const eff = getEffectiveStatus(r.match.id, r.match.status as 'scheduled' | 'live' | 'complete');
        return eff !== 'complete' && !completedIds.has(r.match.id);
      }) ?? null
    : null;
  const nextMatchName = nextMatch ? (anyMatchRecord(nextMatch.match.id)?.match.name ?? '') : '';

  function handleRecord() {
    recordMatchComplete(state.matchId);
    if (nextMatch) setLiveMatchId(nextMatch.match.id);
    setRecorded(true);
  }

  return (
    <div className="min-h-dvh" style={{ background: S.bg }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px 48px' }}>

        {/* ── Match result banner ── */}
        <div style={{
          background: winnerTeam
            ? 'linear-gradient(135deg, rgba(255,153,51,0.15) 0%, rgba(255,153,51,0.06) 100%)'
            : 'rgba(255,255,255,0.04)',
          border: `1px solid ${winnerTeam ? 'rgba(255,153,51,0.30)' : 'var(--border)'}`,
          borderRadius: 16, padding: '20px', margin: '20px 0 16px', textAlign: 'center',
        }}>
          <p style={{ color: S.text3, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', margin: '0 0 8px' }}>Match Result</p>
          {winnerTeam ? (
            <>
              <p style={{ color: S.amber, fontSize: 26, fontWeight: 900, margin: '0 0 4px', letterSpacing: '-0.5px' }}>{winnerTeam.name} win!</p>
              <p style={{ color: S.text2, fontSize: 14, margin: 0 }}>by <span style={{ color: S.text, fontWeight: 700 }}>{margin} run{margin !== 1 ? 's' : ''}</span></p>
            </>
          ) : (
            <p style={{ color: S.text2, fontSize: 22, fontWeight: 800, margin: 0 }}>Match Tied</p>
          )}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            {[
              { teamId: state.inn1.innings.batting_team_id, score: inn1Score, label: 'Innings 1' },
              { teamId: state.inn2.innings.batting_team_id, score: inn2Score, label: 'Innings 2' },
            ].map(({ teamId, score, label }, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <p style={{ color: S.text3, fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 2px' }}>{label}</p>
                <p style={{ color: S.text3, fontSize: 10, margin: '0 0 4px' }}>{getTeam(teamId)?.short_name}</p>
                <p style={{ color: score === Math.max(inn1Score, inn2Score) && inn1Score !== inn2Score ? S.amber : S.text2, fontSize: 26, fontWeight: 900, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{score}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Record + Next buttons ── */}
        {!recorded ? (
          <button onClick={handleRecord} className="tap w-full" style={{
            padding: '16px', borderRadius: 14, marginBottom: 8,
            background: 'var(--green)', color: '#1a0800',
            fontWeight: 700, fontSize: 16, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          }}>
            Record Result &amp; Save Match
          </button>
        ) : (
          <div style={{ marginBottom: 8 }}>
            <div style={{
              background: 'rgba(29,184,92,0.10)', border: '1px solid rgba(29,184,92,0.25)',
              borderRadius: 12, padding: '12px 16px', textAlign: 'center', marginBottom: 10,
            }}>
              <p style={{ color: 'var(--blue)', fontSize: 14, fontWeight: 700, margin: 0 }}>✓ Match result saved</p>
            </div>
            {nextMatch ? (
              <button
                onClick={() => navigate(`/match/${nextMatch.match.id}/score`)}
                className="tap w-full"
                style={{
                  padding: '16px', borderRadius: 14,
                  background: 'var(--green)', color: '#1a0800',
                  fontWeight: 700, fontSize: 16, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                Start Next Match →
                <span style={{ fontSize: 12, fontWeight: 500, opacity: 0.75 }}>{nextMatchName}</span>
              </button>
            ) : (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px', textAlign: 'center' }}>
                <p style={{ color: S.amber, fontSize: 16, fontWeight: 800, margin: '0 0 4px' }}>Tournament Complete!</p>
                <p style={{ color: S.text3, fontSize: 13, margin: 0 }}>All matches have been played.</p>
              </div>
            )}
            {/* Back to the scorer dashboard (match list, upcoming games, etc.) */}
            <button
              onClick={() => navigate(isMensId(state.matchId) ? '/mens/score' : '/score')}
              className="tap w-full"
              style={{
                marginTop: 10, padding: '14px', borderRadius: 14,
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                color: S.text, fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              ← Back to Match List
            </button>
          </div>
        )}

        {/* ── Innings 1 scorecard ── */}
        <InnCard
          label={`Innings 1 · ${getTeam(state.inn1.innings.batting_team_id)?.name ?? ''}`}
          score={inn1Score} wickets={inn1Derived.wickets}
          pairs={state.inn1.pairs} der={inn1Derived}
          settings={settings} getPlayer={getPlayer}
        />

        {/* ── Innings 2 scorecard ── */}
        <InnCard
          label={`Innings 2 · ${getTeam(state.inn2.innings.batting_team_id)?.name ?? ''}`}
          score={inn2Score} wickets={inn2Derived.wickets}
          pairs={state.inn2.pairs} der={inn2Derived}
          settings={settings} getPlayer={getPlayer}
        />

        {/* ── Edit deliveries ── */}
        <button
          onClick={() => setEditOpen(o => !o)}
          style={{ width: '100%', padding: '13px', borderRadius: 12, marginTop: 8, background: 'transparent', border: '1px solid var(--border)', color: S.text3, fontWeight: 500, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {editOpen ? 'Hide Delivery Editor' : 'Edit Deliveries (Fix Mistakes)'}
        </button>

        {editOpen && (
          <div style={{ marginTop: 8 }}>
            {[
              { label: `Innings 1 · ${getTeam(state.inn1.innings.batting_team_id)?.name ?? ''}`, deliveries: state.inn1.deliveries },
              { label: `Innings 2 · ${getTeam(state.inn2.innings.batting_team_id)?.name ?? ''}`, deliveries: state.inn2.deliveries },
            ].map(({ label, deliveries }) => {
              const active = deliveries.filter(d => !d.is_deleted && d.extra_type !== 'strike_override');
              if (active.length === 0) return null;
              return (
                <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 14px', marginBottom: 10 }}>
                  <p style={{ color: S.text3, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 10px' }}>{label}</p>
                  {active.map((d, i) => {
                    const desc = d.is_wicket
                      ? `${d.runs_off_bat}W`
                      : d.extra_type === 'wide' ? `Wide +${d.extra_value}`
                      : d.extra_type === 'no_ball' ? `No Ball +${d.extra_value}`
                      : d.extra_type === 'bye' ? `Bye ${d.extra_value}`
                      : d.extra_type === 'leg_bye' ? `Leg Bye ${d.extra_value}`
                      : `${d.runs_off_bat}`;
                    const striker = getPlayer(d.striker_id)?.name ?? '?';
                    return (
                      <div key={d.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '8px 0', borderBottom: i < active.length - 1 ? '1px solid var(--border-2)' : 'none',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ color: S.text3, fontSize: 11, fontVariantNumeric: 'tabular-nums', minWidth: 36 }}>
                            Ov {d.over_number + 1}.{d.ball_in_over + 1}
                          </span>
                          <span style={{
                            fontSize: 13, fontWeight: d.is_wicket ? 700 : 400,
                            color: d.is_wicket ? S.red : d.extra_type !== 'none' ? S.amber : S.text2,
                          }}>
                            {desc}
                          </span>
                          <span style={{ color: S.text3, fontSize: 11 }}>{striker}</span>
                        </div>
                        <button
                          onClick={() => {
                            if (confirm(`Delete: Over ${d.over_number + 1}.${d.ball_in_over + 1} — ${desc} (${striker})?`)) {
                              dispatch({ type: 'DELETE_DELIVERY', delivery_id: d.id });
                            }
                          }}
                          style={{
                            background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)',
                            color: S.red, borderRadius: 8, padding: '4px 10px', fontSize: 12,
                            fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            <p style={{ color: S.text3, fontSize: 11, textAlign: 'center', margin: '4px 0 8px' }}>
              Deleting a ball re-derives the entire match from remaining deliveries.
            </p>
          </div>
        )}

        {/* Reset (secondary) — asks for confirmation first */}
        <button
          onClick={() => {
            if (window.confirm('Reset this match? This permanently clears all scored data for this game and cannot be undone.')) {
              dispatch({ type: 'RESET' });
            }
          }}
          style={{ width: '100%', padding: '13px', borderRadius: 12, marginTop: 8, background: 'transparent', border: '1px solid var(--border)', color: S.text3, fontWeight: 500, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Reset Match Data
        </button>
      </div>
    </div>
  );
}

// ─── Innings scorecard card ───────────────────────────────────────────────────

function InnCard({
  label, score, wickets, pairs, der, settings, getPlayer,
}: {
  label: string; score: number; wickets: number;
  pairs: { id: string; pair_number: number; player1_id: string; player2_id: string }[];
  der: import('../lib/types').DerivedMatchState;
  settings: import('../lib/types').MatchSettings;
  getPlayer: (id: string) => { id: string; name: string } | undefined;
}) {
  const totalBalls = Object.values(der.pair_balls).reduce((a, b) => a + b, 0);
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px', marginBottom: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
        <p style={{ color: S.text3, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>{label}</p>
        <div style={{ textAlign: 'right' }}>
          <span style={{ color: S.text, fontSize: 20, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{score}</span>
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14 }}> / {wickets}</span>
          <p style={{ color: S.text3, fontSize: 10, margin: '1px 0 0' }}>
            {formatOvers(totalBalls, settings.balls_per_over)} ov · RR {runRate(score, totalBalls, settings.balls_per_over)}
          </p>
        </div>
      </div>

      {/* Batting */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '2px 10px', fontSize: 10, color: S.text3, paddingBottom: 5, marginBottom: 4, borderBottom: '1px solid var(--border-2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        <span>Batter</span><span style={{ textAlign: 'right' }}>R (B)</span><span style={{ textAlign: 'right' }}>SR</span><span style={{ textAlign: 'right' }}>Out</span>
      </div>
      {[...pairs].sort((a, b) => a.pair_number - b.pair_number).map(pair => {
        const p1 = getPlayer(pair.player1_id), p2 = getPlayer(pair.player2_id);
        const pairTotal = der.pair_totals[pair.id] ?? 0;
        return (
          <div key={pair.id} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ color: S.text3, fontSize: 10 }}>Pair {pair.pair_number}</span>
              <span style={{ color: pairTotal < 0 ? 'var(--red)' : S.green, fontSize: 10, fontFamily: 'monospace', fontWeight: 700 }}>{pairTotal >= 0 ? '+' : ''}{pairTotal}</span>
            </div>
            {[p1, p2].filter(Boolean).map(p => p && (
              <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '2px 10px', padding: '3px 0', borderBottom: '1px solid var(--border-2)' }}>
                <span style={{ fontSize: 12, color: S.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                <span style={{ fontSize: 11, fontFamily: 'monospace', color: S.text2, textAlign: 'right' }}>{der.batter_runs[p.id] ?? 0} ({der.batter_balls[p.id] ?? 0})</span>
                <span style={{ fontSize: 11, fontFamily: 'monospace', color: S.text3, textAlign: 'right' }}>
                  {(der.batter_balls[p.id] ?? 0) > 0 ? (((der.batter_runs[p.id] ?? 0) / (der.batter_balls[p.id] ?? 1)) * 100).toFixed(0) : '—'}
                </span>
                <span style={{ fontSize: 11, color: (der.batter_dismissals[p.id] ?? 0) > 0 ? 'var(--red)' : S.text3, textAlign: 'right' }}>
                  {(der.batter_dismissals[p.id] ?? 0) > 0 ? `×${der.batter_dismissals[p.id]}` : '—'}
                </span>
              </div>
            ))}
          </div>
        );
      })}

      {/* Bowling */}
      {Object.keys(der.bowler_overs).length > 0 && (
        <>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 6 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '2px 10px', fontSize: 10, color: S.text3, paddingBottom: 5, marginBottom: 4, borderBottom: '1px solid var(--border-2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              <span>Bowler</span><span style={{ textAlign: 'right' }}>O-R-W</span><span style={{ textAlign: 'right' }}>Econ</span>
            </div>
            {Object.keys(der.bowler_overs).map(id => {
              const p = getPlayer(id); if (!p) return null;
              const o = der.bowler_overs[id] ?? 0, eb = der.bowler_extra_balls[id] ?? 0;
              const r = der.bowler_runs[id] ?? 0, w = der.bowler_wickets[id] ?? 0;
              const tb = o * settings.balls_per_over + eb;
              const econ = tb > 0 ? ((r / tb) * settings.balls_per_over).toFixed(1) : '—';
              return (
                <div key={id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '2px 10px', padding: '4px 0', borderBottom: '1px solid var(--border-2)' }}>
                  <span style={{ fontSize: 12, color: S.text2 }}>{p.name}</span>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: S.text2, textAlign: 'right' }}>{bowlerFigures(o, eb, r, w)}</span>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: S.text3, textAlign: 'right' }}>{econ}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Fall of wickets */}
      {der.fall_of_wickets.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 6 }}>
          <p style={{ color: S.text3, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 5px' }}>Fall of Wickets</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {der.fall_of_wickets.map((fow, i) => (
              <span key={i} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 7px', fontSize: 10, color: S.text2 }}>
                {fow.total}-{fow.wicket_num} ({getPlayer(fow.player_id)?.name}, {fow.over_display})
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Toss screen ─────────────────────────────────────────────────────────────

function TossScreen() {
  const { state, dispatch, getTeam } = useGame();
  const [winner, setWinner] = useState<string | null>(null);
  const home = getTeam(state.match.home_team_id);
  const away = getTeam(state.match.away_team_id);

  return (
    <div style={{ minHeight: '100dvh', background: S.bg, maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px' }}>

      {/* Match name */}
      <p style={{ color: S.text3, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6, textAlign: 'center' }}>
        {state.match.name}
      </p>

      {!winner ? (
        <>
          <h1 style={{ color: S.text, fontSize: 26, fontWeight: 900, margin: '0 0 6px', textAlign: 'center', letterSpacing: '-0.4px' }}>
            Toss
          </h1>
          <p style={{ color: S.text3, fontSize: 14, margin: '0 0 32px', textAlign: 'center' }}>
            Who won the toss?
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 340 }}>
            {[home, away].map(team => team && (
              <button
                key={team.id}
                onClick={() => setWinner(team.id)}
                className="tap"
                style={{
                  width: '100%', padding: '18px 20px', borderRadius: 14,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  color: S.text, fontWeight: 700, fontSize: 17,
                  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
                }}
              >
                {team.name}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'var(--green-2)', border: '1px solid rgba(255,153,51,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, marginBottom: 16,
          }}>🏏</div>
          <h1 style={{ color: S.amber, fontSize: 22, fontWeight: 900, margin: '0 0 4px', textAlign: 'center', letterSpacing: '-0.3px' }}>
            {getTeam(winner)?.name} won the toss
          </h1>
          <p style={{ color: S.text3, fontSize: 14, margin: '0 0 32px', textAlign: 'center' }}>
            What did they elect to do?
          </p>
          <div style={{ display: 'flex', gap: 12, width: '100%', maxWidth: 340 }}>
            {(['bat', 'bowl'] as const).map(choice => (
              <button
                key={choice}
                onClick={() => dispatch({ type: 'RECORD_TOSS', winner_team_id: winner, elected: choice })}
                className="tap"
                style={{
                  flex: 1, padding: '18px 12px', borderRadius: 14,
                  background: choice === 'bat' ? 'var(--green-2)' : 'var(--surface)',
                  border: `1px solid ${choice === 'bat' ? 'rgba(255,153,51,0.3)' : 'var(--border)'}`,
                  color: choice === 'bat' ? S.green : S.text2,
                  fontWeight: 700, fontSize: 18,
                  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
                }}
              >
                {choice === 'bat' ? '🏏 Bat' : '⚾ Bowl'}
              </button>
            ))}
          </div>
          <button
            onClick={() => setWinner(null)}
            style={{ marginTop: 20, background: 'none', border: 'none', color: S.text3, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            ← Change toss winner
          </button>
        </>
      )}
    </div>
  );
}

// ─── Pair selection screen ───────────────────────────────────────────────────

function PairSelectScreen() {
  const { state, derived, dispatch, getTeam, getPlayer } = useGame();
  const slot = state.activeInnings === 1 ? state.inn1 : state.inn2;
  const innings = slot.innings;
  const battingTeam = getTeam(innings.batting_team_id);
  const pairNum = derived.pair_index + 1;
  const settings = state.match.settings;

  const [selected, setSelected] = useState<string[]>([]);

  // All players on the batting team
  const battingPlayers = anyPlayersOfTeam(innings.batting_team_id);

  // Players already used in earlier pairs
  const usedIds = new Set(
    slot.pairs
      .slice(0, derived.pair_index)
      .flatMap(p => [p.player1_id, p.player2_id])
      .filter(Boolean)
  );

  function toggle(id: string) {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length < 2) return [...prev, id];
      return prev;
    });
  }

  function confirm() {
    if (selected.length !== 2) return;
    dispatch({ type: 'SELECT_PAIR', player1_id: selected[0], player2_id: selected[1] });
    setSelected([]);
  }

  return (
    <div style={{ minHeight: '100dvh', background: S.bg, maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(175deg, #201305 0%, #160e05 55%, var(--bg) 100%)',
        padding: '20px 18px 18px',
        borderBottom: '1px solid rgba(255,153,51,0.10)',
        flexShrink: 0,
      }}>
        <p style={{ color: 'rgba(255,153,51,0.6)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 4px' }}>
          Innings {state.activeInnings} · {battingTeam?.name}
        </p>
        <h1 style={{ color: S.text, fontSize: 22, fontWeight: 800, margin: '0 0 2px', letterSpacing: '-0.4px' }}>
          Pair {pairNum} of {settings.num_pairs}
        </h1>
        <p style={{ color: S.text3, fontSize: 13, margin: 0 }}>
          Select 2 players to bat together
        </p>
      </div>

      {/* Selected summary bar */}
      <div style={{
        padding: '12px 16px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', gap: 8, flexShrink: 0,
      }}>
        {[0, 1].map(i => (
          <div key={i} style={{
            flex: 1, padding: '10px 12px', borderRadius: 10,
            background: selected[i] ? 'var(--green-2)' : 'var(--surface-2)',
            border: `1px solid ${selected[i] ? 'rgba(255,153,51,0.3)' : 'var(--border)'}`,
          }}>
            {selected[i] ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: S.green, fontSize: 13, fontWeight: 600 }}>
                  {getPlayer(selected[i])?.name}
                </span>
                <button
                  onClick={() => setSelected(prev => prev.filter(x => x !== selected[i]))}
                  style={{ background: 'none', border: 'none', color: S.text3, cursor: 'pointer', fontSize: 14, padding: '0 0 0 4px', fontFamily: 'inherit' }}
                >
                  ×
                </button>
              </div>
            ) : (
              <span style={{ color: S.text3, fontSize: 12 }}>
                {i === 0 ? 'Select batter 1' : 'Select batter 2'}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Player list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {battingPlayers.map(p => {
            const isSelected = selected.includes(p.id);
            const isUsed = usedIds.has(p.id);
            const isDisabled = !isSelected && selected.length === 2;
            return (
              <button
                key={p.id}
                onClick={() => !isUsed && toggle(p.id)}
                disabled={isUsed || isDisabled}
                className={isUsed || isDisabled ? '' : 'tap'}
                style={{
                  width: '100%', padding: '13px 16px', borderRadius: 12,
                  background: isSelected ? 'var(--green-2)' : 'var(--surface)',
                  border: `1px solid ${isSelected ? 'rgba(255,153,51,0.3)' : 'var(--border)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  cursor: isUsed || isDisabled ? 'not-allowed' : 'pointer',
                  opacity: isUsed || isDisabled ? 0.35 : 1,
                  fontFamily: 'inherit',
                  textAlign: 'left',
                }}
              >
                <div>
                  <span style={{ color: isSelected ? S.green : S.text, fontSize: 14, fontWeight: isSelected ? 600 : 400 }}>
                    {p.name}
                  </span>
                  {p.is_captain && <span style={{ color: S.amber, fontSize: 11, marginLeft: 6 }}>(C)</span>}
                  {p.role === 'wicketkeeper' && <span style={{ color: S.text3, fontSize: 11, marginLeft: 6 }}>†</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isUsed && <span style={{ color: S.text3, fontSize: 11 }}>Already batted</span>}
                  {isSelected && (
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, color: '#1a0800', fontWeight: 700,
                    }}>
                      {selected.indexOf(p.id) + 1}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Confirm button */}
      <div style={{ padding: '12px 16px 24px', flexShrink: 0, background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
        <button
          onClick={confirm}
          disabled={selected.length !== 2}
          className="tap"
          style={{
            width: '100%', padding: '16px', borderRadius: 14,
            background: selected.length === 2 ? 'var(--green)' : 'var(--surface-2)',
            color: selected.length === 2 ? '#1a0800' : S.text3,
            fontWeight: 700, fontSize: 16, border: 'none',
            cursor: selected.length === 2 ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
          }}
        >
          {selected.length === 2 ? `Confirm Pair ${pairNum} — ${getPlayer(selected[0])?.name?.split(' ')[0]} & ${getPlayer(selected[1])?.name?.split(' ')[0]}` : `Select ${2 - selected.length} more player${selected.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
}
