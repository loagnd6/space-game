import { FRAGMENT_COMBINE_COUNT } from '@/src/constants/game';
import type { ShipComponent, ComponentTier } from '@/src/game/ships/types';

export function shouldPromptCombine(fragmentCount: number): boolean {
  return fragmentCount >= FRAGMENT_COMBINE_COUNT;
}

const TIER_ORDER: ComponentTier[] = ['ultra_rare', 'legendary', 'rare', 'uncommon', 'common'];

export function sortByTier(components: ShipComponent[]): ShipComponent[] {
  return [...components].sort(
    (a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier),
  );
}
