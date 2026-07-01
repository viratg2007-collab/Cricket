interface Props {
  perOverRuns: Record<number, number>;
  totalOvers: number;
  currentAbsoluteOver: number;
  isComplete: boolean;
}

export function ManhattanChart({ perOverRuns, totalOvers, currentAbsoluteOver, isComplete }: Props) {
  const VIEWBOX_W = 300;
  const POS_H = 72;   // max height for positive bars (px in viewBox)
  const NEG_H = 20;   // max height for negative bars
  const PAD_TOP = 10;
  const LABEL_H = 10;
  const TOTAL_H = PAD_TOP + POS_H + NEG_H + LABEL_H;
  const BASELINE_Y = PAD_TOP + POS_H;
  const barW = VIEWBOX_W / totalOvers;
  const GAP = 2;

  const positiveValues = Object.values(perOverRuns).filter(r => r > 0);
  const negativeValues = Object.values(perOverRuns).filter(r => r < 0);
  const maxPos = Math.max(10, ...positiveValues);
  const maxNeg = Math.max(4, ...negativeValues.map(Math.abs));

  // Y-axis guide lines at 25%, 50%, 75% of max
  const guideRuns = [
    Math.round(maxPos * 0.5),
    Math.round(maxPos),
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  return (
    <div>
      <svg
        viewBox={`0 0 ${VIEWBOX_W} ${TOTAL_H}`}
        className="w-full"
        style={{ height: '110px' }}
        aria-label="Manhattan chart: runs per over"
      >
        {/* Faint guide lines */}
        {guideRuns.map(r => {
          const gy = BASELINE_Y - (r / maxPos) * POS_H;
          return (
            <g key={r}>
              <line x1={0} y1={gy} x2={VIEWBOX_W} y2={gy} stroke="#192c43" strokeWidth={0.5} strokeDasharray="3 3" />
              <text x={2} y={gy - 1} fontSize={5} fill="#3d5870">{r}</text>
            </g>
          );
        })}

        {/* Baseline */}
        <line x1={0} y1={BASELINE_Y} x2={VIEWBOX_W} y2={BASELINE_Y} stroke="#3d5870" strokeWidth={0.8} />

        {/* Bars */}
        {Array.from({ length: totalOvers }, (_, i) => {
          const x = i * barW + GAP / 2;
          const bw = barW - GAP;
          const runs = perOverRuns[i];
          const isCurrent = !isComplete && i === currentAbsoluteOver;
          const hasBeenBowled = runs !== undefined;

          if (!hasBeenBowled) {
            // Future over — placeholder tick
            return (
              <g key={i}>
                <rect x={x} y={BASELINE_Y - 2} width={bw} height={2} fill="#192c43" rx={1} />
                <text x={x + bw / 2} y={TOTAL_H - 1} textAnchor="middle" fontSize={5.5} fill="#3d5870">{i + 1}</text>
              </g>
            );
          }

          if (runs >= 0) {
            const h = Math.max(3, (runs / maxPos) * POS_H);
            const fill = isCurrent ? '#16c07a' : runs === 0 ? '#192c43' : '#3b7de0';
            return (
              <g key={i}>
                <rect x={x} y={BASELINE_Y - h} width={bw} height={h} fill={fill} rx={1} />
                {runs > 0 && (
                  <text x={x + bw / 2} y={BASELINE_Y - h - 2} textAnchor="middle" fontSize={5} fill="#7fa4c4">{runs}</text>
                )}
                <text x={x + bw / 2} y={TOTAL_H - 1} textAnchor="middle" fontSize={5.5} fill="#3d5870">{i + 1}</text>
              </g>
            );
          } else {
            const h = Math.max(3, (Math.abs(runs) / maxNeg) * NEG_H);
            return (
              <g key={i}>
                <rect x={x} y={BASELINE_Y} width={bw} height={h} fill="#f16060" rx={1} />
                <text x={x + bw / 2} y={BASELINE_Y + h + 6} textAnchor="middle" fontSize={5} fill="#f16060">{runs}</text>
                <text x={x + bw / 2} y={TOTAL_H - 1} textAnchor="middle" fontSize={5.5} fill="#3d5870">{i + 1}</text>
              </g>
            );
          }
        })}
      </svg>

      <div style={{ display: 'flex', gap: 16, marginTop: 4, padding: '0 2px' }}>
        {[
          { color: '#3b7de0', label: 'Runs' },
          { color: '#16c07a', label: 'Current' },
          { color: '#f16060', label: 'Net −ve' },
        ].map(({ color, label }) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-3)' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: 'inline-block', flexShrink: 0 }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
