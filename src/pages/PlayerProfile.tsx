import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  loadTournamentStats, fmtSR, fmtOvers, fmtEcon, fmtBowlSR,
  type TournamentStats,
} from '../lib/tournamentStats';
import { supabase, supabaseEnabled } from '../lib/supabase';
import { anyPlayer, anyTeam, isMensPlayer } from '../lib/resolve';

function getPlayer(id: string) { return anyPlayer(id); }
function teamOf(id: string) { const t = getPlayer(id)?.team_id; return t ? anyTeam(t) : undefined; }

export function PlayerProfile() {
  const { playerId } = useParams<{ playerId: string }>();
  const [stats, setStats] = useState<TournamentStats | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const refresh = () => loadTournamentStats(playerId && isMensPlayer(playerId) ? 'mens' : 'womens').then(setStats);
    refresh();
    if (supabaseEnabled && supabase) {
      const ch = supabase
        .channel('player-profile-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, refresh)
        .subscribe();
      return () => { supabase!.removeChannel(ch); };
    } else {
      pollRef.current = setInterval(refresh, 2500);
      return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }
  }, [playerId]);

  const player = playerId ? getPlayer(playerId) : undefined;

  if (!player) {
    return (
      <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 14 }}>🏏</div>
        <h1 style={{ color: 'var(--text)', fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>Player not found</h1>
        <Link to="/stats" style={{ color: 'var(--green)', fontSize: 13, textDecoration: 'none' }}>← Stats</Link>
      </div>
    );
  }

  const team = teamOf(player.id);
  const bat = stats?.batting.find(r => r.player_id === player.id);
  const bowl = stats?.bowling.find(r => r.player_id === player.id);
  const field = stats?.fielding.find(r => r.player_id === player.id);
  const mvp = stats?.mvp.find(r => r.player_id === player.id);
  const hasAny = bat || bowl || field;

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', maxWidth: 480, margin: '0 auto', paddingBottom: 48 }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(175deg, #201305 0%, #160e05 55%, var(--bg) 100%)',
        padding: '20px 18px 24px', position: 'relative', overflow: 'hidden',
        borderBottom: '1px solid rgba(255,153,51,0.10)',
      }}>
        <div style={{ position: 'absolute', top: -40, right: -20, width: 200, height: 160, background: 'radial-gradient(ellipse, rgba(255,153,51,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <Link to="/stats" style={{ color: 'var(--text-3)', fontSize: 12, textDecoration: 'none', display: 'block', marginBottom: 14 }}>← Stats</Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(255,153,51,0.12)', border: '1px solid rgba(255,153,51,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 900, color: 'var(--green)', flexShrink: 0 }}>
              {player.name.charAt(0)}
            </div>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ color: 'var(--text)', fontSize: 22, fontWeight: 800, margin: '0 0 3px', letterSpacing: '-0.4px' }}>
                {player.name}{player.is_captain && <span style={{ color: 'var(--amber)', fontSize: 13, marginLeft: 7 }}>(C)</span>}
              </h1>
              <p style={{ color: 'var(--text-3)', fontSize: 13, margin: 0 }}>{team?.name}</p>
            </div>
          </div>

          {/* MVP points pill */}
          {mvp && (
            <div style={{ marginTop: 16, background: 'linear-gradient(135deg, rgba(245,197,58,0.14) 0%, rgba(245,197,58,0.05) 100%)', border: '1px solid rgba(245,197,58,0.30)', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ color: 'rgba(245,197,58,0.85)', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', margin: '0 0 4px' }}>🏆 MVP Points</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  {mvp.batting_pts > 0 && <span style={{ color: 'var(--green)', fontSize: 11 }}>Bat {mvp.batting_pts.toFixed(1)}</span>}
                  {mvp.bowling_pts > 0 && <span style={{ color: 'var(--red)', fontSize: 11 }}>Bowl {mvp.bowling_pts.toFixed(1)}</span>}
                  {mvp.fielding_pts > 0 && <span style={{ color: 'var(--blue)', fontSize: 11 }}>Field {mvp.fielding_pts.toFixed(1)}</span>}
                </div>
              </div>
              <span style={{ color: 'rgba(245,197,58,0.9)', fontSize: 30, fontWeight: 900, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px' }}>{mvp.total.toFixed(1)}</span>
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: '20px 14px 0' }}>
        {!hasAny && (
          <div style={{ textAlign: 'center', padding: '56px 24px' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
            <p style={{ color: 'var(--text)', fontWeight: 700, fontSize: 16, margin: '0 0 6px' }}>No stats yet</p>
            <p style={{ color: 'var(--text-3)', fontSize: 13, margin: 0 }}>This player hasn't featured in a scored match yet.</p>
          </div>
        )}

        {/* Batting */}
        {bat && (
          <Section label="BATTING" accent="var(--green)">
            <StatGrid items={[
              ['Runs', String(bat.runs)],
              ['Balls', String(bat.balls)],
              ['Strike Rate', fmtSR(bat.runs, bat.balls)],
              ['Highest', String(bat.highest_score)],
              ['Fours', String(bat.fours)],
              ['Sixes', String(bat.sixes)],
              ['Innings', String(bat.innings_played)],
              ['Dismissals', String(bat.dismissals)],
            ]} />
          </Section>
        )}

        {/* Bowling */}
        {bowl && (
          <Section label="BOWLING" accent="var(--red)">
            <StatGrid items={[
              ['Overs', fmtOvers(bowl.legal_balls)],
              ['Wickets', String(bowl.wickets)],
              ['Runs', String(bowl.runs_conceded)],
              ['Economy', fmtEcon(bowl.runs_conceded, bowl.legal_balls)],
              ['Bowl SR', fmtBowlSR(bowl.legal_balls, bowl.wickets)],
              ['5W Hauls', String(bowl.five_wicket_hauls)],
            ]} />
          </Section>
        )}

        {/* Fielding */}
        {field && (
          <Section label="FIELDING" accent="var(--blue)">
            <StatGrid items={[
              ['Catches', String(field.catches)],
              ['Run Outs', String(field.run_outs)],
              ['Stumpings', String(field.stumpings)],
              ['Total', String(field.total)],
            ]} />
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ label, accent, children }: { label: string; accent: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <p style={{ color: accent, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', margin: '0 0 8px 4px' }}>{label}</p>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '6px 8px' }}>
        {children}
      </div>
    </div>
  );
}

function StatGrid({ items }: { items: [string, string][] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
      {items.map(([label, value], i) => (
        <div key={label} style={{
          padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: 2,
          borderBottom: i < items.length - (items.length % 2 === 0 ? 2 : 1) ? '1px solid var(--border-2)' : 'none',
          borderRight: i % 2 === 0 ? '1px solid var(--border-2)' : 'none',
        }}>
          <span style={{ color: 'var(--text)', fontSize: 22, fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px' }}>{value}</span>
          <span style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 500 }}>{label}</span>
        </div>
      ))}
    </div>
  );
}
