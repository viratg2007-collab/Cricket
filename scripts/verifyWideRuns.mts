import { computeNetRunEffect, shouldReBowl } from '../src/lib/engine';
import { MENS_SETTINGS } from '../src/lib/mensData';
const S = MENS_SETTINGS;
const wideBase = S.wide_value; // 2
const cases = [
  ['Wide, no run',    'wide', wideBase + 0],
  ['Wide + 1 run',    'wide', wideBase + 1],
  ['Wide + 2 runs',   'wide', wideBase + 2],
  ['No-ball + 1 run', 'no_ball', S.no_ball_value + 1],
];
console.log('Format wide_value =', S.wide_value, ', no_ball_value =', S.no_ball_value, '\n');
for (const [label, type, ev] of cases as [string,string,number][]) {
  const net = computeNetRunEffect(0, ev, false, S);        // runs added to team total
  const reBowl = shouldReBowl(type, false, S);             // mid-over (not last ball of pair)
  console.log(`${label.padEnd(18)} -> extra_value ${ev}, adds ${net} to score, legal ball: ${!reBowl ? 'yes' : 'no (re-bowl)'}`);
}
