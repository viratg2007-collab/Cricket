// Deterministic UUID-format IDs for all seed data.
// The seed.sql uses the same values — keep them in sync.
// cat: 1=team  2=player  3=pair  4=match  5=innings
function mkid(cat: number, n: number): string {
  return `00000000-0000-0000-${cat.toString(16).padStart(4, '0')}-${n.toString(16).padStart(12, '0')}`;
}

export const TEAM = {
  SS:  mkid(1, 1), // Sparkle Strikers
  NA:  mkid(1, 2), // Nishant's Angles
  AS:  mkid(1, 3), // Anay Strikers
  MS:  mkid(1, 4), // Modi Sarkar
  KS:  mkid(1, 5), // Kashvat Strikers
  ATS: mkid(1, 6), // Anita Stars
};

// Players 1-84.  SS=1-14, NA=15-28, AS=29-42, MS=43-56, KS=57-70, ATS=71-84
export function playerId(n: number): string { return mkid(2, n); }

// SS pairs 1-6 → pair indexes 1-6;  NA pairs 1-6 → pair indexes 7-12
export function pairId(pairIndex: number): string { return mkid(3, pairIndex); }

export const MATCH_ID   = mkid(4, 1);
export const INNINGS_ID = mkid(5, 1);
