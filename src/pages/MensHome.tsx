import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  MENS_MATCHES, MENS_TEAMS, MENS_PLAYERS, getMensMatch, mensPairs,
  computeMensOverviews, computeMensStandings, mensTeamName, mensTeamShort, mensSlotLabel, mensPlayer,
} from '../lib/mensData';
import type { MensOverview, MensStandingRow } from '../lib/mensData';
import { loadTournamentStats } from '../lib/tournamentStats';
import type { TournamentStats } from '../lib/tournamentStats';
import { fetchMatchToss, fetchDeliveries } from '../lib/supabase';
import { deriveMatchState, formatOvers, runRate } from '../lib/engine';
import type { Delivery } from '../lib/types';

type Tab = 'matches' | 'fixtures' | 'table' | 'squads' | 'stats';

const ACCENT = 'var(--green)';
function playerName(id: string) { return mensPlayer(id)?.name ?? 'Unknown'; }
function teamShortOfPlayer(id: string) { return mensTeamShort(mensPlayer(id)?.team_id ?? ''); }

const TABS: Tab[] = ['matches', 'fixtures', 'table', 'squads', 'stats'];
export function MensHome() {
  const navigate = useNavigate();
  const urlTab = (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tab') : null) as Tab | null;
  const [tab, setTab] = useState<Tab>(urlTab && TABS.includes(urlTab) ? urlTab : 'matches');
  const [overviews, setOverviews] = useState<Record<string, MensOverview>>({});
  const [standings, setStandings] = useState<MensStandingRow[]>([]);
  const [finalists, setFinalists] = useState<string[]>([]);
  const [stats, setStats] = useState<TournamentStats | null>(null);
  const [toss, setToss] = useState<{ winner_id: string | null; elected: 'bat' | 'bowl' | null } | null>(null);
  const [liveDels, setLiveDels] = useState<{ d1: Delivery[]; d2: Delivery[] }>({ d1: [], d2: [] });

  useEffect(() => {
    const tick = () => {
      computeMensOverviews().then(ov => {
        setOverviews(ov);
        const liveRec = MENS_MATCHES.find(r => ov[r.match.id]?.status === 'live');
        if (liveRec) {
          fetchMatchToss(liveRec.match.id).then(setToss).catch(() => {});
          Promise.all([fetchDeliveries(liveRec.innings1_id), fetchDeliveries(liveRec.innings2_id)])
            .then(([d1, d2]) => setLiveDels({ d1, d2 })).catch(() => {});
        } else { setToss(null); setLiveDels({ d1: [], d2: [] }); }
      }).catch(() => {});
      computeMensStandings().then(s => { setStandings(s.rows); setFinalists(s.finalists); }).catch(() => {});
      loadTournamentStats('mens').then(setStats).catch(() => {});
    };
    tick();
    const id = setInterval(tick, 6000);
    return () => clearInterval(id);
  }, []);

  const live = MENS_MATCHES.find(r => overviews[r.match.id]?.status === 'live');

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      {/* India tricolor stripe */}
      <div style={{ height: 5, display: 'flex', flexShrink: 0 }}>
        <div style={{ flex: 1, background: '#FF9933' }} />
        <div style={{ flex: 1, background: '#ffffff' }} />
        <div style={{ flex: 1, background: '#138808' }} />
      </div>

      {/* Header */}
      <div style={{
        background: 'linear-gradient(160deg, #251508 0%, #1a0f06 52%, var(--bg) 100%)',
        borderBottom: '1px solid rgba(255,153,51,0.20)',
        flexShrink: 0, position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -60, left: '50%', transform: 'translateX(-50%)', width: 420, height: 300, background: 'radial-gradient(ellipse, rgba(255,153,51,0.20) 0%, transparent 62%)', pointerEvents: 'none' }} />

        {/* Title */}
        <div style={{ padding: '16px 18px 16px', position: 'relative', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
            <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,153,51,0.10)', border: '1px solid rgba(255,153,51,0.28)', borderRadius: 20, padding: '6px 13px', color: 'var(--green)', fontSize: 11, fontWeight: 700, textDecoration: 'none' }}>
              ⇄ Men's / Women's
            </Link>
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(255,153,51,0.10)', border: '1px solid rgba(255,153,51,0.24)',
            borderRadius: 20, padding: '4px 13px', marginBottom: 12,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: ACCENT, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ color: 'rgba(255,153,51,0.9)', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.22em' }}>
              Antwerp · 2026
            </span>
          </div>
          <h1 style={{ color: 'var(--text)', fontSize: 24, fontWeight: 900, margin: 0, letterSpacing: '-0.4px', lineHeight: 1.18, textShadow: '0 2px 28px rgba(255,153,51,0.12)' }}>
            Men's +50<br />Cricket Tournament
          </h1>
        </div>

        {/* Logo strip — AICC · Mega Sports · AIA */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-evenly', padding: '10px 14px 18px', borderTop: '1px solid rgba(255,255,255,0.05)', position: 'relative' }}>
          <LogoTile>
            <div style={{ background: 'white', borderRadius: 10, padding: '4px 6px', boxShadow: '0 2px 14px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 50, height: 56, overflow: 'hidden' }}>
              <img src="/aicc-logo.jpg" alt="AICC" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <Caption>Antwerp Indian Cricket Club</Caption>
          </LogoTile>
          <Divider />
          <LogoTile>
            <div style={{ background: 'white', borderRadius: 11, padding: '4px 9px', boxShadow: '0 2px 16px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.10)' }}>
              <img src="/mega-sports-logo.jpg" alt="Mega Sports" style={{ height: 48, width: 'auto', display: 'block', objectFit: 'contain' }} />
            </div>
            <span style={{ color: 'rgba(255,153,51,0.8)', fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Tournament</span>
          </LogoTile>
          <Divider />
          <LogoTile>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'white', overflow: 'hidden', boxShadow: '0 2px 14px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src="/aia-logo.jpg" alt="AIA" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <Caption>Antwerp Indian Association</Caption>
          </LogoTile>
        </div>

        {/* Main Sponsor — Swintu Diam bv */}
        <div style={{ margin: '0 14px 18px', background: 'linear-gradient(135deg, rgba(245,197,58,0.07) 0%, rgba(245,197,58,0.03) 100%)', border: '1px solid rgba(245,197,58,0.22)', borderRadius: 14, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 14, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -20, right: -10, width: 100, height: 80, background: 'radial-gradient(ellipse, rgba(245,197,58,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ flexShrink: 0 }}>
            <p style={{ color: 'var(--amber)', fontSize: 8.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.22em', margin: 0, lineHeight: 1 }}>Main</p>
            <p style={{ color: 'var(--amber)', fontSize: 8.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.22em', margin: '2px 0 0', lineHeight: 1 }}>Sponsor</p>
            <p style={{ color: 'rgba(245,197,58,0.55)', fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.22em', margin: '2px 0 0', lineHeight: 1 }}>2026</p>
          </div>
          <div style={{ width: 1, height: 36, background: 'rgba(245,197,58,0.20)', flexShrink: 0 }} />
          <div style={{ background: 'white', borderRadius: 10, padding: '5px 10px', boxShadow: '0 2px 16px rgba(0,0,0,0.4), 0 0 0 1px rgba(245,197,58,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 48, flexShrink: 0 }}>
            <img src="/swintu-diam-logo.png" alt="Swintu Diam bv" style={{ height: 38, width: 'auto', display: 'block', objectFit: 'contain' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ color: 'var(--text)', fontSize: 13, fontWeight: 800, margin: 0, letterSpacing: '-0.2px' }}>Swintu Diam bv</p>
            <p style={{ color: 'var(--text-3)', fontSize: 10, margin: '2px 0 0', fontWeight: 500 }}>Official Title Sponsor</p>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {([['matches', 'Matches'], ['fixtures', 'Fixtures'], ['table', 'Table'], ['squads', 'Squads'], ['stats', 'Stats']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '14px 2px', background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 11, fontWeight: tab === t ? 700 : 400,
            color: tab === t ? ACCENT : 'var(--text-3)',
            borderBottom: tab === t ? `2px solid ${ACCENT}` : '2px solid transparent', letterSpacing: '0.01em',
          }}>{label}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 12px 32px', maxWidth: 560, width: '100%', margin: '0 auto' }}>
        {tab === 'matches' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {stats && (stats.batting.length > 0 || (stats.bowling.some(b => b.wickets > 0)) || stats.mvp.length > 0) && (
              <section>
                <SectionLabel>Top Performers</SectionLabel>
                <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
                  {stats.batting.length > 0 && (() => {
                    const top = [...stats.batting].sort((a, b) => b.runs - a.runs)[0];
                    return <PerfCard onClick={() => navigate(`/player/${top.player_id}`)} label="🏏 Most Runs" color="var(--green)" name={playerName(top.player_id)} team={teamShortOfPlayer(top.player_id)} value={top.runs} sub={`runs · ${top.balls}b`} />;
                  })()}
                  {stats.bowling.some(b => b.wickets > 0) && (() => {
                    const top = [...stats.bowling].sort((a, b) => b.wickets - a.wickets)[0];
                    return <PerfCard onClick={() => navigate(`/player/${top.player_id}`)} label="🎯 Most Wickets" color="var(--red)" name={playerName(top.player_id)} team={teamShortOfPlayer(top.player_id)} value={top.wickets} sub="wickets" />;
                  })()}
                  {stats.mvp.length > 0 && (() => {
                    const top = stats.mvp[0];
                    return <PerfCard onClick={() => navigate(`/player/${top.player_id}`)} label="🏆 MVP" color="var(--amber)" gold name={playerName(top.player_id)} team={teamShortOfPlayer(top.player_id)} value={Number(top.total.toFixed(1))} sub="pts" />;
                  })()}
                </div>
              </section>
            )}

            {live && (
              <section>
                <SectionLabel dot>Live Now</SectionLabel>
                <LiveCard rec={live} d1={liveDels.d1} d2={liveDels.d2} toss={toss} />
              </section>
            )}

            {(() => {
              const completed = MENS_MATCHES.filter(r => overviews[r.match.id]?.status === 'complete');
              if (completed.length === 0) return null;
              return (
                <section>
                  <SectionLabel>Results</SectionLabel>
                  <MatchList items={completed} overviews={overviews} />
                </section>
              );
            })()}

            {!live && !MENS_MATCHES.some(r => overviews[r.match.id]?.status === 'complete') && (
              <div style={{ textAlign: 'center', padding: '56px 24px' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🏏</div>
                <p style={{ color: 'var(--text)', fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>Tournament not started</p>
                <p style={{ color: 'var(--text-3)', fontSize: 13 }}>Check <b style={{ color: ACCENT }} onClick={() => setTab('fixtures')}>Fixtures</b> for the full schedule.</p>
              </div>
            )}
          </div>
        )}

        {tab === 'fixtures' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            {([
              { title: 'Round Robin', match: (r: typeof MENS_MATCHES[number]) => r.round === 'rr' },
              { title: 'Final', match: (r: typeof MENS_MATCHES[number]) => r.round === 'final' },
            ] as const).map(section => {
              const items = MENS_MATCHES.filter(section.match);
              if (items.length === 0) return null;
              return (
                <div key={section.title}>
                  <SectionLabel>{section.title}</SectionLabel>
                  <MatchList items={items} overviews={overviews} />
                </div>
              );
            })}
          </div>
        )}
        {tab === 'table' && <StandingsTable rows={standings} finalists={finalists} />}
        {tab === 'squads' && <Squads />}
        {tab === 'stats' && <StatsPanel stats={stats} />}
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

// ── Small presentational helpers ────────────────────────────────────────────────
function LogoTile({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>{children}</div>;
}
function Caption({ children }: { children: React.ReactNode }) {
  return <span style={{ color: 'var(--text-3)', fontSize: 9, fontWeight: 500, letterSpacing: '0.02em', textAlign: 'center', maxWidth: 72, lineHeight: 1.3 }}>{children}</span>;
}
function Divider() { return <div style={{ width: 1, height: 44, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />; }

function SectionLabel({ children, dot }: { children: React.ReactNode; dot?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
      {dot && <span className="live-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: ACCENT, display: 'inline-block' }} />}
      <p style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>{children}</p>
    </div>
  );
}

function PerfCard({ onClick, label, color, name, team, value, sub, gold }: { onClick: () => void; label: string; color: string; name: string; team: string; value: number; sub: string; gold?: boolean }) {
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}>
      <div style={{ background: gold ? 'linear-gradient(135deg, rgba(245,197,58,0.12) 0%, rgba(245,197,58,0.04) 100%)' : 'var(--surface)', border: `1px solid ${gold ? 'rgba(245,197,58,0.30)' : 'var(--border)'}`, borderRadius: 14, padding: '12px 14px', minWidth: 130, textAlign: 'left' }}>
        <p style={{ color, fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', margin: '0 0 6px' }}>{label}</p>
        <p style={{ color: 'var(--text)', fontSize: 14, fontWeight: 700, margin: '0 0 1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>{name}</p>
        <p style={{ color: 'var(--text-3)', fontSize: 10, margin: '0 0 8px' }}>{team}</p>
        <p style={{ color, fontSize: 26, fontWeight: 900, margin: 0, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{value}</p>
        <p style={{ color: 'var(--text-3)', fontSize: 9, margin: '2px 0 0' }}>{sub}</p>
      </div>
    </button>
  );
}

function MatchLine({ ov, home, away, homeSlot, awaySlot }: { ov?: MensOverview; home: string; away: string; homeSlot: string; awaySlot: string }) {
  const hName = home ? mensTeamName(home) : mensSlotLabel(homeSlot);
  const aName = away ? mensTeamName(away) : mensSlotLabel(awaySlot);
  const s1 = ov && ov.status !== 'scheduled' ? ov.s1 : null;
  const s2 = ov && ov.status !== 'scheduled' ? ov.s2 : null;
  const winner = ov?.status === 'complete' && s1 != null && s2 != null ? (s1 > s2 ? home : s2 > s1 ? away : null) : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {[{ id: home, name: hName, s: s1 }, { id: away, name: aName, s: s2 }].map((r, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 15, fontWeight: r.id === winner ? 700 : 500, color: r.id === winner ? 'var(--amber)' : r.id ? 'var(--text)' : 'var(--text-3)' }}>{r.name}</span>
          {r.s != null && <span style={{ fontSize: 17, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: r.id === winner ? 'var(--amber)' : r.s < 0 ? 'var(--red)' : 'var(--text-2)' }}>{r.s}</span>}
        </div>
      ))}
    </div>
  );
}

function LiveCard({ rec, d1, d2, toss }: {
  rec: typeof MENS_MATCHES[number];
  d1: Delivery[]; d2: Delivery[];
  toss: { winner_id: string | null; elected: 'bat' | 'bowl' | null } | null;
}) {
  const settings = rec.match.settings;
  const active1 = d1.filter(d => !d.is_deleted);
  const active2 = d2.filter(d => !d.is_deleted);
  const activeInnings = active2.length > 0 ? 2 : 1;
  const dels = activeInnings === 2 ? active2 : active1;
  const pairs = mensPairs(activeInnings === 2 ? rec.match.away_team_id : rec.match.home_team_id, rec.match.id);
  const derived = deriveMatchState(dels, pairs, settings);
  const firstStriker = dels.find(d => d.striker_id)?.striker_id;
  const battingTeam = mensPlayer(firstStriker ?? '')?.team_id
    ?? (activeInnings === 2 ? rec.match.away_team_id : rec.match.home_team_id);
  const bowlingTeam = battingTeam === rec.match.home_team_id ? rec.match.away_team_id : rec.match.home_team_id;
  const legal = dels.filter(d => d.legal_ball).length;
  const totalBalls = settings.num_pairs * settings.overs_per_pair * settings.balls_per_over;

  // Chase context in the 2nd innings
  const firstScore = deriveMatchState(active1, mensPairs(rec.match.home_team_id, rec.match.id), settings).total;
  const target = firstScore + 1;
  const need = target - derived.total;
  const ballsLeft = totalBalls - legal;

  const striker = mensPlayer(derived.striker_id);
  const nonStriker = mensPlayer(derived.non_striker_id);

  return (
    <Link to={`/match/${rec.match.id}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div style={{
        background: 'linear-gradient(160deg, #251508 0%, #1a0f06 55%, var(--bg) 100%)',
        border: '1px solid rgba(255,153,51,0.24)', borderRadius: 16, padding: 16,
        boxShadow: `inset 3px 0 0 ${ACCENT}`, position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -20, right: -10, width: 160, height: 120, background: 'radial-gradient(ellipse, rgba(255,153,51,0.11) 0%, transparent 68%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span className="live-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: ACCENT, display: 'inline-block' }} />
              <span style={{ color: ACCENT, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Live</span>
              <span style={{ color: 'var(--text-3)', fontSize: 10, fontWeight: 600 }}>· {rec.roundLabel}</span>
            </div>
            <span style={{ color: 'var(--text-3)', fontSize: 11 }}>Tap for full view →</span>
          </div>

          {toss?.winner_id && toss.elected && (
            <p style={{ color: 'rgba(255,153,51,0.8)', fontSize: 10, fontWeight: 600, margin: '0 0 6px' }}>
              🪙 {mensTeamShort(toss.winner_id)} won toss · elected to {toss.elected === 'bat' ? 'bat' : 'bowl'} first
            </p>
          )}

          <p style={{ color: 'rgba(255,153,51,0.65)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 6px' }}>
            {mensTeamName(battingTeam)} batting
          </p>

          {legal > 0 ? (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                  <span className="tabular" style={{ fontSize: 52, fontWeight: 900, lineHeight: 1, letterSpacing: '-2px', color: derived.total < 0 ? 'var(--red)' : 'var(--text)' }}>{derived.total}</span>
                  <span style={{ fontSize: 18, fontWeight: 300, color: 'rgba(255,255,255,0.2)', margin: '0 2px' }}>/</span>
                  <span className="tabular" style={{ fontSize: 18, fontWeight: 500, color: 'rgba(255,255,255,0.4)' }}>{derived.wickets}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ color: 'var(--text-2)', fontSize: 13, fontWeight: 700, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                    {formatOvers(legal, settings.balls_per_over)} <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>/ {settings.overs_per_innings} ov</span>
                  </p>
                  <p style={{ color: 'var(--text-3)', fontSize: 11, margin: '2px 0 0' }}>RR {runRate(derived.total, legal, settings.balls_per_over)}</p>
                </div>
              </div>

              {/* Batters on strike */}
              <div style={{ display: 'flex', gap: 12, marginBottom: activeInnings === 2 ? 8 : 0 }}>
                {striker && <span style={{ color: 'var(--green)', fontSize: 12, fontWeight: 600 }}>🏏 {striker.name.split(' ')[0]}*</span>}
                {nonStriker && <span style={{ color: 'var(--text-3)', fontSize: 12 }}>{nonStriker.name.split(' ')[0]}</span>}
              </div>

              {activeInnings === 2 && need > 0 && ballsLeft > 0 && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8, marginTop: 4 }}>
                  <p style={{ color: 'var(--amber)', fontSize: 12, fontWeight: 700, margin: 0 }}>
                    {mensTeamShort(battingTeam)} need {need} off {ballsLeft} · chasing {target}
                  </p>
                </div>
              )}
            </>
          ) : (
            <p style={{ color: 'var(--text-3)', fontSize: 13, margin: '8px 0 0' }}>
              {mensTeamName(bowlingTeam)} will bowl to {mensTeamName(battingTeam)} · waiting for first ball…
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

function MatchList({ items, overviews }: { items: typeof MENS_MATCHES; overviews: Record<string, MensOverview> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map(base => {
        const num = MENS_MATCHES.findIndex(r => r.match.id === base.match.id) + 1;
        return <MatchRow key={base.match.id} base={base} num={num} overviews={overviews} />;
      })}
    </div>
  );
}

function MatchRow({ base, num, overviews }: { base: typeof MENS_MATCHES[number]; num: number; overviews: Record<string, MensOverview> }) {
  const rec = getMensMatch(base.match.id) ?? base;
  const ov = overviews[base.match.id];
  const status = ov?.status ?? 'scheduled';
  const inner = (
    <div style={{ background: 'var(--surface)', border: `1px solid ${status === 'live' ? 'rgba(255,153,51,0.3)' : 'var(--border)'}`, borderRadius: 14, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ background: 'var(--surface-2)', color: 'var(--text-2)', fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20 }}>Match {num}</span>
        <span style={{ color: 'var(--text-3)', fontSize: 10, fontWeight: 600 }}>{rec.roundLabel}</span>
        {status === 'live' && <span style={{ color: ACCENT, fontSize: 10, fontWeight: 800 }}>· LIVE</span>}
        {status === 'complete' && <span style={{ color: 'var(--text-3)', fontSize: 10, fontWeight: 600 }}>· ✓ Done</span>}
        {status === 'scheduled' && <span style={{ color: 'var(--text-3)', fontSize: 10, fontWeight: 600 }}>· Upcoming</span>}
      </div>
      {rec.time && status !== 'complete' && (
        <p style={{ color: ACCENT, fontSize: 10.5, fontWeight: 700, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 5 }}>
          🕐 {rec.day ? `${rec.day} · ` : ''}{rec.timeWindow ?? rec.time}
        </p>
      )}
      <MatchLine ov={ov} home={rec.match.home_team_id} away={rec.match.away_team_id} homeSlot={rec.homeSlot} awaySlot={rec.awaySlot} />
    </div>
  );
  return status === 'scheduled'
    ? <div>{inner}</div>
    : <Link to={`/match/${base.match.id}`} style={{ textDecoration: 'none' }}>{inner}</Link>;
}

function StandingsTable({ rows, finalists }: { rows: MensStandingRow[]; finalists: string[] }) {
  if (rows.length === 0) return <Empty msg="Standings appear once matches are played." />;
  const cols = '28px 1fr 34px 34px 34px 42px 52px';
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 4, padding: '10px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text-3)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        <span>#</span><span>Team</span><span style={{ textAlign: 'center' }}>P</span><span style={{ textAlign: 'center' }}>W</span><span style={{ textAlign: 'center' }}>L</span><span style={{ textAlign: 'center' }}>Pts</span><span style={{ textAlign: 'right' }}>NRR</span>
      </div>
      {rows.map((r, i) => {
        const isFinalist = finalists.includes(r.team_id);
        return (
          <div key={r.team_id} style={{ display: 'grid', gridTemplateColumns: cols, gap: 4, padding: '11px 12px', borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'center', background: isFinalist ? 'rgba(255,153,51,0.06)' : 'transparent' }}>
            <span style={{ color: isFinalist ? ACCENT : 'var(--text-3)', fontSize: 13, fontWeight: 700 }}>{i + 1}</span>
            <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600 }}>{mensTeamName(r.team_id)}</span>
            <span style={{ textAlign: 'center', color: 'var(--text-2)', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{r.played}</span>
            <span style={{ textAlign: 'center', color: 'var(--text-2)', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{r.won}</span>
            <span style={{ textAlign: 'center', color: 'var(--text-2)', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{r.lost}</span>
            <span style={{ textAlign: 'center', color: 'var(--text)', fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{r.points}</span>
            <span style={{ textAlign: 'right', color: 'var(--text-3)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{r.nrr >= 0 ? '+' : ''}{r.nrr.toFixed(2)}</span>
          </div>
        );
      })}
      <p style={{ color: 'var(--text-3)', fontSize: 11, padding: '10px 12px', margin: 0 }}>Top 2 (highlighted) advance to the final.</p>
    </div>
  );
}

function Squads() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {MENS_TEAMS.map(t => {
        const roster = MENS_PLAYERS.filter(p => p.team_id === t.id);
        return (
          <div key={t.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text)', fontSize: 14, fontWeight: 800 }}>{t.name}</span>
              <span style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 600 }}>{t.short_name} · {roster.length}</span>
            </div>
            <div style={{ padding: '6px 0' }}>
              {roster.map(p => (
                <Link key={p.id} to={`/player/${p.id}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px' }}>
                  <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: p.is_captain ? 700 : 500 }}>
                    {p.name}{p.is_captain && <span style={{ color: ACCENT, fontSize: 10, fontWeight: 800, marginLeft: 6 }}>(C)</span>}
                  </span>
                  <span style={{ color: 'var(--text-3)', fontSize: 12 }}>›</span>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatsPanel({ stats }: { stats: TournamentStats | null }) {
  if (!stats) return <Empty msg="Loading stats…" />;
  const topRuns = [...stats.batting].sort((a, b) => b.runs - a.runs).slice(0, 5);
  const topWkts = [...stats.bowling].filter(b => b.wickets > 0).sort((a, b) => b.wickets - a.wickets).slice(0, 5);
  const topMvp = [...stats.mvp].slice(0, 5);
  if (topRuns.length === 0 && topWkts.length === 0) return <Empty msg="Stats appear once matches are played." />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <StatCard title="🏏 Most Runs" rows={topRuns.map(r => ({ id: r.player_id, main: `${r.runs}`, sub: `${r.balls}b` }))} />
      <StatCard title="🎯 Most Wickets" rows={topWkts.map(r => ({ id: r.player_id, main: `${r.wickets}`, sub: `${r.runs_conceded}r` }))} />
      <StatCard title="🏆 MVP" rows={topMvp.map(r => ({ id: r.player_id, main: r.total.toFixed(1), sub: 'pts' }))} />
    </div>
  );
}

function StatCard({ title, rows }: { title: string; rows: { id: string; main: string; sub: string }[] }) {
  if (rows.length === 0) return null;
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
      <p style={{ color: 'var(--text-2)', fontSize: 12, fontWeight: 800, padding: '12px 14px 8px', margin: 0 }}>{title}</p>
      {rows.map((r, i) => (
        <Link key={r.id + i} to={`/player/${r.id}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', borderTop: '1px solid var(--border)' }}>
          <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: i === 0 ? 700 : 500 }}>
            <span style={{ color: 'var(--text-3)', marginRight: 8, fontSize: 12 }}>{i + 1}</span>{playerName(r.id)}
            <span style={{ color: 'var(--text-3)', fontSize: 11, marginLeft: 6 }}>{teamShortOfPlayer(r.id)}</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
            <span style={{ color: i === 0 ? 'var(--amber)' : 'var(--text)', fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{r.main}</span>
            <span style={{ color: 'var(--text-3)', fontSize: 11 }}>{r.sub}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-3)', fontSize: 13 }}>{msg}</div>;
}
