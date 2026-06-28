import { FRAGMENT_COMBINE_COUNT, COMPONENT_STAT_MULTIPLIERS } from '@/src/constants/game';
import type { ComponentSlot, ShipComponent } from './types';

export interface CombineResult {
  component: ShipComponent;
  fragmentsRemaining: number;
}

export function canCombine(fragmentCount: number): boolean {
  return fragmentCount >= FRAGMENT_COMBINE_COUNT;
}

export function combineFragments(slot: ComponentSlot, fragmentCount: number): CombineResult {
  if (!canCombine(fragmentCount)) {
    throw new Error(`Not enough fragments: need ${FRAGMENT_COMBINE_COUNT}, have ${fragmentCount}`);
  }
  const component: ShipComponent = {
    id: crypto.randomUUID(),
    slot,
    tier: 'uncommon',
    statMultiplier: COMPONENT_STAT_MULTIPLIERS['uncommon'],
  };
  return {
    component,
    fragmentsRemaining: fragmentCount - FRAGMENT_COMBINE_COUNT,
  };
}
