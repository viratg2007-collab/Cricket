import { createClient } from '@supabase/supabase-js';
import type { Delivery } from './types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// True only when real credentials are present (not the placeholder template values)
export const supabaseEnabled =
  !!url && !!key && !url.includes('your-project') && !key.includes('your-anon');

export const supabase = supabaseEnabled ? createClient(url!, key!) : null;

// Insert a delivery row. Returns true on success so the caller can queue+retry
// on failure (important: navigator.onLine can be true on flaky venue WiFi while
// the request still fails — without this the ball would silently never reach the cloud).
export async function pushDelivery(delivery: Delivery): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('deliveries').insert(delivery);
    if (error) {
      // Duplicate primary key = already synced → treat as success (idempotent retry).
      if (error.code === '23505') return true;
      console.error('[supabase] insert delivery failed:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[supabase] insert delivery threw:', e);
    return false;
  }
}

// Soft-delete a delivery (undo).
export async function softDeleteDelivery(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('deliveries')
    .update({ is_deleted: true })
    .eq('id', id);
  if (error) console.error('[supabase] soft-delete delivery failed:', error.message);
}

// ── Toss (stored on the matches table) ────────────────────────────────────────
// DB toss_decision is constrained to 'bat' | 'field'; app uses 'bat' | 'bowl'.

export async function updateMatchToss(
  matchId: string, tossWinnerId: string, elected: 'bat' | 'bowl'
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('matches')
    .update({ toss_winner_id: tossWinnerId, toss_decision: elected === 'bat' ? 'bat' : 'field' })
    .eq('id', matchId);
  if (error) console.error('[supabase] toss update failed:', error.message);
}

export async function fetchMatchToss(
  matchId: string
): Promise<{ winner_id: string | null; elected: 'bat' | 'bowl' | null } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('matches')
    .select('toss_winner_id, toss_decision')
    .eq('id', matchId)
    .maybeSingle();
  if (error || !data || !data.toss_winner_id) return null;
  return { winner_id: data.toss_winner_id, elected: data.toss_decision === 'field' ? 'bowl' : 'bat' };
}

// ── Manual bracket override (admin fallback for Round 2 groups) ────────────────
export interface BracketOverride { aRank: string[]; bRank: string[]; }

export async function fetchBracketOverride(): Promise<BracketOverride | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('tournament_config').select('data').eq('id', 'bracket_override').maybeSingle();
    if (error) return null; // table may not exist yet → fall back to auto
    return (data?.data as BracketOverride) ?? null;
  } catch { return null; }
}

export async function saveBracketOverride(o: BracketOverride | null): Promise<void> {
  if (!supabase) return;
  try {
    if (o === null) {
      await supabase.from('tournament_config').delete().eq('id', 'bracket_override');
    } else {
      await supabase.from('tournament_config').upsert({ id: 'bracket_override', data: o, updated_at: new Date().toISOString() });
    }
  } catch (e) { console.error('[supabase] save bracket override failed:', e); }
}

// Clear a match's toss (used on reset).
export async function clearMatchToss(matchId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('matches')
    .update({ toss_winner_id: null, toss_decision: null })
    .eq('id', matchId);
  if (error) console.error('[supabase] clear toss failed:', error.message);
}

// Soft-delete every delivery for the given innings (used when a scorer resets a match).
export async function softDeleteInnings(inningsIds: string[]): Promise<void> {
  if (!supabase || inningsIds.length === 0) return;
  const { error } = await supabase
    .from('deliveries')
    .update({ is_deleted: true })
    .in('innings_id', inningsIds);
  if (error) console.error('[supabase] reset (soft-delete innings) failed:', error.message);
  // Also clear the toss for this match's row if present — handled by caller if needed.
}

// Fetch every non-deleted delivery across all matches (for tournament-wide views).
// Paginates because PostgREST caps a single response at 1000 rows — a full
// tournament has far more deliveries than that.
export async function fetchAllDeliveries(): Promise<Delivery[]> {
  if (!supabase) return [];
  const page = 1000;
  const out: Delivery[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from('deliveries')
      .select('*')
      .eq('is_deleted', false)
      .order('created_at')
      .range(from, from + page - 1);
    if (error) { console.error('[supabase] fetchAllDeliveries failed:', error.message); return out; }
    const batch = (data ?? []) as Delivery[];
    out.push(...batch);
    if (batch.length < page) break;
  }
  return out;
}

// Fetch all non-deleted deliveries for an innings.
export async function fetchDeliveries(inningsId: string): Promise<Delivery[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('deliveries')
    .select('*')
    .eq('innings_id', inningsId)
    .eq('is_deleted', false)
    .order('sequence_number');
  if (error) {
    console.error('[supabase] fetchDeliveries failed:', error.message);
    return [];
  }
  return (data ?? []) as Delivery[];
}
