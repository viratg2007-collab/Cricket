import { computeNetRunEffect } from '../src/lib/engine';
import { MENS_SETTINGS } from '../src/lib/mensData';
const S = MENS_SETTINGS; // dismissal_penalty = -2
console.log('dismissal_penalty =', S.dismissal_penalty, '\n');
for (const runs of [0,1,2]) {
  const net = computeNetRunEffect(runs, 0, true, S); // run_out with `runs` completed
  console.log(`Run out, ${runs} run(s) completed -> ${runs} + (${S.dismissal_penalty}) = ${net} to the team total`);
}
