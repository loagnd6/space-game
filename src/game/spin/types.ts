import type { ItemType } from '@/src/types/inventory';

export type LootTier = 'common' | 'uncommon' | 'rare' | 'legendary' | 'ultra_rare';
export type SpinType = 'free' | 'ticket' | 'premium';

export interface LootItem {
  itemType: ItemType;
  itemData: Record<string, unknown>;
}

export interface SpinResult {
  tier: LootTier;
  itemType: ItemType;
  itemData: Record<string, unknown>;
  /** Pity counter value AFTER this spin. */
  pityCount: number;
}

export interface SpinState {
  playerId: string;
  freeSpinAvailableAt: string; // ISO 8601
  premiumSpinUsedDate: string | null; // YYYY-MM-DD
  pityCounter: number;
}
