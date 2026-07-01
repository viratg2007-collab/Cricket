import type { Delivery } from '../lib/types';

interface Props {
  delivery: Delivery;
  small?: boolean;
}

export function BallDot({ delivery: d, small }: Props) {
  const sz = small ? 28 : 34;

  const base: React.CSSProperties = {
    width: sz, height: sz,
    borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700, fontSize: small ? 11 : 13,
    flexShrink: 0,
    border: '1.5px solid',
  };

  if (d.is_wicket) return (
    <span style={{ ...base, background: 'rgba(239,68,68,0.2)', borderColor: 'rgba(239,68,68,0.5)', color: '#fca5a5' }}>W</span>
  );
  if (d.extra_type === 'wide') return (
    <span style={{ ...base, background: 'rgba(249,115,22,0.15)', borderColor: 'rgba(249,115,22,0.4)', color: '#fdba74', fontSize: small ? 9 : 11 }}>Wd</span>
  );
  if (d.extra_type === 'no_ball') return (
    <span style={{ ...base, background: 'rgba(249,115,22,0.15)', borderColor: 'rgba(249,115,22,0.4)', color: '#fdba74', fontSize: small ? 9 : 11 }}>NB</span>
  );
  if (d.extra_type === 'bye') return (
    <span style={{ ...base, background: 'rgba(148,163,184,0.08)', borderColor: 'rgba(148,163,184,0.2)', color: '#64748b', fontSize: small ? 9 : 10 }}>
      {d.extra_value}b
    </span>
  );
  if (d.extra_type === 'leg_bye') return (
    <span style={{ ...base, background: 'rgba(148,163,184,0.08)', borderColor: 'rgba(148,163,184,0.2)', color: '#64748b', fontSize: small ? 9 : 10 }}>
      {d.extra_value}lb
    </span>
  );
  if (d.runs_off_bat === 0) return (
    <span style={{ ...base, background: 'transparent', borderColor: 'rgba(255,255,255,0.08)', color: '#334155' }}>·</span>
  );
  if (d.runs_off_bat === 4) return (
    <span style={{ ...base, background: 'rgba(245,158,11,0.15)', borderColor: 'rgba(245,158,11,0.4)', color: '#fcd34d' }}>4</span>
  );
  if (d.runs_off_bat === 6) return (
    <span style={{ ...base, background: 'rgba(168,85,247,0.15)', borderColor: 'rgba(168,85,247,0.4)', color: '#e9d5ff' }}>6</span>
  );
  return (
    <span style={{ ...base, background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.12)', color: '#cbd5e1' }}>
      {d.runs_off_bat}
    </span>
  );
}
