import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { ALL_MATCHES, computeStandingsAsync } from '../lib/matchData';
import { TEAMS } from '../lib/seedData';
import { getEffectiveStatus } from '../lib/matchState';
import type { StandingRow } from '../lib/matchData';

function teamName(id: string) {
  return TEAMS.find(t => t.id === id)?.name ?? id;
}
function teamShort(id: string) {
  return TEAMS.find(t => t.id === id)?.short_name ?? '?';
}

function readMatchScores(matchId: string): { s1: number | null; s2: number | null } {
  try {
    const raw = localStorage.getItem(`cricket_match_${matchId}_v2`);
    if (!raw) return { s1: null, s2: null };
    const st = JSON.parse(raw) as { inn1?: { final_score?: number | null }; inn2?: { final_score?: number | null } };
    return {
      s1: st.inn1?.final_score ?? null,
      s2: st.inn2?.final_score ?? null,
    };
  } catch { return { s1: null, s2: null }; }
}

export function TournamentPage() {
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const refresh = () => computeStandingsAsync().then(setStandings);
    refresh();
    pollRef.current = setInterval(refresh, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const liveMatches = ALL_MATCHES.filter(r => getEffectiveStatus(r.match.id, r.match.status) === 'live');
  const scheduledMatches = ALL_MATCHES.filter(r => getEffectiveStatus(r.match.id, r.match.status) === 'scheduled');
  const completedMatches = ALL_MATCHES.filter(r => getEffectiveStatus(r.match.id, r.match.status) === 'complete');

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', maxWidth: 480, margin: '0 auto' }}>

      {/* Header */}
      <div style={{
        background: 'linear-gradient(175deg, #201305 0%, #160e05 55%, var(--bg) 100%)',
        padding: '22px 18px 24px',
        position: 'relative',
        overflow: 'hidden',
        borderBottom: '1px solid rgba(255,153,51,0.10)',
      }}>
        <div style={{
          position: 'absolute', top: -50, right: -30,
          width: 240, height: 200,
          background: 'radial-gradient(ellipse, rgba(255,153,51,0.13) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{ position: 'relative' }}>
          <p style={{
            color: 'rgba(255,153,51,0.6)', fontSize: 11, fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 5px',
          }}>
            Women 2026
          </p>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <h1 style={{ color: 'var(--text)', fontSize: 26, fontWeight: 800, margin: '0 0 5px', letterSpacing: '-0.6px', lineHeight: 1.1 }}>
                Community Cricket
              </h1>
              <p style={{ color: 'var(--text-3)', fontSize: 13, margin: 0 }}>
                6 teams · 15 matches · Round Robin
              </p>
            </div>
            <Link to="/stats" style={{
              background: 'rgba(255,153,51,0.10)',
              border: '1px solid rgba(255,153,51,0.22)',
              color: 'var(--green)', fontSize: 12, fontWeight: 600,
              padding: '8px 14px', borderRadius: 10,
              textDecoration: 'none', flexShrink: 0, marginTop: 4,
              display: 'inline-block',
            }}>
              Stats
            </Link>
          </div>
        </div>
      </div>

      <div style={{ padding: '16px 12px 48px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Standings */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <h2 style={{ color: 'var(--text)', fontSize: 13, fontWeight: 700, margin: 0, letterSpacing: '-0.2px' }}>
              Standings
            </h2>
            <button
              onClick={() => computeStandingsAsync().then(setStandings)}
              style={{
                color: 'var(--text-3)', fontSize: 12, background: 'none',
                border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0,
              }}
            >
              Refresh
            </button>
          </div>
          {/* Column headers */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '18px 1fr 22px 22px 22px 30px 52px',
            padding: '6px 12px',
            borderBottom: '1px solid var(--border-2)',
            gap: 4,
          }}>
            {['#', 'Team', 'P', 'W', 'L', 'Pts', 'NRR'].map((h, i) => (
              <span key={h} style={{
                color: 'var(--text-3)', fontSize: 9, fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.06em',
                textAlign: i > 1 ? 'right' : 'left',
              }}>
                {h}
              </span>
            ))}
          </div>
          {standings.map((row, i) => {
            const nrrStr = row.played === 0 ? '—' : (row.nrr >= 0 ? '+' : '') + row.nrr.toFixed(3);
            const nrrColor = row.played === 0 ? 'var(--text-3)' : row.nrr > 0 ? 'var(--blue)' : row.nrr < 0 ? 'var(--red)' : 'var(--text-3)';
            const isLeader = i === 0 && row.points > 0;
            return (
              <div key={row.team_id} style={{
                display: 'grid',
                gridTemplateColumns: '18px 1fr 22px 22px 22px 30px 52px',
                padding: '10px 12px', gap: 4,
                borderBottom: i < standings.length - 1 ? '1px solid var(--border-2)' : 'none',
                background: isLeader ? 'rgba(255,153,51,0.04)' : 'transparent',
              }}>
                <span style={{ fontSize: 12, fontWeight: isLeader ? 700 : 400, color: isLeader ? 'var(--amber)' : 'var(--text-3)' }}>
                  {i + 1}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: isLeader ? 'var(--text)' : 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {teamName(row.team_id)}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.played}</span>
                <span style={{ fontSize: 11, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: row.won > 0 ? 'var(--green)' : 'var(--text-3)', fontWeight: row.won > 0 ? 700 : 400 }}>{row.won}</span>
                <span style={{ fontSize: 11, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: row.lost > 0 ? 'var(--red)' : 'var(--text-3)' }}>{row.lost}</span>
                <span style={{ fontSize: 13, fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: isLeader ? 'var(--amber)' : 'var(--text)' }}>{row.points}</span>
                <span style={{ fontSize: 11, fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: nrrColor }}>{nrrStr}</span>
              </div>
            );
          })}
          {standings.every(r => r.played === 0) && (
            <p style={{ color: 'var(--text-3)', fontSize: 13, padding: '12px 16px', margin: 0 }}>
              No completed matches yet
            </p>
          )}
        </div>

        {/* Live */}
        {liveMatches.length > 0 && (
          <MatchSection title="Live" pulse>
            {liveMatches.map(rec => (
              <MatchCard key={rec.match.id} rec={rec} scores={readMatchScores(rec.match.id)} variant="live" />
            ))}
          </MatchSection>
        )}

        {/* Scheduled */}
        {scheduledMatches.length > 0 && (
          <MatchSection title="Upcoming">
            {scheduledMatches.map(rec => (
              <MatchCard key={rec.match.id} rec={rec} scores={{ s1: null, s2: null }} variant="scheduled" />
            ))}
          </MatchSection>
        )}

        {/* Completed */}
        {completedMatches.length > 0 && (
          <MatchSection title="Completed">
            {completedMatches.map(rec => (
              <MatchCard key={rec.match.id} rec={rec} scores={readMatchScores(rec.match.id)} variant="complete" />
            ))}
          </MatchSection>
        )}
      </div>
    </div>
  );
}

function MatchSection({ title, children, pulse }: {
  title: string;
  children: React.ReactNode;
  pulse?: boolean;
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 4px', marginBottom: 10 }}>
        {pulse && (
          <span className="live-dot" style={{
            width: 7, height: 7, borderRadius: '50%',
            background: 'var(--green)', display: 'inline-block', flexShrink: 0,
          }} />
        )}
        <h2 style={{
          color: 'var(--text-3)', fontSize: 11, fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0,
        }}>
          {title}
        </h2>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  );
}

type MatchRec = typeof ALL_MATCHES[0];

function MatchCard({
  rec, scores, variant,
}: {
  rec: MatchRec;
  scores: { s1: number | null; s2: number | null };
  variant: 'live' | 'scheduled' | 'complete';
}) {
  const mid = rec.match.id;
  const home = rec.match.home_team_id;
  const away = rec.match.away_team_id;
  const isLive = variant === 'live';

  const winner = (() => {
    if (scores.s1 === null || scores.s2 === null) return null;
    if (scores.s1 > scores.s2) return home;
    if (scores.s2 > scores.s1) return away;
    return 'tie';
  })();

  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${isLive ? 'rgba(255,153,51,0.22)' : 'var(--border)'}`,
      borderRadius: 14,
      overflow: 'hidden',
      boxShadow: isLive ? 'inset 3px 0 0 var(--green)' : 'none',
    }}>
      <div style={{ padding: '14px 16px' }}>

        {/* Team rows */}
        <div style={{ marginBottom: 10 }}>
          {[
            { id: home, score: scores.s1 },
            { id: away, score: scores.s2 },
          ].map(({ id, score }, idx) => (
            <div key={id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '3px 0',
            }}>
              <span style={{
                fontSize: 14,
                fontWeight: winner === id ? 700 : idx === 0 ? 600 : 500,
                color: winner === id ? 'var(--green)' : idx === 0 ? 'var(--text)' : 'var(--text-2)',
              }}>
                {teamName(id)}
              </span>
              {score !== null && (
                <span style={{
                  fontSize: 20, fontWeight: 800, letterSpacing: '-0.5px',
                  fontVariantNumeric: 'tabular-nums',
                  color: score < 0 ? 'var(--red)' : winner === id ? 'var(--text)' : 'var(--text-2)',
                }}>
                  {score}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Result line */}
        {winner === 'tie' && (
          <p style={{ color: 'var(--amber)', fontSize: 11, fontWeight: 600, margin: '0 0 10px' }}>
            Match tied
          </p>
        )}
        {winner && winner !== 'tie' && (
          <p style={{ color: 'var(--text-3)', fontSize: 11, margin: '0 0 10px' }}>
            {teamShort(winner)} won by{' '}
            <span style={{ color: 'var(--text-2)', fontWeight: 600 }}>
              {Math.abs((scores.s1 ?? 0) - (scores.s2 ?? 0))} runs
            </span>
          </p>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          <Link to={`/match/${mid}`} style={{
            flex: 1, textAlign: 'center', padding: '9px 8px', borderRadius: 10,
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            color: 'var(--text-2)', fontSize: 12, fontWeight: 600, textDecoration: 'none',
            display: 'block',
          }}>
            View
          </Link>
          <Link to={`/match/${mid}/score`} style={{
            flex: 1, padding: '9px 8px', borderRadius: 10,
            background: isLive ? 'var(--green-2)' : 'transparent',
            border: `1px solid ${isLive ? 'rgba(255,153,51,0.28)' : 'var(--border)'}`,
            color: isLive ? 'var(--green)' : 'var(--text-3)',
            fontSize: 12, fontWeight: 600, textDecoration: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}>
            {isLive && (
              <span className="live-dot" style={{
                width: 5, height: 5, borderRadius: '50%',
                background: 'var(--green)', display: 'inline-block',
              }} />
            )}
            Score
          </Link>
        </div>
      </div>
    </div>
  );
}
