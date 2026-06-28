import { SeededRNG } from '../rng';
import { rollTier, rollItemForTier } from './lootTable';
import type { SpinResult, LootTier } from './types';

const LEGENDARY_TIERS: LootTier[] = ['legendary', 'ultra_rare'];

/**
 * Pure function — resolves a spin without touching Supabase.
 * The Edge Function calls this and handles persistence.
 */
export function resolveSpinResult(
  seed: number,
  pityCounter: number,
): SpinResult {
  const rng = new SeededRNG(seed);
  const tier = rollTier(rng, pityCounter);
  const { itemType, itemData } = rollItemForTier(rng, tier);

  const newPityCount = LEGENDARY_TIERS.includes(tier) ? 0 : pityCounter + 1;

  return { tier, itemType, itemData, pityCount: newPityCount };
}
