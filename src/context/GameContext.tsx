import React, {
  createContext, useContext, useEffect, useReducer, useRef, useState,
} from 'react';
import type { Delivery, Innings, Match, Pair, Player, Team } from '../lib/types';
import { PLAYERS, TEAMS } from '../lib/seedData';
import { getMatchRecord, getEmptyPairsForTeam } from '../lib/matchData';
import { getMensMatch, mensEmptyPairs, MENS_TEAMS, MENS_PLAYERS } from '../lib/mensData';

// ── Tournament-aware resolvers (men's & women's IDs never collide) ──────────────
// Route/screen code stays the same; the right data is chosen from the match id.
function isMensMatch(mId: string): boolean { return !!getMensMatch(mId); }
function resolveRecord(mId: string) {
  const m = getMensMatch(mId);
  if (m) return { match: m.match, innings1_id: m.innings1_id, innings2_id: m.innings2_id };
  return getMatchRecord(mId);
}
function resolveEmptyPairs(teamId: string, mId: string): Pair[] {
  return isMensMatch(mId) ? mensEmptyPairs(teamId, mId) : getEmptyPairsForTeam(teamId, mId);
}
function resolveTeams(mId: string): Team[] { return isMensMatch(mId) ? MENS_TEAMS : TEAMS; }
function resolvePlayers(mId: string): Player[] { return isMensMatch(mId) ? MENS_PLAYERS : PLAYERS; }
import {
  computeNetRunEffect, computeStrikeChanged, deriveMatchState, shouldReBowl,
} from '../lib/engine';
import type { DerivedMatchState, ExtraType, WicketType } from '../lib/types';
import { pushDelivery, softDeleteDelivery, updateMatchToss, supabaseEnabled } from '../lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface InningsSlot {
  innings: Innings;
  pairs: Pair[];
  deliveries: Delivery[];
  final_score: number | null;
}

interface GameState {
  matchId: string;
  match: Match;
  teams: Team[];
  players: Player[];
  activeInnings: 1 | 2;
  inn1: InningsSlot;
  inn2: InningsSlot;
  current_bowler_id: string;
  phase: 'toss' | 'select_pair' | 'setup' | 'scoring' | 'end_of_over' | 'end_of_pair_set'
       | 'innings_break' | 'complete';
  toss_winner_id: string | null;
  toss_elected: 'bat' | 'bowl' | null;
}

export type SyncStatus = 'idle' | 'offline' | 'queued' | 'syncing' | 'error';

type Action =
  | { type: 'RECORD_TOSS'; winner_team_id: string; elected: 'bat' | 'bowl' }
  | { type: 'SET_BOWLER'; bowler_id: string }
  | { type: 'SELECT_PAIR'; player1_id: string; player2_id: string }
  | { type: 'NEXT_PAIR' }
  | {
      type: 'RECORD_DELIVERY';
      payload: {
        runs_off_bat: number;
        extra_type: ExtraType;
        extra_value: number;
        is_wicket: boolean;
        wicket_type?: WicketType;
        fielder_id?: string;
        manual_strike_flip: boolean;
      };
    }
  | { type: 'UNDO' }
  | { type: 'DELETE_DELIVERY'; delivery_id: string }
  | { type: 'MANUAL_SWAP_STRIKE' }
  | { type: 'START_INNINGS_2' }
  | { type: 'RESET' };

// ── UUID that works over HTTP (crypto.randomUUID requires HTTPS on mobile) ────
function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try { return crypto.randomUUID(); } catch {}
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ── Storage helpers ───────────────────────────────────────────────────────────

function storageKey(mId: string) { return `cricket_match_${mId}_v2`; }
function queueKey(mId: string) { return `cricket_offline_queue_${mId}`; }

function saveState(state: GameState) {
  try {
    localStorage.setItem(storageKey(state.matchId), JSON.stringify(state));
  } catch { /* ignore */ }
}

function loadState(mId: string): GameState | null {
  try {
    const raw = localStorage.getItem(storageKey(mId));
    return raw ? (JSON.parse(raw) as GameState) : null;
  } catch { return null; }
}

// ── Initial state ─────────────────────────────────────────────────────────────

function buildInitialState(mId: string): GameState {
  const rec = resolveRecord(mId);
  if (!rec) throw new Error(`Unknown match: ${mId}`);

  const { match, innings1_id, innings2_id } = rec;
  return {
    matchId: mId,
    match,
    teams: resolveTeams(mId),
    players: resolvePlayers(mId),
    activeInnings: 1,
    inn1: {
      innings: {
        id: innings1_id,
        match_id: mId,
        innings_number: 1,
        batting_team_id: match.home_team_id,
        bowling_team_id: match.away_team_id,
        status: 'not_started',
      },
      pairs: resolveEmptyPairs(match.home_team_id, mId),
      deliveries: [],
      final_score: null,
    },
    inn2: {
      innings: {
        id: innings2_id,
        match_id: mId,
        innings_number: 2,
        batting_team_id: match.away_team_id,
        bowling_team_id: match.home_team_id,
        status: 'not_started',
      },
      pairs: resolveEmptyPairs(match.away_team_id, mId),
      deliveries: [],
      final_score: null,
    },
    current_bowler_id: '',
    phase: 'toss',
    toss_winner_id: null,
    toss_elected: null,
  };
}

function initState(mId: string): GameState {
  return loadState(mId) ?? buildInitialState(mId);
}

// ── Reducer ───────────────────────────────────────────────────────────────────

function activeSlot(state: GameState): InningsSlot {
  return state.activeInnings === 1 ? state.inn1 : state.inn2;
}
function setSlot(state: GameState, slot: Partial<InningsSlot>): GameState {
  const key = state.activeInnings === 1 ? 'inn1' : 'inn2';
  return { ...state, [key]: { ...activeSlot(state), ...slot } };
}

function reducer(state: GameState, action: Action): GameState {
  const settings = state.match.settings;
  const slot = activeSlot(state);
  const derived = deriveMatchState(slot.deliveries, slot.pairs, settings);

  switch (action.type) {
    case 'RECORD_TOSS': {
      const { winner_team_id, elected } = action;
      // Determine batting order from toss result
      const batFirst = elected === 'bat' ? winner_team_id
        : winner_team_id === state.match.home_team_id ? state.match.away_team_id : state.match.home_team_id;
      const bowlFirst = batFirst === state.match.home_team_id ? state.match.away_team_id : state.match.home_team_id;
      return {
        ...state,
        toss_winner_id: winner_team_id,
        toss_elected: elected,
        inn1: {
          ...state.inn1,
          innings: { ...state.inn1.innings, batting_team_id: batFirst, bowling_team_id: bowlFirst },
          pairs: resolveEmptyPairs(batFirst, state.matchId),
        },
        inn2: {
          ...state.inn2,
          innings: { ...state.inn2.innings, batting_team_id: bowlFirst, bowling_team_id: batFirst },
          pairs: resolveEmptyPairs(bowlFirst, state.matchId),
        },
        phase: 'select_pair',
      };
    }

    case 'SELECT_PAIR': {
      const pairIdx = derived.pair_index;
      const newPairs = slot.pairs.map((p, i) =>
        i === pairIdx ? { ...p, player1_id: action.player1_id, player2_id: action.player2_id } : p
      );
      return { ...setSlot(state, { pairs: newPairs }), phase: 'setup' };
    }

    case 'NEXT_PAIR':
      return { ...state, phase: 'select_pair' };

    case 'SET_BOWLER': {
      const newSlot: InningsSlot = {
        ...slot,
        innings: { ...slot.innings, status: 'live' },
      };
      return { ...setSlot(state, newSlot), current_bowler_id: action.bowler_id, phase: 'scoring' };
    }

    case 'RECORD_DELIVERY': {
      if (state.phase !== 'scoring') return state;
      const { payload } = action;
      const { next_ball } = derived;

      const isReBowl = shouldReBowl(payload.extra_type, next_ball.is_last_ball_of_pair_set, settings);
      const legal_ball = !isReBowl;
      const isEndOfOver = legal_ball && next_ball.ball_in_over === settings.balls_per_over - 1;
      const isEndOfPairSet = legal_ball && next_ball.is_last_ball_of_pair_set;

      // Last ball of each pair's set must be legal: wide/no-ball → 1 run penalty, re-bowl
      const effectiveExtraValue = (isReBowl && (payload.extra_type === 'wide' || payload.extra_type === 'no_ball'))
        ? 1
        : payload.extra_value;

      // A re-bowl delivery didn't legally happen — any wicket on it is voided and
      // must be re-recorded on the legal re-bowl (prevents double-counting).
      const isWicket = isReBowl ? false : payload.is_wicket;

      const strike_changed = computeStrikeChanged(
        payload.runs_off_bat, isWicket, isEndOfOver, payload.manual_strike_flip
      );
      const net_run_effect = computeNetRunEffect(
        payload.runs_off_bat, effectiveExtraValue, isWicket, settings
      );

      const delivery: Delivery = {
        id: uuid(),
        innings_id: slot.innings.id,
        pair_id: derived.current_pair!.id,
        over_number: next_ball.over_number,
        ball_in_over: next_ball.ball_in_over,
        sequence_number: slot.deliveries.reduce((m, d) => Math.max(m, d.sequence_number), 0) + 1,
        is_deleted: false,
        striker_id: derived.striker_id,
        non_striker_id: derived.non_striker_id,
        bowler_id: state.current_bowler_id,
        runs_off_bat: payload.runs_off_bat,
        extra_type: payload.extra_type,
        extra_value: effectiveExtraValue,
        is_wicket: isWicket,
        wicket_type: isWicket ? payload.wicket_type : undefined,
        dismissed_player_id: isWicket && derived.striker_id ? derived.striker_id : undefined,
        fielder_id: isWicket ? payload.fielder_id : undefined,
        net_run_effect,
        legal_ball,
        strike_changed,
        created_at: new Date().toISOString(),
      };

      const newDeliveries = [...slot.deliveries, delivery];
      const updatedDerived = deriveMatchState(newDeliveries, slot.pairs, settings);

      let nextPhase: GameState['phase'] = 'scoring';
      let finalScore: number | null = slot.final_score;

      if (!isReBowl) {
        if (updatedDerived.is_complete) {
          finalScore = updatedDerived.total;
          // If this is innings 2 completing → match done
          nextPhase = state.activeInnings === 2 ? 'complete' : 'innings_break';
        } else if (isEndOfPairSet) {
          nextPhase = 'end_of_pair_set';
        } else if (isEndOfOver) {
          nextPhase = 'end_of_over';
        }
      }

      const newSlot: InningsSlot = {
        ...slot,
        deliveries: newDeliveries,
        innings: { ...slot.innings, status: nextPhase === 'complete' || nextPhase === 'innings_break' ? 'complete' : 'live' },
        final_score: finalScore,
      };
      return { ...setSlot(state, newSlot), phase: nextPhase };
    }

    case 'UNDO': {
      const lastIdx = [...slot.deliveries].reverse().findIndex(d => !d.is_deleted);
      if (lastIdx === -1) return state;
      const realIdx = slot.deliveries.length - 1 - lastIdx;
      const newDeliveries = slot.deliveries.map((d, i) =>
        i === realIdx ? { ...d, is_deleted: true } : d
      );
      const updatedDerived = deriveMatchState(newDeliveries, slot.pairs, settings);
      const newSlot: InningsSlot = {
        ...slot,
        deliveries: newDeliveries,
        innings: { ...slot.innings, status: 'live' },
        final_score: updatedDerived.is_complete ? updatedDerived.total : null,
      };
      return { ...setSlot(state, newSlot), phase: updatedDerived.is_complete ? 'innings_break' : 'scoring' };
    }

    case 'DELETE_DELIVERY': {
      const { delivery_id } = action;
      const inInn1 = state.inn1.deliveries.some(d => d.id === delivery_id);
      const inInn2 = state.inn2.deliveries.some(d => d.id === delivery_id);
      if (!inInn1 && !inInn2) return state;

      const applyDelete = (slot: InningsSlot): InningsSlot => {
        const newDels = slot.deliveries.map(d => d.id === delivery_id ? { ...d, is_deleted: true } : d);
        const nd = deriveMatchState(newDels, slot.pairs, settings);
        return { ...slot, deliveries: newDels, final_score: nd.is_complete ? nd.total : null, innings: { ...slot.innings, status: nd.is_complete ? 'complete' : 'live' } };
      };

      const newInn1 = inInn1 ? applyDelete(state.inn1) : state.inn1;
      const newInn2 = inInn2 ? applyDelete(state.inn2) : state.inn2;
      const d1 = deriveMatchState(newInn1.deliveries, newInn1.pairs, settings);
      const d2 = deriveMatchState(newInn2.deliveries, newInn2.pairs, settings);

      let nextPhase: GameState['phase'];
      let nextActiveInnings: 1 | 2;
      if (d1.is_complete && d2.is_complete) {
        nextPhase = 'complete'; nextActiveInnings = 2;
      } else if (d1.is_complete) {
        const hasInn2Balls = newInn2.deliveries.some(d => !d.is_deleted);
        nextPhase = hasInn2Balls ? 'scoring' : 'innings_break';
        nextActiveInnings = 2;
      } else {
        nextPhase = 'scoring'; nextActiveInnings = 1;
      }

      return { ...state, inn1: newInn1, inn2: newInn2, activeInnings: nextActiveInnings, phase: nextPhase };
    }

    case 'MANUAL_SWAP_STRIKE': {
      if (!derived.current_pair) return state;
      const swap: Delivery = {
        id: uuid(),
        innings_id: slot.innings.id,
        pair_id: derived.current_pair.id,
        over_number: derived.next_ball.over_number,
        ball_in_over: derived.next_ball.ball_in_over,
        sequence_number: slot.deliveries.reduce((m, d) => Math.max(m, d.sequence_number), 0) + 1,
        is_deleted: false,
        striker_id: derived.striker_id,
        non_striker_id: derived.non_striker_id,
        bowler_id: state.current_bowler_id,
        runs_off_bat: 0,
        extra_type: 'strike_override',
        extra_value: 0,
        is_wicket: false,
        net_run_effect: 0,
        legal_ball: false,
        strike_changed: true,
        created_at: new Date().toISOString(),
      };
      return setSlot(state, { deliveries: [...slot.deliveries, swap] });
    }

    case 'START_INNINGS_2': {
      if (state.activeInnings !== 1) return state;
      return {
        ...state,
        activeInnings: 2,
        current_bowler_id: '',
        phase: 'select_pair',
      };
    }

    case 'RESET':
      return buildInitialState(state.matchId);

    default:
      return state;
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

interface GameContextValue {
  state: GameState;
  derived: DerivedMatchState;
  dispatch: React.Dispatch<Action>;
  syncStatus: SyncStatus;
  queuedCount: number;
  getPlayer: (id: string) => Player | undefined;
  getTeam: (id: string) => Team | undefined;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ matchId: mId, children }: { matchId: string; children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, mId, initState);

  // ── Persist to localStorage + relay server ──────────────────────────────
  // Relay is only used in local mode; when Supabase is enabled it's the sync path.
  useEffect(() => {
    saveState(state);
    if (supabaseEnabled) return;
    fetch(`http://${window.location.hostname}:5180/state/${state.matchId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inn1: state.inn1, inn2: state.inn2, toss: { winner_id: state.toss_winner_id, elected: state.toss_elected } }),
    }).catch(() => {});
  }, [state]);

  // ── Keep relay up-to-date while result screen is showing ─────────────────
  // If the relay POST failed during the last over, retry every 4 seconds
  // so viewers on other devices always see the final scorecard.
  useEffect(() => {
    if (supabaseEnabled) return;
    if (state.phase !== 'complete') return;
    const push = () => fetch(`http://${window.location.hostname}:5180/state/${state.matchId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inn1: state.inn1, inn2: state.inn2, toss: { winner_id: state.toss_winner_id, elected: state.toss_elected } }),
    }).catch(() => {});
    push();
    const id = setInterval(push, 4000);
    return () => clearInterval(id);
  }, [state.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Online / offline tracking ────────────────────────────────────────────
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [offlineQueue, setOfflineQueue] = useState<Delivery[]>(() => {
    try { return JSON.parse(localStorage.getItem(queueKey(mId)) ?? '[]'); } catch { return []; }
  });
  const syncingRef = useRef(false);

  // Periodic tick so a flaky connection retries the queue even without an
  // online/offline event or a new ball being scored.
  const [flushTick, setFlushTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFlushTick(t => t + 1), 8000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const up = () => { setIsOnline(true); setFlushTick(t => t + 1); };
    const down = () => { setIsOnline(false); setSyncStatus('offline'); };
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

  // Add a ball to the retry queue (used both when offline and when an online push fails).
  const enqueue = (d: Delivery) => {
    setOfflineQueue(q => {
      if (q.some(x => x.id === d.id)) return q; // already queued
      const nq = [...q, d];
      localStorage.setItem(queueKey(mId), JSON.stringify(nq));
      return nq;
    });
    setSyncStatus('queued');
  };

  // ── Flush the queue: on reconnect, on new queued items, and every 8s ──────
  useEffect(() => {
    if (!supabaseEnabled || offlineQueue.length === 0 || syncingRef.current) return;
    syncingRef.current = true;
    setSyncStatus('syncing');
    (async () => {
      const remaining: Delivery[] = [];
      for (const d of offlineQueue) {
        const ok = await pushDelivery(d);   // idempotent + never throws
        if (!ok) remaining.push(d);
      }
      if (remaining.length === 0) {
        setOfflineQueue([]);
        localStorage.removeItem(queueKey(mId));
        setSyncStatus('idle');
      } else {
        setOfflineQueue(remaining);
        localStorage.setItem(queueKey(mId), JSON.stringify(remaining));
        setSyncStatus('error'); // will retry on next tick
      }
      syncingRef.current = false;
    })();
  }, [isOnline, offlineQueue, flushTick, mId]);

  // ── Intercept RECORD_DELIVERY and UNDO for Supabase sync ─────────────────
  const dispatchWithSync: React.Dispatch<Action> = (action) => {
    dispatch(action);

    if (!supabaseEnabled) return;

    if (action.type === 'RECORD_DELIVERY' || action.type === 'MANUAL_SWAP_STRIKE') {
      // The delivery will be created inside the reducer; we can't easily grab it
      // here synchronously. Instead we use an effect that watches deliveries.
    }
    if (action.type === 'UNDO') {
      // Handled by effect below
    }
    if (action.type === 'DELETE_DELIVERY' && supabaseEnabled && isOnline) {
      softDeleteDelivery(action.delivery_id);
    }
    if (action.type === 'RECORD_TOSS') {
      updateMatchToss(mId, action.winner_team_id, action.elected);
    }
  };

  // Watch deliveries and sync new ones that haven't been pushed yet.
  // We keep a ref to the last seen deliveries count to detect new ones.
  const slot = activeSlot(state);
  const prevDeliveriesRef = useRef<Delivery[]>(slot.deliveries);
  const prevInningsRef = useRef<1 | 2>(state.activeInnings);

  useEffect(() => {
    // On innings switch the active slot's array changes wholesale — don't diff
    // two different innings (would fire spurious duplicate pushes). Re-baseline.
    if (prevInningsRef.current !== state.activeInnings) {
      prevInningsRef.current = state.activeInnings;
      prevDeliveriesRef.current = slot.deliveries;
      return;
    }
    const prev = prevDeliveriesRef.current;
    const curr = slot.deliveries;

    // Newly added delivery (appended to end, not deleted)
    if (curr.length > prev.length) {
      const newDelivery = curr[curr.length - 1];
      if (!newDelivery.is_deleted && supabaseEnabled) {
        if (isOnline) {
          // Try immediately; if it fails (flaky WiFi despite onLine=true), queue it for retry.
          pushDelivery(newDelivery).then(ok => { if (!ok) enqueue(newDelivery); });
        } else {
          enqueue(newDelivery);
        }
      }
    }

    // Delivery soft-deleted (undo)
    if (curr.length === prev.length) {
      const changed = curr.find((d, i) => d.is_deleted && !prev[i]?.is_deleted);
      if (changed && supabaseEnabled) {
        if (isOnline) {
          softDeleteDelivery(changed.id);
        } else {
          // Remove from offline queue if it was there; add a delete marker
          const newQ = offlineQueue.filter(d => d.id !== changed.id);
          setOfflineQueue(newQ);
          localStorage.setItem(queueKey(mId), JSON.stringify(newQ));
        }
      }
    }

    prevDeliveriesRef.current = curr;
  }, [slot.deliveries]);

  const derived = deriveMatchState(slot.deliveries, slot.pairs, state.match.settings);
  const getPlayer = (id: string) => state.players.find(p => p.id === id);
  const getTeam = (id: string) => state.teams.find(t => t.id === id);

  return (
    <GameContext.Provider value={{
      state, derived, dispatch: dispatchWithSync,
      syncStatus, queuedCount: offlineQueue.length,
      getPlayer, getTeam,
    }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside GameProvider');
  return ctx;
}
