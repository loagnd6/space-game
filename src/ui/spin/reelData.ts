import type { LootTier, SpinResult } from '@/src/game/spin/types';
import { REEL_TOTAL, WINNER_INDEX } from './constants';

export interface ReelItem {
  id: string;
  tier: LootTier;
  label: string;
  sublabel: string;
  icon: string;
}

// Representative display items per tier shown during the reel scroll.
// These are cosmetic only — the real result comes from the server.
const TIER_POOL: Record<LootTier, Omit<ReelItem, 'id' | 'tier'>[]> = {
  common: [
    { label: '500 Ore',     sublabel: 'Resource', icon: '⛏️' },
    { label: '200 Crystal', sublabel: 'Resource', icon: '💎' },
    { label: '150 Gas',     sublabel: 'Resource', icon: '⛽' },
    { label: '100 Water',   sublabel: 'Resource', icon: '💧' },
  ],
  uncommon: [
    { label: 'Boost Token', sublabel: '×1 use',   icon: '⚡' },
    { label: '1,000 Ore',   sublabel: 'Resource', icon: '⛏️' },
    { label: 'Hull Shard',  sublabel: 'Fragment', icon: '🔩' },
  ],
  rare: [
    { label: 'Rare Hull',   sublabel: 'Component', icon: '🛡️' },
    { label: 'Blueprint',   sublabel: 'Advanced',  icon: '📐' },
    { label: 'Boost ×3',   sublabel: 'Token',     icon: '⚡' },
  ],
  legendary: [
    { label: 'Legendary Hull',    sublabel: 'Component', icon: '🌟' },
    { label: 'Legendary Weapons', sublabel: 'Component', icon: '🌟' },
    { label: 'Cosmetic Skin',     sublabel: 'Exclusive', icon: '✨' },
  ],
  ultra_rare: [
    { label: 'Phase Cannon', sublabel: 'Ultra Rare', icon: '🔮' },
    { label: 'Echo Shell',   sublabel: 'Ultra Rare', icon: '🔮' },
    { label: 'Overdrive',    sublabel: 'Ultra Rare', icon: '🔮' },
    { label: 'Iron Tomb',    sublabel: 'Ultra Rare', icon: '🔮' },
  ],
};

const VISUAL_WEIGHTS: { tier: LootTier; weight: number }[] = [
  { tier: 'common',     weight: 0.600 },
  { tier: 'uncommon',   weight: 0.250 },
  { tier: 'rare',       weight: 0.120 },
  { tier: 'legendary',  weight: 0.025 },
  { tier: 'ultra_rare', weight: 0.005 },
];

// Linear congruential generator — cosmetic use only, not for game logic
function makeLCG(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(1664525, s) + 1013904223 >>> 0;
    return s / 0xffffffff;
  };
}

function pickTier(rand: number): LootTier {
  let cumulative = 0;
  for (const { tier, weight } of VISUAL_WEIGHTS) {
    cumulative += weight;
    if (rand < cumulative) return tier;
  }
  return 'common';
}

const TIER_LABEL: Record<LootTier, string> = {
  common: 'Common', uncommon: 'Uncommon', rare: 'Rare',
  legendary: 'Legendary', ultra_rare: 'Ultra Rare',
};

export function spinResultToReelItem(result: SpinResult): ReelItem {
  const { itemType, itemData, tier } = result;
  let label: string;
  let sublabel: string;
  let icon: string;

  switch (itemType) {
    case 'resource_bundle':
      label = `${itemData.amount} ${capitalize(String(itemData.resourceType ?? ''))}`;
      sublabel = 'Resource';
      icon = '⛏️';
      break;
    case 'boost_token':
      label = `Boost ×${itemData.quantity}`;
      sublabel = 'Token';
      icon = '⚡';
      break;
    case 'blueprint':
      label = 'Blueprint';
      sublabel = capitalize(String(itemData.buildingTier ?? ''));
      icon = '📐';
      break;
    case 'ship_component':
      label = `${TIER_LABEL[tier]} ${capitalize(String(itemData.slot ?? ''))}`;
      sublabel = 'Component';
      icon = tier === 'ultra_rare' ? '🔮' : '🌟';
      break;
    case 'component_fragment':
      label = `${capitalize(String(itemData.slot ?? ''))} Shard`;
      sublabel = 'Fragment';
      icon = '🔩';
      break;
    case 'cosmetic_skin':
      label = 'Cosmetic Skin';
      sublabel = 'Exclusive';
      icon = '✨';
      break;
    default:
      label = 'Unknown';
      sublabel = '';
      icon = '❓';
  }

  return { id: 'winner', tier, label, sublabel, icon };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function buildReelData(result: SpinResult): ReelItem[] {
  const rand = makeLCG(Date.now());
  const items: ReelItem[] = [];

  for (let i = 0; i < REEL_TOTAL; i++) {
    if (i === WINNER_INDEX) {
      items.push(spinResultToReelItem(result));
      continue;
    }
    const tier = pickTier(rand());
    const pool = TIER_POOL[tier];
    const template = pool[Math.floor(rand() * pool.length)];
    items.push({ ...template, tier, id: `filler-${i}` });
  }

  return items;
}
