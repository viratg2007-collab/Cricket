import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  loadTournamentStats, fmtSR, fmtOvers, fmtEcon,
  type BattingRow, type BowlingRow, type MVPRow, type TournamentStats,
} from '../lib/tournamentStats';
import { supabase, supabaseEnabled } from '../lib/supabase';
import { PLAYERS, TEAMS } from '../lib/seedData';

function playerName(id: string) { return PLAYERS.find(p => p.id === id)?.name ?? '?'; }
function playerTeam(id: string) { return TEAMS.find(t => t.id === PLAYERS.find(p => p.id === id)?.team_id)?.short_name ?? '?'; }

type StatId =
  | 'mvp'
  // batting
  | 'most_runs' | 'highest_score' | 'strike_rate' | 'most_fours' | 'most_sixes'
  // bowling
  | 'most_wickets' | 'best_economy' | 'best_figures' | 'most_5w'
  // fielding
  | 'most_catches' | 'run_outs';

interface Category { id: StatId; label: string; }

const BATTING_CATS: Category[] = [
  { id: 'most_runs',     label: 'Most Runs' },
  { id: 'highest_score', label: 'Highest Score' },
  { id: 'strike_rate',   label: 'Best Strike Rate' },
  { id: 'most_fours',    label: 'Most Fours' },
  { id: 'most_sixes',    label: 'Most Sixes' },
];

const BOWLING_CATS: Category[] = [
  { id: 'most_wickets',  label: 'Most Wickets' },
  { id: 'best_economy',  label: 'Best Economy' },
  { id: 'best_figures',  label: 'Best Bowling Figures' },
  { id: 'most_5w',       label: 'Most 5 Wicket Hauls' },
];

const FIELDING_CATS: Category[] = [
  { id: 'most_catches', label: 'Most Catches' },
  { id: 'run_outs',     label: 'Most Run Outs' },
];

const MEDAL = ['🥇', '🥈', '🥉'];

export function StatsPage() {
  const [stats, setStats] = useState<TournamentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [view, setView] = useState<'menu' | StatId>('menu');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function refresh() {
    loadTournamentStats().then(s => { setStats(s); setLastUpdated(new Date()); setLoading(false); });
  }

  useEffect(() => {
    refresh();
    const onVisible = () => { if (!document.hidden) refresh(); };
    if (supabaseEnabled && supabase) {
      const ch = supabase
        .channel('stats-page-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, refresh)
        .subscribe();
      // Safety net against dropped realtime
      const backup = setInterval(refresh, 20000);
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('focus', onVisible);
      return () => {
        supabase!.removeChannel(ch);
        clearInterval(backup);
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('focus', onVisible);
      };
    } else {
      pollRef.current = setInterval(refresh, 2000);
      return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }
  }, []);

  const noData = !loading && (!stats || stats.batting.length === 0);

  if (view === 'mvp' && stats) {
    return <MVPLeaderboard rows={stats.mvp} onBack={() => setView('menu')} />;
  }
  if (view !== 'menu' && stats) {
    return <Leaderboard stat={view} stats={stats} onBack={() => setView('menu')} />;
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', maxWidth: 480, margin: '0 auto', paddingBottom: 48 }}>

      {/* Header */}
      <div style={{
        background: 'linear-gradient(175deg, #201305 0%, #160e05 55%, var(--bg) 100%)',
        padding: '20px 18px 22px', position: 'relative', overflow: 'hidden',
        borderBottom: '1px solid rgba(255,153,51,0.10)',
      }}>
        <div style={{ position: 'absolute', top: -40, right: -20, width: 200, height: 160, background: 'radial-gradient(ellipse, rgba(255,153,51,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <Link to="/womens" style={{ color: 'var(--text-3)', fontSize: 12, textDecoration: 'none', display: 'block', marginBottom: 10 }}>
            ← Tournament
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <h1 style={{ color: 'var(--text)', fontSize: 24, fontWeight: 800, margin: '0 0 4px', letterSpacing: '-0.5px' }}>
              Tournament Stats
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,153,51,0.12)', border: '1px solid rgba(255,153,51,0.25)', borderRadius: 20, padding: '3px 10px', flexShrink: 0 }}>
              <span className="live-dot" style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
              <span style={{ color: 'var(--green)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Live</span>
            </div>
          </div>
          <p style={{ color: 'var(--text-3)', fontSize: 12, margin: 0 }}>
            Woman 2026
            {lastUpdated && <span style={{ opacity: 0.6 }}> · Updated {lastUpdated.toLocaleTimeString()}</span>}
          </p>
        </div>
      </div>

      <div style={{ padding: '20px 14px 0' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '64px 24px' }}>
            <div style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--green)', borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 0.8s linear infinite' }} />
            <p style={{ color: 'var(--text-3)', fontSize: 13, margin: 0 }}>Loading stats…</p>
          </div>
        )}
        {noData && (
          <div style={{ textAlign: 'center', padding: '64px 24px' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
            <p style={{ color: 'var(--text)', fontWeight: 700, fontSize: 18, margin: '0 0 8px' }}>No stats yet</p>
            <p style={{ color: 'var(--text-3)', fontSize: 13, margin: 0 }}>Stats appear once matches have been scored.</p>
          </div>
        )}

        {!noData && stats && (
          <>
            {/* ── MVP Hero Card ── */}
            {stats.mvp.length > 0 && (() => {
              const top = stats.mvp[0];
              return (
                <button
                  onClick={() => setView('mvp')}
                  className="tap"
                  style={{
                    width: '100%', marginBottom: 20, padding: 0, background: 'none',
                    border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                  }}
                >
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(245,197,58,0.18) 0%, rgba(245,197,58,0.06) 100%)',
                    border: '1px solid rgba(245,197,58,0.40)',
                    borderRadius: 16, padding: '16px 18px',
                    position: 'relative', overflow: 'hidden',
                  }}>
                    <div style={{ position: 'absolute', top: -20, right: -10, fontSize: 80, opacity: 0.08, lineHeight: 1, pointerEvents: 'none' }}>🏆</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <p style={{ color: 'rgba(245,197,58,0.8)', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.18em', margin: '0 0 6px' }}>
                          🏆 Tournament MVP
                        </p>
                        <p style={{ color: 'var(--text)', fontSize: 20, fontWeight: 900, margin: '0 0 2px', letterSpacing: '-0.3px' }}>
                          {playerName(top.player_id)}
                        </p>
                        <p style={{ color: 'var(--text-3)', fontSize: 11, margin: '0 0 10px' }}>
                          {playerTeam(top.player_id)}
                        </p>
                        <div style={{ display: 'flex', gap: 10 }}>
                          {top.batting_pts > 0 && (
                            <span style={{ background: 'rgba(29,184,92,0.12)', border: '1px solid rgba(29,184,92,0.25)', borderRadius: 8, padding: '3px 8px', fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>
                              Bat {top.batting_pts.toFixed(1)}
                            </span>
                          )}
                          {top.bowling_pts > 0 && (
                            <span style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.22)', borderRadius: 8, padding: '3px 8px', fontSize: 11, color: 'var(--red)', fontWeight: 600 }}>
                              Bowl {top.bowling_pts.toFixed(1)}
                            </span>
                          )}
                          {top.fielding_pts > 0 && (
                            <span style={{ background: 'rgba(165,200,255,0.10)', border: '1px solid rgba(165,200,255,0.22)', borderRadius: 8, padding: '3px 8px', fontSize: 11, color: 'var(--blue)', fontWeight: 600 }}>
                              Field {top.fielding_pts.toFixed(1)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <p style={{ color: 'rgba(245,197,58,0.9)', fontSize: 40, fontWeight: 900, margin: 0, letterSpacing: '-1px', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                          {top.total.toFixed(1)}
                        </p>
                        <p style={{ color: 'rgba(245,197,58,0.55)', fontSize: 10, fontWeight: 600, margin: '3px 0 0', textTransform: 'uppercase', letterSpacing: '0.08em' }}>pts</p>
                        <p style={{ color: 'var(--text-3)', fontSize: 11, margin: '8px 0 0' }}>View leaderboard ›</p>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })()}

            <MenuSection label="BATTING" accent="var(--green)" cats={BATTING_CATS} onSelect={setView} />
            <MenuSection label="BOWLING" accent="var(--red)" cats={BOWLING_CATS} onSelect={setView} />
            <MenuSection label="FIELDING" accent="var(--blue)" cats={FIELDING_CATS} onSelect={setView} />
          </>
        )}
      </div>
    </div>
  );
}

// ── Menu section ──────────────────────────────────────────────────────────────

function MenuSection({ label, accent, cats, onSelect }: {
  label: string; accent: string;
  cats: Category[];
  onSelect: (id: StatId) => void;
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      <p style={{ color: accent, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', margin: '0 0 8px 4px' }}>
        {label}
      </p>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        {cats.map((cat, i) => (
          <button
            key={cat.id}
            onClick={() => onSelect(cat.id)}
            className="tap"
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '17px 18px',
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              borderBottom: i < cats.length - 1 ? '1px solid var(--border-2)' : 'none',
              textAlign: 'left',
            }}
          >
            <span style={{ color: 'var(--text)', fontSize: 16, fontWeight: 500 }}>{cat.label}</span>
            <span style={{ color: 'var(--text-3)', fontSize: 18, lineHeight: 1 }}>›</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── MVP Leaderboard ───────────────────────────────────────────────────────────

function MVPLeaderboard({ rows, onBack }: { rows: MVPRow[]; onBack: () => void }) {
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', maxWidth: 480, margin: '0 auto', paddingBottom: 48 }}>
      <div style={{
        background: 'linear-gradient(175deg, #201305 0%, #160e05 55%, var(--bg) 100%)',
        padding: '20px 18px 22px', position: 'relative', overflow: 'hidden',
        borderBottom: '1px solid rgba(255,153,51,0.10)',
      }}>
        <div style={{ position: 'relative' }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: 0, display: 'block', marginBottom: 10 }}>
            ← Stats
          </button>
          <h1 style={{ color: 'var(--text)', fontSize: 22, fontWeight: 800, margin: '0 0 3px', letterSpacing: '-0.4px' }}>
            🏆 MVP Leaderboard
          </h1>
          <p style={{ color: 'var(--text-3)', fontSize: 11, margin: 0 }}>
            IPL points · 4s=2.5 · 6s=3.5 · Wicket=3.5 · Dot=1 · Catch/RO/St=2.5
          </p>
        </div>
      </div>

      <div style={{ padding: '16px 14px 0' }}>
        {rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <p style={{ color: 'var(--text-3)', fontSize: 14 }}>No data yet.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rows.map((row, i) => (
              <Link key={row.player_id} to={`/player/${row.player_id}`} style={{
                textDecoration: 'none', display: 'block',
                background: i === 0
                  ? 'linear-gradient(135deg, rgba(245,197,58,0.14) 0%, rgba(245,197,58,0.05) 100%)'
                  : 'var(--surface)',
                border: `1px solid ${i === 0 ? 'rgba(245,197,58,0.35)' : 'var(--border)'}`,
                borderRadius: 14, padding: '14px 16px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  {/* Rank */}
                  <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: i < 3 ? 'rgba(255,255,255,0.06)' : 'transparent' }}>
                    {i === 0 ? <span style={{ fontSize: 22 }}>🥇</span>
                      : i === 1 ? <span style={{ fontSize: 22 }}>🥈</span>
                      : i === 2 ? <span style={{ fontSize: 22 }}>🥉</span>
                      : <span style={{ color: 'var(--text-3)', fontSize: 15, fontWeight: 700 }}>{i + 1}</span>}
                  </div>

                  {/* Player */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: i === 0 ? 'var(--text)' : 'var(--text-2)', fontSize: 15, fontWeight: i === 0 ? 700 : 600, margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {playerName(row.player_id)}
                    </p>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ color: 'var(--text-3)', fontSize: 10 }}>{playerTeam(row.player_id)}</span>
                      {row.batting_pts > 0 && <span style={{ color: 'var(--green)', fontSize: 10 }}>Bat {row.batting_pts.toFixed(1)}</span>}
                      {row.bowling_pts > 0 && <span style={{ color: 'var(--red)', fontSize: 10 }}>Bowl {row.bowling_pts.toFixed(1)}</span>}
                      {row.fielding_pts > 0 && <span style={{ color: 'var(--blue)', fontSize: 10 }}>Field {row.fielding_pts.toFixed(1)}</span>}
                    </div>
                  </div>

                  {/* Total */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ color: i === 0 ? 'rgba(245,197,58,0.9)' : 'var(--text-2)', fontSize: 24, fontWeight: 900, margin: 0, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px' }}>
                      {row.total.toFixed(1)}
                    </p>
                    <p style={{ color: 'var(--text-3)', fontSize: 10, margin: '1px 0 0', fontWeight: 500 }}>pts</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

function Leaderboard({ stat, stats, onBack }: { stat: StatId; stats: TournamentStats; onBack: () => void }) {
  const { rows, valueLabel } = buildLeaderboard(stat, stats);

  const label = [
    ...BATTING_CATS, ...BOWLING_CATS, ...FIELDING_CATS,
  ].find(c => c.id === stat)?.label ?? '';

  const accentColor =
    BATTING_CATS.find(c => c.id === stat)  ? 'var(--green)' :
    BOWLING_CATS.find(c => c.id === stat)  ? 'var(--red)'   :
    'var(--blue)';

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', maxWidth: 480, margin: '0 auto', paddingBottom: 48 }}>

      {/* Header */}
      <div style={{
        background: 'linear-gradient(175deg, #201305 0%, #160e05 55%, var(--bg) 100%)',
        padding: '20px 18px 22px', position: 'relative', overflow: 'hidden',
        borderBottom: '1px solid rgba(255,153,51,0.10)',
      }}>
        <div style={{ position: 'relative' }}>
          <button
            onClick={onBack}
            style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: 0, display: 'block', marginBottom: 10 }}
          >
            ← Stats
          </button>
          <h1 style={{ color: 'var(--text)', fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: '-0.4px' }}>
            {label}
          </h1>
        </div>
      </div>

      <div style={{ padding: '16px 14px 0' }}>
        {rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <p style={{ color: 'var(--text-3)', fontSize: 14 }}>No data yet for this category.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rows.map((row, i) => (
              <Link
                key={row.player_id}
                to={`/player/${row.player_id}`}
                style={{
                  textDecoration: 'none',
                  background: i === 0 ? 'var(--surface-2)' : 'var(--surface)',
                  border: `1px solid ${i === 0 ? 'rgba(255,153,51,0.25)' : 'var(--border)'}`,
                  borderRadius: 14, padding: '14px 16px',
                  display: 'flex', alignItems: 'center', gap: 14,
                }}
              >
                {/* Rank */}
                <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: i < 3 ? 'rgba(255,255,255,0.06)' : 'transparent' }}>
                  {i < 3
                    ? <span style={{ fontSize: 22 }}>{MEDAL[i]}</span>
                    : <span style={{ color: 'var(--text-3)', fontSize: 15, fontWeight: 700 }}>{i + 1}</span>
                  }
                </div>

                {/* Player */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: i === 0 ? 'var(--text)' : 'var(--text-2)', fontSize: 15, fontWeight: i === 0 ? 700 : 600, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {playerName(row.player_id)}
                  </p>
                  <p style={{ color: 'var(--text-3)', fontSize: 11, margin: 0 }}>{playerTeam(row.player_id)} · {row.sub}</p>
                </div>

                {/* Stat value */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ color: i === 0 ? accentColor : 'var(--text-2)', fontSize: 22, fontWeight: 900, margin: 0, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px' }}>
                    {row.value}
                  </p>
                  <p style={{ color: 'var(--text-3)', fontSize: 10, margin: '1px 0 0', fontWeight: 500 }}>{valueLabel}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Leaderboard data builder ──────────────────────────────────────────────────

interface LeaderRow { player_id: string; value: string; sub: string; sortKey: number; }

function buildLeaderboard(stat: StatId, stats: TournamentStats): { rows: LeaderRow[]; valueLabel: string } {
  const bat = stats.batting;
  const bowl = stats.bowling;
  const field = stats.fielding;

  function mkBat(
    list: BattingRow[],
    sortFn: (r: BattingRow) => number,
    valueFn: (r: BattingRow) => string,
    subFn: (r: BattingRow) => string,
    label: string,
    minBalls = 0,
  ) {
    const filtered = minBalls > 0 ? list.filter(r => r.balls >= minBalls) : list;
    const sorted = [...filtered].sort((a, b) => sortFn(b) - sortFn(a));
    return {
      rows: sorted.map(r => ({ player_id: r.player_id, value: valueFn(r), sub: subFn(r), sortKey: sortFn(r) })),
      valueLabel: label,
    };
  }

  function mkBowl(
    list: BowlingRow[],
    sortFn: (r: BowlingRow) => number,
    valueFn: (r: BowlingRow) => string,
    subFn: (r: BowlingRow) => string,
    label: string,
    ascending = false,
    minBalls = 0,
  ) {
    const filtered = minBalls > 0 ? list.filter(r => r.legal_balls >= minBalls) : list;
    const sorted = [...filtered].sort((a, b) => ascending ? sortFn(a) - sortFn(b) : sortFn(b) - sortFn(a));
    return {
      rows: sorted.map(r => ({ player_id: r.player_id, value: valueFn(r), sub: subFn(r), sortKey: sortFn(r) })),
      valueLabel: label,
    };
  }

  switch (stat) {
    case 'most_runs':
      return mkBat(bat,
        r => r.runs,
        r => String(r.runs),
        r => `${r.balls}b · SR ${fmtSR(r.runs, r.balls)}`,
        'runs',
      );

    case 'highest_score':
      return mkBat(bat,
        r => r.highest_score,
        r => String(r.highest_score),
        r => `${r.innings_played} inning${r.innings_played !== 1 ? 's' : ''} · Total ${r.runs}`,
        'highest',
      );

    case 'strike_rate':
      return mkBat(bat,
        r => r.balls === 0 ? 0 : (r.runs / r.balls) * 100,
        r => fmtSR(r.runs, r.balls),
        r => `${r.runs} runs · ${r.balls}b`,
        'SR',
        6,
      );

    case 'most_fours':
      return mkBat(bat,
        r => r.fours,
        r => String(r.fours || 0),
        r => `${r.runs} runs`,
        '× 4s',
      );

    case 'most_sixes':
      return mkBat(bat,
        r => r.sixes,
        r => String(r.sixes || 0),
        r => `${r.runs} runs`,
        '× 6s',
      );

    case 'most_wickets':
      return mkBowl(bowl,
        r => r.wickets,
        r => String(r.wickets),
        r => `${fmtOvers(r.legal_balls)} ov · ${r.runs_conceded} runs · Econ ${fmtEcon(r.runs_conceded, r.legal_balls)}`,
        'wickets',
      );

    case 'best_economy':
      return mkBowl(bowl,
        r => r.legal_balls === 0 ? 999 : (r.runs_conceded / r.legal_balls) * 6,
        r => fmtEcon(r.runs_conceded, r.legal_balls),
        r => `${r.wickets}w · ${fmtOvers(r.legal_balls)} ov`,
        'econ',
        true,
        6,
      );

    case 'best_figures': {
      const sorted = [...bowl]
        .filter(r => r.wickets > 0)
        .sort((a, b) => b.wickets !== a.wickets ? b.wickets - a.wickets : a.runs_conceded - b.runs_conceded);
      return {
        rows: sorted.map(r => ({
          player_id: r.player_id,
          value: `${r.wickets}/${r.runs_conceded}`,
          sub: `${fmtOvers(r.legal_balls)} ov · Econ ${fmtEcon(r.runs_conceded, r.legal_balls)}`,
          sortKey: r.wickets * 1000 - r.runs_conceded,
        })),
        valueLabel: 'figures',
      };
    }

    case 'most_5w':
      return mkBowl(
        bowl.filter(r => r.five_wicket_hauls > 0),
        r => r.five_wicket_hauls,
        r => String(r.five_wicket_hauls),
        r => `${r.wickets} total wickets`,
        '× 5W haul',
      );

    case 'most_catches':
      return {
        rows: [...field]
          .filter(r => r.catches > 0)
          .sort((a, b) => b.catches - a.catches)
          .map(r => ({ player_id: r.player_id, value: String(r.catches), sub: `${r.total} total dismissals`, sortKey: r.catches })),
        valueLabel: 'catches',
      };

    case 'run_outs':
      return {
        rows: [...field]
          .filter(r => r.run_outs > 0)
          .sort((a, b) => b.run_outs - a.run_outs)
          .map(r => ({ player_id: r.player_id, value: String(r.run_outs), sub: `${r.total} total dismissals`, sortKey: r.run_outs })),
        valueLabel: 'run outs',
      };

    default:
      return { rows: [], valueLabel: '' };
  }
}
