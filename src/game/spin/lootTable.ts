import { SeededRNG } from '../rng';
import { SPIN_LOOT_WEIGHTS, PITY_THRESHOLD } from '@/src/constants/game';
import type { LootTier, LootItem } from './types';
import type { ComponentSlot } from '../ships/types';

const SLOTS: ComponentSlot[] = ['hull', 'weapons', 'shields', 'engine'];

export function rollTier(rng: SeededRNG, pityCounter: number): LootTier {
  if (pityCounter >= PITY_THRESHOLD) {
    // Guaranteed Legendary or Ultra-Rare — roll between the two
    const total = SPIN_LOOT_WEIGHTS.ultra_rare + SPIN_LOOT_WEIGHTS.legendary;
    return rng.next() < SPIN_LOOT_WEIGHTS.ultra_rare / total ? 'ultra_rare' : 'legendary';
  }

  const roll = rng.next();
  let cumulative = 0;
  if (roll < (cumulative += SPIN_LOOT_WEIGHTS.ultra_rare)) return 'ultra_rare';
  if (roll < (cumulative += SPIN_LOOT_WEIGHTS.legendary)) return 'legendary';
  if (roll < (cumulative += SPIN_LOOT_WEIGHTS.rare))      return 'rare';
  if (roll < (cumulative += SPIN_LOOT_WEIGHTS.uncommon))  return 'uncommon';
  return 'common';
}

export function rollItemForTier(rng: SeededRNG, tier: LootTier): LootItem {
  switch (tier) {
    case 'common':    return rollCommon(rng);
    case 'uncommon':  return rollUncommon(rng);
    case 'rare':      return rollRare(rng);
    case 'legendary': return rollLegendary(rng);
    case 'ultra_rare': return rollUltraRare(rng);
  }
}

function pickSlot(rng: SeededRNG): ComponentSlot {
  return SLOTS[rng.int(0, SLOTS.length - 1)];
}

function rollCommon(rng: SeededRNG): LootItem {
  // Equal chance of each resource type
  const resources = ['ore', 'crystal', 'gas', 'water'] as const;
  const resource = resources[rng.int(0, 3)];
  const amounts: Record<string, number> = { ore: 500, crystal: 200, gas: 150, water: 100 };
  return {
    itemType: 'resource_bundle',
    itemData: { resourceType: resource, amount: amounts[resource] },
  };
}

function rollUncommon(rng: SeededRNG): LootItem {
  const roll = rng.next();
  if (roll < 0.5) {
    return { itemType: 'boost_token', itemData: { quantity: 1 } };
  }
  if (roll < 0.8) {
    // Resource bundle, larger amounts
    const resources = ['ore', 'crystal', 'gas', 'water'] as const;
    return {
      itemType: 'resource_bundle',
      itemData: { resourceType: resources[rng.int(0, 3)], amount: 1000 },
    };
  }
  return {
    itemType: 'component_fragment',
    itemData: { slot: pickSlot(rng) },
  };
}

function rollRare(rng: SeededRNG): LootItem {
  const roll = rng.next();
  if (roll < 0.4) {
    return { itemType: 'ship_component', itemData: { tier: 'rare', slot: pickSlot(rng) } };
  }
  if (roll < 0.7) {
    return { itemType: 'blueprint', itemData: { buildingTier: 'advanced' } };
  }
  return { itemType: 'boost_token', itemData: { quantity: 3 } };
}

function rollLegendary(rng: SeededRNG): LootItem {
  const roll = rng.next();
  if (roll < 0.6) {
    return { itemType: 'ship_component', itemData: { tier: 'legendary', slot: pickSlot(rng) } };
  }
  return { itemType: 'cosmetic_skin', itemData: { skinId: `spin_legendary_${rng.int(1, 10)}` } };
}

function rollUltraRare(rng: SeededRNG): LootItem {
  const slot = pickSlot(rng);
  const abilityMap: Record<ComponentSlot, string> = {
    hull:    'iron_tomb',
    weapons: 'phase_cannon',
    engine:  'overdrive',
    shields: 'echo_shell',
  };
  return {
    itemType: 'ship_component',
    itemData: { tier: 'ultra_rare', slot, ability: abilityMap[slot] },
  };
}
