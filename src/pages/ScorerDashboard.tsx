import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Login, checkLocalAuth } from './Login';
import { supabase, supabaseEnabled, softDeleteInnings, clearMatchToss } from '../lib/supabase';
import { ALL_MATCHES, getMatchRecord, refreshBracketLocal, computeMatchOverviews, resolveSlot, slotLabel, getBracket, getOverride, saveOverride, GROUP_A, GROUP_B } from '../lib/matchData';
import type { Bracket, MatchOverview } from '../lib/matchData';
import { getEffectiveStatus, getCompletedMatchIds } from '../lib/matchState';
import { TEAMS } from '../lib/seedData';

function resetMatch(matchId: string) {
  localStorage.removeItem(`cricket_match_${matchId}_v2`);
  localStorage.removeItem(`cricket_offline_queue_${matchId}`);
  // Remove from completed set
  const done = getCompletedMatchIds();
  done.delete(matchId);
  localStorage.setItem('cricket_completed_matches', JSON.stringify([...done]));
  if (localStorage.getItem('cricket_live_match') === matchId) {
    localStorage.removeItem('cricket_live_match');
  }
  // ── Clear the CLOUD too, so every viewer's scores/table/stats reset as well ──
  if (supabaseEnabled) {
    const rec = getMatchRecord(matchId);
    if (rec) {
      softDeleteInnings([rec.innings1_id, rec.innings2_id]);
      clearMatchToss(matchId);
    }
  } else {
    // Local mode: clear the relay so other same-WiFi viewers see a fresh match
    fetch(`http://${window.location.hostname}:5180/state/${matchId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'null',
    }).catch(() => {});
  }
}

function teamName(id: string) { return TEAMS.find(t => t.id === id)?.name ?? id; }

function readScores(matchId: string): { s1: number | null; s2: number | null } {
  try {
    const raw = localStorage.getItem(`cricket_match_${matchId}_v2`);
    if (!raw) return { s1: null, s2: null };
    const st = JSON.parse(raw) as { inn1?: { final_score?: number | null }; inn2?: { final_score?: number | null } };
    return { s1: st.inn1?.final_score ?? null, s2: st.inn2?.final_score ?? null };
  } catch { return { s1: null, s2: null }; }
}

// ── Auth wrapper ──────────────────────────────────────────────────────────────

export function ScorerDashboard() {
  const [auth, setAuth] = useState<'loading' | 'yes' | 'no'>('loading');

  useEffect(() => {
    if (checkLocalAuth()) { setAuth('yes'); return; }
    if (supabaseEnabled && supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        setAuth(checkLocalAuth() || session ? 'yes' : 'no');
      });
    } else {
      setAuth('no');
    }
  }, []);

  if (auth === 'loading') {
    return (
      <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text-3)', fontSize: 14 }}>Loading…</span>
      </div>
    );
  }

  if (auth === 'no') return <Login onLogin={() => setAuth('yes')} />;
  return <Dashboard />;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function Dashboard() {
  const navigate = useNavigate();
  const [, setTick] = useState(0);
  const [overviews, setOverviews] = useState<Record<string, MatchOverview>>({});

  useEffect(() => {
    // Cloud is the source of truth → statuses, scores, and the bracket all reflect
    // matches scored on ANY device. Fall back to local for instant paint / offline.
    refreshBracketLocal();
    const tick = () => {
      computeMatchOverviews()   // also refreshes the bracket internally
        .then(ov => setOverviews(ov))
        .catch(() => refreshBracketLocal())
        .finally(() => setTick(t => t + 1));
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => clearInterval(id);
  }, []);

  function handleReset(matchId: string) {
    if (!confirm('Reset this match? All scored data will be cleared.')) return;
    resetMatch(matchId);
    setTick(t => t + 1);
  }

  const bracket = getBracket();
  const allMatches = ALL_MATCHES.map(base => {
    const rec = getMatchRecord(base.match.id) ?? base;
    // A round-2/final match is "ready" to score once its teams are resolved.
    const ready = base.round === 1 || (!!resolveSlot(base.homeSlot, bracket) && !!resolveSlot(base.awaySlot, bracket));
    const ov = overviews[base.match.id];
    // Prefer cloud status/scores; fall back to this device's local state (offline / not yet synced).
    const status = (ov?.status ?? getEffectiveStatus(rec.match.id, 'scheduled')) as 'live' | 'scheduled' | 'complete';
    const scores = ov && ov.status !== 'scheduled' ? { s1: ov.s1, s2: ov.s2 } : readScores(rec.match.id);
    return { rec, ready, status, scores };
  });

  // The next match to score: first non-complete match whose teams are known.
  const nextId = allMatches.find(m => m.status !== 'complete' && m.ready)?.rec.match.id;

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', maxWidth: 480, margin: '0 auto', paddingBottom: 48 }}>

      {/* Header */}
      <div style={{
        background: 'linear-gradient(160deg, #251508 0%, #1a0f06 52%, var(--bg) 100%)',
        borderBottom: '1px solid rgba(255,153,51,0.18)', padding: '28px 18px 22px',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -60, left: '50%', transform: 'translateX(-50%)', width: 340, height: 240, background: 'radial-gradient(ellipse, rgba(255,153,51,0.12) 0%, transparent 62%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            <Link to="/mens/score" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(56,132,255,0.14)', border: '1px solid rgba(56,132,255,0.35)', borderRadius: 20, padding: '6px 13px', color: 'var(--blue)', fontSize: 11, fontWeight: 700, textDecoration: 'none' }}>
              ⇄ Score Men's +50
            </Link>
          </div>
          <p style={{ color: 'rgba(255,153,51,0.65)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', margin: '0 0 6px' }}>
            Scorer Panel
          </p>
          <h1 style={{ color: 'var(--text)', fontSize: 26, fontWeight: 900, margin: 0, letterSpacing: '-0.4px' }}>
            Select a Match
          </h1>
          <p style={{ color: 'var(--text-3)', fontSize: 13, margin: '4px 0 0' }}>
            Woman Cricket Tournament · Antwerp 2026
          </p>
        </div>
      </div>

      <div style={{ padding: '20px 14px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <OverrideEditor onChange={() => setTick(t => t + 1)} />
        <SectionLabel>Match Schedule · in order</SectionLabel>

        {/* Every match in exact play order — scorer works straight down the list */}
        {allMatches.map(({ rec, ready, status, scores }, i) => (
          <MatchCard
            key={rec.match.id}
            rec={rec}
            bracket={bracket}
            matchNum={i + 1}
            status={status}
            scores={status === 'complete' ? scores : undefined}
            isNext={rec.match.id === nextId}
            actionLabel={status === 'live' ? 'Continue Scoring →' : (status === 'scheduled' && ready ? 'Start Scoring →' : undefined)}
            actionColor="var(--green)"
            notReadyNote={status === 'scheduled' && !ready ? 'Teams set once the previous round finishes' : undefined}
            onAction={status !== 'complete' && ready ? () => navigate(`/match/${rec.match.id}/score`) : undefined}
            onReset={() => handleReset(rec.match.id)}
          />
        ))}

        {allMatches.every(m => m.status === 'complete') && (
          <div style={{ textAlign: 'center', padding: '24px 0 8px' }}>
            <p style={{ color: 'var(--text)', fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>All matches complete! 🏆</p>
            <p style={{ color: 'var(--text-3)', fontSize: 13 }}>Tournament is finished.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Manual Round-2 group override (admin fallback) ─────────────────────────────

function OverrideEditor({ onChange }: { onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const existing = getOverride();
  const b = getBracket();
  const [aOrder, setAOrder] = useState<string[]>(existing?.aRank?.length === 3 ? existing.aRank : (b.aRank.length === 3 ? b.aRank : GROUP_A));
  const [bOrder, setBOrder] = useState<string[]>(existing?.bRank?.length === 3 ? existing.bRank : (b.bRank.length === 3 ? b.bRank : GROUP_B));
  const [saving, setSaving] = useState(false);
  const active = !!getOverride();

  const swap = (order: string[], pos: number, teamId: string) => {
    const next = [...order];
    const from = next.indexOf(teamId);
    [next[pos], next[from]] = [next[from], next[pos]];
    return next;
  };
  const posLabel = ['1st', '2nd', '3rd'];

  async function apply() {
    setSaving(true);
    await saveOverride({ aRank: aOrder, bRank: bOrder });
    setSaving(false); onChange();
  }
  async function auto() {
    setSaving(true);
    await saveOverride(null);
    setSaving(false); onChange();
  }

  const groupC = [aOrder[0], aOrder[1], aOrder[2]]; // Round 2 keeps Group A as Group C
  const groupD = [bOrder[0], bOrder[1], bOrder[2]]; // Group B as Group D (crossover)

  const Selector = ({ order, teams, set }: { order: string[]; teams: string[]; set: (o: string[]) => void }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {[0, 1, 2].map(pos => (
        <div key={pos} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--text-3)', fontSize: 11, width: 26 }}>{posLabel[pos]}</span>
          <select value={order[pos]} onChange={e => set(swap(order, pos, e.target.value))}
            style={{ flex: 1, background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 8px', fontFamily: 'inherit', fontSize: 13 }}>
            {teams.map(t => <option key={t} value={t}>{teamName(t)}</option>)}
          </select>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ background: 'var(--surface)', border: `1px solid ${active ? 'rgba(245,197,58,0.35)' : 'var(--border)'}`, borderRadius: 14, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
        <span style={{ color: active ? 'var(--amber)' : 'var(--text-2)', fontSize: 13, fontWeight: 700 }}>
          ⚙ Manual Round 2 Groups {active && <span style={{ fontSize: 10, fontWeight: 600 }}>· ON</span>}
        </span>
        <span style={{ color: 'var(--text-3)', fontSize: 16 }}>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 16px 16px' }}>
          <p style={{ color: 'var(--text-3)', fontSize: 11, margin: '0 0 12px', lineHeight: 1.4 }}>
            Set each group's finishing order to fix the Round 2 groups by hand. This overrides the automatic calculation for everyone.
          </p>
          <div style={{ display: 'flex', gap: 14, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <p style={{ color: 'var(--green)', fontSize: 11, fontWeight: 700, margin: '0 0 6px' }}>Group A</p>
              <Selector order={aOrder} teams={GROUP_A} set={setAOrder} />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ color: 'var(--blue)', fontSize: 11, fontWeight: 700, margin: '0 0 6px' }}>Group B</p>
              <Selector order={bOrder} teams={GROUP_B} set={setBOrder} />
            </div>
          </div>
          <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
            <p style={{ color: 'var(--text-2)', fontSize: 11, margin: '0 0 3px' }}><b style={{ color: 'var(--green)' }}>Group C</b>: {groupC.map(teamName).join(', ')}</p>
            <p style={{ color: 'var(--text-2)', fontSize: 11, margin: 0 }}><b style={{ color: 'var(--blue)' }}>Group D</b>: {groupD.map(teamName).join(', ')}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={apply} disabled={saving} style={{ flex: 1, padding: '11px', borderRadius: 10, background: 'var(--amber)', color: '#1a0800', fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
              {saving ? 'Saving…' : 'Apply Manual Groups'}
            </button>
            <button onClick={auto} disabled={saving} style={{ flex: 1, padding: '11px', borderRadius: 10, background: 'transparent', color: 'var(--text-2)', fontWeight: 600, fontSize: 13, border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit' }}>
              Use Automatic
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Match card ────────────────────────────────────────────────────────────────

function MatchCard({ rec, bracket, matchNum, status, scores, isNext, actionLabel, actionColor, notReadyNote, onAction, onReset }: {
  rec: typeof ALL_MATCHES[0];
  bracket: Bracket;
  matchNum?: number;
  status: 'live' | 'scheduled' | 'complete';
  scores?: { s1: number | null; s2: number | null };
  isNext?: boolean;
  actionLabel?: string;
  actionColor?: string;
  notReadyNote?: string;
  onAction?: () => void;
  onReset?: () => void;
}) {
  const isLive = status === 'live';
  const isDone = status === 'complete';
  const home = rec.match.home_team_id;
  const away = rec.match.away_team_id;
  const homeName = home ? teamName(home) : slotLabel(rec.homeSlot);
  const awayName = away ? teamName(away) : slotLabel(rec.awaySlot);
  void bracket; void resolveSlot;

  const winner = isDone && scores?.s1 !== null && scores?.s2 !== null
    ? scores!.s1! > scores!.s2! ? home : scores!.s2! > scores!.s1! ? away : null
    : null;

  const highlight = isLive || isNext;
  return (
    <div style={{
      background: highlight ? 'linear-gradient(135deg, #251508 0%, #1a0f06 100%)' : 'var(--surface)',
      border: `1px solid ${highlight ? 'rgba(255,153,51,0.28)' : isDone ? 'var(--border-2)' : 'var(--border)'}`,
      borderRadius: 16, padding: '16px',
      boxShadow: highlight ? 'inset 3px 0 0 var(--green)' : 'none',
      opacity: isDone ? 0.82 : 1,
    }}>
      {isNext && !isLive && (
        <p style={{ color: 'var(--green)', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', margin: '0 0 8px' }}>▶ Up Next</p>
      )}
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isLive && <span className="live-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />}
          <span style={{
            background: isLive ? 'rgba(255,153,51,0.15)' : 'var(--surface-2)',
            border: `1px solid ${isLive ? 'rgba(255,153,51,0.25)' : 'var(--border-2)'}`,
            color: isLive ? 'var(--green)' : 'var(--text-2)',
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.1em',
            padding: '3px 10px', borderRadius: 20,
          }}>
            Match {matchNum}
          </span>
          <span style={{ color: 'var(--text-3)', fontSize: 10, fontWeight: 600 }}>{rec.roundLabel}</span>
          {isLive && <span style={{ color: 'var(--green)', fontSize: 10, fontWeight: 700 }}>· LIVE</span>}
          {isDone && <span style={{ color: 'var(--text-3)', fontSize: 10, fontWeight: 600 }}>· ✓ Done</span>}
        </div>
        {isDone && winner && (
          <span style={{ color: 'var(--amber)', fontSize: 11, fontWeight: 600 }}>
            {teamName(winner).split(' ')[0]} won
          </span>
        )}
      </div>

      {/* Scheduled time */}
      {rec.time && !isDone && (
        <p style={{ color: 'var(--green)', fontSize: 11, fontWeight: 700, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 5 }}>
          🕐 {rec.day ? `${rec.day} · ` : ''}{rec.timeWindow ?? rec.time}
        </p>
      )}

      {/* Teams + scores */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: (actionLabel || notReadyNote) ? 14 : 0 }}>
        {[
          { id: home, name: homeName, score: scores?.s1 ?? null },
          { id: away, name: awayName, score: scores?.s2 ?? null },
        ].map(({ id, name, score }, idx) => (
          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{
              fontSize: 15, fontWeight: id && id === winner ? 700 : 500,
              color: id && id === winner ? 'var(--amber)' : id ? 'var(--text)' : 'var(--text-3)',
            }}>
              {name}
            </span>
            {score !== null && (
              <span style={{
                fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                color: id === winner ? 'var(--amber)' : score < 0 ? 'var(--red)' : 'var(--text-2)',
              }}>
                {score}
              </span>
            )}
          </div>
        ))}
      </div>

      {notReadyNote && (
        <p style={{ color: 'var(--text-3)', fontSize: 11, margin: '0 0 4px', fontStyle: 'italic' }}>{notReadyNote}</p>
      )}

      {/* Action + Reset buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        {actionLabel && onAction && (
          <button
            onClick={onAction}
            className="tap"
            style={{
              flex: 1, padding: '13px', borderRadius: 12,
              background: actionColor ?? 'var(--green)', color: '#1a0800',
              fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {actionLabel}
          </button>
        )}
        {onReset && (
          <button
            onClick={onReset}
            className="tap"
            style={{
              padding: '13px 16px', borderRadius: 12,
              background: 'transparent', border: '1px solid rgba(244,106,106,0.3)',
              color: 'var(--red)', fontWeight: 600, fontSize: 13,
              cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
            }}
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ children, dot }: { children: React.ReactNode; dot?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
      {dot && <span className="live-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />}
      <p style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
        {children}
      </p>
    </div>
  );
}
