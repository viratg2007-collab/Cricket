const COMPLETED_KEY = 'cricket_completed_matches';
const LIVE_KEY      = 'cricket_live_match';

export function getCompletedMatchIds(): Set<string> {
  try {
    const raw = localStorage.getItem(COMPLETED_KEY);
    return new Set(raw ? JSON.parse(raw) as string[] : []);
  } catch { return new Set(); }
}

export function getLiveMatchId(): string | null {
  try { return localStorage.getItem(LIVE_KEY); } catch { return null; }
}

export function recordMatchComplete(matchId: string): void {
  const done = getCompletedMatchIds();
  done.add(matchId);
  localStorage.setItem(COMPLETED_KEY, JSON.stringify([...done]));
  if (getLiveMatchId() === matchId) localStorage.removeItem(LIVE_KEY);
}

export function setLiveMatchId(matchId: string): void {
  localStorage.setItem(LIVE_KEY, matchId);
}

export function getEffectiveStatus(
  matchId: string,
  staticStatus: 'live' | 'complete' | 'scheduled',
): 'live' | 'complete' | 'scheduled' {
  try {
    if (getCompletedMatchIds().has(matchId)) return 'complete';
    const live = getLiveMatchId();
    if (live === matchId) return 'live';
  } catch {}
  return staticStatus;
}
