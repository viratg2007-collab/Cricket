import { useGame } from '../context/GameContext';
import { bowlerFigures, formatOvers } from '../lib/engine';

interface Props {
  onSelect: (bowlerId: string) => void;
}

export function BowlerModal({ onSelect }: Props) {
  const { state, derived, getPlayer, getTeam } = useGame();
  const settings = state.match.settings;

  const activeSlot = state.activeInnings === 1 ? state.inn1 : state.inn2;
  const bowlers = state.players.filter(p => p.team_id === activeSlot.innings.bowling_team_id);

  // Live score so the scorer can see it while picking the bowler.
  const battingTeamName = getTeam(activeSlot.innings.batting_team_id)?.name ?? '';
  const legalBalls = activeSlot.deliveries.filter(d => !d.is_deleted && d.legal_ball).length;
  const oversStr = formatOvers(legalBalls, settings.balls_per_over);

  // One bowler per innings may bowl 3 overs; once that slot is taken, everyone else is capped at 2
  const threeOverSlotTaken = Object.keys(derived.bowler_overs).some(
    id => (derived.bowler_overs[id] ?? 0) >= 3
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', zIndex: 50 }}>
      {/* Live score — visible in the space above the sheet */}
      <div style={{ padding: '28px 20px 12px', textAlign: 'center' }}>
        <p style={{ color: 'rgba(255,153,51,0.8)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', margin: '0 0 6px' }}>
          {battingTeamName} batting
        </p>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4 }}>
          <span style={{ fontSize: 56, fontWeight: 900, lineHeight: 1, letterSpacing: '-1.5px', color: derived.total < 0 ? '#fca5a5' : '#fff' }}>{derived.total}</span>
          <span style={{ fontSize: 22, fontWeight: 300, color: 'rgba(255,255,255,0.3)' }}>/</span>
          <span style={{ fontSize: 22, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>{derived.wickets}</span>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, margin: '8px 0 0', fontVariantNumeric: 'tabular-nums' }}>
          {oversStr} / {settings.overs_per_innings} overs
        </p>
      </div>

      <div style={{
        width: '100%', background: 'var(--surface)',
        borderRadius: '20px 20px 0 0', border: '1px solid var(--border)',
        padding: 20, maxHeight: '70vh', overflowY: 'auto',
      }}>
        <h2 style={{ color: 'var(--text)', fontSize: 17, fontWeight: 700, margin: '0 0 4px' }}>Select Bowler</h2>
        <p style={{ color: 'var(--text-3)', fontSize: 13, margin: '0 0 4px' }}>New over — pick next bowler</p>
        {!threeOverSlotTaken && (
          <p style={{ color: 'var(--amber)', fontSize: 11, fontWeight: 500, margin: '0 0 16px' }}>
            3-over slot available — one bowler may bowl a 3rd over this innings
          </p>
        )}
        {threeOverSlotTaken && (
          <p style={{ color: 'var(--text-3)', fontSize: 11, margin: '0 0 16px' }}>
            3-over slot used — all bowlers limited to 2 overs
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {bowlers.map(p => {
            const overs = derived.bowler_overs[p.id] ?? 0;
            const extraBalls = derived.bowler_extra_balls[p.id] ?? 0;
            const runs = derived.bowler_runs[p.id] ?? 0;
            const wkts = derived.bowler_wickets[p.id] ?? 0;
            const justBowled = p.id === state.current_bowler_id;
            // At limit if: just bowled last over, OR bowled 3+ overs, OR bowled 2+ and 3-over slot taken
            const atLimit = justBowled || overs >= 3 || (overs >= settings.max_overs_per_bowler && threeOverSlotTaken);
            const canUseThreeOverSlot = !justBowled && overs >= settings.max_overs_per_bowler && !threeOverSlotTaken;
            const isCurrent = p.id === state.current_bowler_id;

            return (
              <button
                key={p.id}
                disabled={atLimit}
                onClick={() => onSelect(p.id)}
                className="tap"
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '13px 16px', borderRadius: 12, textAlign: 'left',
                  background: atLimit
                    ? 'rgba(255,255,255,0.02)'
                    : isCurrent
                    ? 'var(--green-2)'
                    : 'var(--surface-2)',
                  border: atLimit
                    ? '1px solid var(--border-2)'
                    : isCurrent
                    ? '1px solid rgba(255,153,51,0.28)'
                    : '1px solid var(--border)',
                  cursor: atLimit ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  opacity: atLimit ? 0.45 : 1,
                }}
              >
                <span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: atLimit ? 'var(--text-3)' : isCurrent ? 'var(--green)' : 'var(--text)' }}>
                    {p.name}
                  </span>
                  {p.is_captain && (
                    <span style={{ color: 'var(--amber)', fontSize: 11, marginLeft: 6 }}>(C)</span>
                  )}
                  {atLimit && justBowled && (
                    <span style={{ color: 'var(--red)', fontSize: 11, marginLeft: 8 }}>cannot bowl consecutive overs</span>
                  )}
                  {atLimit && !justBowled && overs >= 3 && (
                    <span style={{ color: 'var(--red)', fontSize: 11, marginLeft: 8 }}>3-over limit</span>
                  )}
                  {atLimit && !justBowled && overs < 3 && (
                    <span style={{ color: 'var(--red)', fontSize: 11, marginLeft: 8 }}>2-over limit (slot taken)</span>
                  )}
                  {canUseThreeOverSlot && (
                    <span style={{ color: 'var(--amber)', fontSize: 11, marginLeft: 8 }}>uses 3-over slot</span>
                  )}
                </span>
                <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
                  {overs > 0 || extraBalls > 0 ? bowlerFigures(overs, extraBalls, runs, wkts) : '—'}
                </span>
              </button>
            );
          })}
        </div>

        {state.current_bowler_id && (
          <p style={{ color: 'var(--text-3)', fontSize: 11, textAlign: 'center', marginTop: 12 }}>
            Last bowler: {getPlayer(state.current_bowler_id)?.name}
          </p>
        )}
      </div>
    </div>
  );
}
