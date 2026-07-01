import type { WinPrediction } from '../lib/winPredictor';

interface Props {
  firstShort: string;   // team batting 1st (short name)
  secondShort: string;  // team batting 2nd
  prediction: WinPrediction;
  activeInnings: 1 | 2;
}

// Broadcast-style live win predictor bar.
export function WinPredictor({ firstShort, secondShort, prediction, activeInnings }: Props) {
  const { first, second } = prediction;
  const firstLeads = first >= second;
  const FIRST = 'var(--blue)';
  const SECOND = 'var(--green)';

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
        <p style={{ color: 'var(--amber)', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', margin: 0 }}>
          ⚡ Win Predictor
        </p>
        <span style={{ color: 'var(--text-3)', fontSize: 9, fontWeight: 500 }}>
          {activeInnings === 1 ? 'projection · 1st innings' : 'live chase'}
        </span>
      </div>

      {/* Split bar — label sits inside each segment when it's wide enough */}
      <div style={{ display: 'flex', height: 32, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-2)' }}>
        <div style={{
          width: `${first}%`, background: FIRST, opacity: firstLeads ? 1 : 0.55,
          display: 'flex', alignItems: 'center', justifyContent: 'flex-start', paddingLeft: 10,
          transition: 'width 0.5s ease', minWidth: first > 0 ? 2 : 0,
        }}>
          {first >= 20 && <span style={{ color: '#04122b', fontSize: 12.5, fontWeight: 800, whiteSpace: 'nowrap' }}>{firstShort} {first}%</span>}
        </div>
        <div style={{
          width: `${second}%`, background: SECOND, opacity: firstLeads ? 0.55 : 1,
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 10,
          transition: 'width 0.5s ease', minWidth: second > 0 ? 2 : 0,
        }}>
          {second >= 20 && <span style={{ color: '#04170c', fontSize: 12.5, fontWeight: 800, whiteSpace: 'nowrap' }}>{secondShort} {second}%</span>}
        </div>
      </div>

      {/* Only show a label below for a side too narrow to fit its label inline */}
      {(first < 20 || second < 20) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <span style={{ color: FIRST, fontSize: 11, fontWeight: 700, visibility: first < 20 ? 'visible' : 'hidden' }}>{firstShort} {first}%</span>
          <span style={{ color: SECOND, fontSize: 11, fontWeight: 700, visibility: second < 20 ? 'visible' : 'hidden' }}>{second}% {secondShort}</span>
        </div>
      )}
    </div>
  );
}
