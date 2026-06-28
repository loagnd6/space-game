import type { LootTier } from '@/src/game/spin/types';

export interface TierStyle {
  border: string;
  glow: string;
  label: string;
  flashy: boolean;
}

export const TIER_STYLES: Record<LootTier, TierStyle> = {
  common:     { border: '#9E9E9E', glow: '#9E9E9E40', label: 'Common',     flashy: false },
  uncommon:   { border: '#4CAF50', glow: '#4CAF5040', label: 'Uncommon',   flashy: false },
  rare:       { border: '#2196F3', glow: '#2196F340', label: 'Rare',       flashy: false },
  legendary:  { border: '#FF9800', glow: '#FF980060', label: 'Legendary',  flashy: true  },
  ultra_rare: { border: '#9C27B0', glow: '#9C27B060', label: 'Ultra Rare', flashy: true  },
};
