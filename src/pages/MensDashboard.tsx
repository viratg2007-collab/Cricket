import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Login, checkLocalAuth } from './Login';
import { supabase, supabaseEnabled, softDeleteInnings, clearMatchToss } from '../lib/supabase';
import { MENS_MATCHES, getMensMatch, computeMensOverviews, mensTeamName, mensSlotLabel } from '../lib/mensData';
import type { MensOverview, MensMatchRecord } from '../lib/mensData';
import { getEffectiveStatus, getCompletedMatchIds } from '../lib/matchState';

function resetMatch(matchId: string) {
  localStorage.removeItem(`cricket_match_${matchId}_v2`);
  localStorage.removeItem(`cricket_offline_queue_${matchId}`);
  const done = getCompletedMatchIds();
  done.delete(matchId);
  localStorage.setItem('cricket_completed_matches', JSON.stringify([...done]));
  if (localStorage.getItem('cricket_live_match') === matchId) {
    localStorage.removeItem('cricket_live_match');
  }
  if (supabaseEnabled) {
    const rec = getMensMatch(matchId);
    if (rec) { softDeleteInnings([rec.innings1_id, rec.innings2_id]); clearMatchToss(matchId); }
  } else {
    fetch(`http://${window.location.hostname}:5180/state/${matchId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'null',
    }).catch(() => {});
  }
}

// ── Auth wrapper ──────────────────────────────────────────────────────────────

export function MensDashboard() {
  const [auth, setAuth] = useState<'loading' | 'yes' | 'no'>('loading');
  useEffect(() => {
    if (checkLocalAuth()) { setAuth('yes'); return; }
    if (supabaseEnabled && supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        setAuth(checkLocalAuth() || session ? 'yes' : 'no');
      });
    } else setAuth('no');
  }, []);

  if (auth === 'loading') {
    return <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: 'var(--text-3)', fontSize: 14 }}>Loading…</span></div>;
  }
  if (auth === 'no') return <Login onLogin={() => setAuth('yes')} />;
  return <Dashboard />;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function Dashboard() {
  const navigate = useNavigate();
  const [, setTick] = useState(0);
  const [overviews, setOverviews] = useState<Record<string, MensOverview>>({});

  useEffect(() => {
    const tick = () => {
      computeMensOverviews().then(setOverviews).finally(() => setTick(t => t + 1));
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

  const allMatches = MENS_MATCHES.map(base => {
    const rec = getMensMatch(base.match.id) ?? base;
    const ready = base.round === 'rr' || (!!rec.match.home_team_id && !!rec.match.away_team_id);
    const ov = overviews[base.match.id];
    const status = (ov?.status ?? getEffectiveStatus(rec.match.id, 'scheduled')) as 'live' | 'scheduled' | 'complete';
    const scores = ov && ov.status !== 'scheduled' ? { s1: ov.s1, s2: ov.s2 } : { s1: null, s2: null };
    return { rec, ready, status, scores };
  });

  const nextId = allMatches.find(m => m.status !== 'complete' && m.ready)?.rec.match.id;

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', maxWidth: 480, margin: '0 auto', paddingBottom: 48 }}>
      <div style={{
        background: 'linear-gradient(160deg, #0a1628 0%, #081019 52%, var(--bg) 100%)',
        borderBottom: '1px solid rgba(56,132,255,0.20)', padding: '28px 18px 22px',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -60, left: '50%', transform: 'translateX(-50%)', width: 340, height: 240, background: 'radial-gradient(ellipse, rgba(56,132,255,0.14) 0%, transparent 62%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            <Link to="/score" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,153,51,0.12)', border: '1px solid rgba(255,153,51,0.35)', borderRadius: 20, padding: '6px 13px', color: 'var(--green)', fontSize: 11, fontWeight: 700, textDecoration: 'none' }}>
              ⇄ Score Women's
            </Link>
          </div>
          <p style={{ color: 'rgba(120,170,255,0.7)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', margin: '0 0 6px' }}>
            Scorer Panel · Men's +50
          </p>
          <h1 style={{ color: 'var(--text)', fontSize: 26, fontWeight: 900, margin: 0, letterSpacing: '-0.4px' }}>
            Select a Match
          </h1>
          <p style={{ color: 'var(--text-3)', fontSize: 13, margin: '4px 0 0' }}>
            Men's +50 Tournament · Antwerp 2026
          </p>
        </div>
      </div>

      <div style={{ padding: '20px 14px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SectionLabel>Match Schedule · in order</SectionLabel>
        {allMatches.map(({ rec, ready, status, scores }, i) => (
          <MatchCard
            key={rec.match.id}
            rec={rec}
            matchNum={i + 1}
            status={status}
            scores={status === 'complete' ? scores : undefined}
            isNext={rec.match.id === nextId}
            actionLabel={status === 'live' ? 'Continue Scoring →' : (status === 'scheduled' && ready ? 'Start Scoring →' : undefined)}
            notReadyNote={status === 'scheduled' && !ready ? 'Finalists set once the round robin finishes' : undefined}
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

// ── Match card ────────────────────────────────────────────────────────────────

function MatchCard({ rec, matchNum, status, scores, isNext, actionLabel, notReadyNote, onAction, onReset }: {
  rec: MensMatchRecord;
  matchNum?: number;
  status: 'live' | 'scheduled' | 'complete';
  scores?: { s1: number | null; s2: number | null };
  isNext?: boolean;
  actionLabel?: string;
  notReadyNote?: string;
  onAction?: () => void;
  onReset?: () => void;
}) {
  const isLive = status === 'live';
  const isDone = status === 'complete';
  const home = rec.match.home_team_id;
  const away = rec.match.away_team_id;
  const homeName = home ? mensTeamName(home) : mensSlotLabel(rec.homeSlot);
  const awayName = away ? mensTeamName(away) : mensSlotLabel(rec.awaySlot);

  const winner = isDone && scores?.s1 != null && scores?.s2 != null
    ? scores.s1 > scores.s2 ? home : scores.s2 > scores.s1 ? away : null
    : null;

  const highlight = isLive || isNext;
  return (
    <div style={{
      background: highlight ? 'linear-gradient(135deg, #0a1628 0%, #081019 100%)' : 'var(--surface)',
      border: `1px solid ${highlight ? 'rgba(56,132,255,0.30)' : isDone ? 'var(--border-2)' : 'var(--border)'}`,
      borderRadius: 16, padding: '16px',
      boxShadow: highlight ? 'inset 3px 0 0 var(--blue)' : 'none',
      opacity: isDone ? 0.82 : 1,
    }}>
      {isNext && !isLive && (
        <p style={{ color: 'var(--blue)', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', margin: '0 0 8px' }}>▶ Up Next</p>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isLive && <span className="live-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--blue)', display: 'inline-block' }} />}
          <span style={{
            background: isLive ? 'rgba(56,132,255,0.15)' : 'var(--surface-2)',
            border: `1px solid ${isLive ? 'rgba(56,132,255,0.25)' : 'var(--border-2)'}`,
            color: isLive ? 'var(--blue)' : 'var(--text-2)',
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.1em',
            padding: '3px 10px', borderRadius: 20,
          }}>
            Match {matchNum}
          </span>
          <span style={{ color: 'var(--text-3)', fontSize: 10, fontWeight: 600 }}>{rec.roundLabel}</span>
          {isLive && <span style={{ color: 'var(--blue)', fontSize: 10, fontWeight: 700 }}>· LIVE</span>}
          {isDone && <span style={{ color: 'var(--text-3)', fontSize: 10, fontWeight: 600 }}>· ✓ Done</span>}
        </div>
        {isDone && winner && (
          <span style={{ color: 'var(--amber)', fontSize: 11, fontWeight: 600 }}>
            {mensTeamName(winner).split(' ')[0]} won
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: (actionLabel || notReadyNote) ? 14 : 0 }}>
        {[
          { id: home, name: homeName, score: scores?.s1 ?? null },
          { id: away, name: awayName, score: scores?.s2 ?? null },
        ].map(({ id, name, score }, idx) => (
          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{
              fontSize: 15, fontWeight: id && id === winner ? 700 : 500,
              color: id && id === winner ? 'var(--amber)' : id ? 'var(--text)' : 'var(--text-3)',
            }}>{name}</span>
            {score !== null && (
              <span style={{
                fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                color: id === winner ? 'var(--amber)' : score < 0 ? 'var(--red)' : 'var(--text-2)',
              }}>{score}</span>
            )}
          </div>
        ))}
      </div>

      {notReadyNote && (
        <p style={{ color: 'var(--text-3)', fontSize: 11, margin: '0 0 4px', fontStyle: 'italic' }}>{notReadyNote}</p>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        {actionLabel && onAction && (
          <button onClick={onAction} className="tap" style={{
            flex: 1, padding: '13px', borderRadius: 12, background: 'var(--blue)', color: '#fff',
            fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          }}>{actionLabel}</button>
        )}
        {onReset && (
          <button onClick={onReset} className="tap" style={{
            padding: '13px 16px', borderRadius: 12, background: 'transparent',
            border: '1px solid rgba(244,106,106,0.3)', color: 'var(--red)', fontWeight: 600, fontSize: 13,
            cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
          }}>Reset</button>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
      <p style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
        {children}
      </p>
    </div>
  );
}
