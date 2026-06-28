import { COMPONENT_STAT_MULTIPLIERS } from '@/src/constants/game';
import type { ComponentSlot, ShipComponent } from '@/src/game/ships/types';
import { SLOT_ORDER } from './constants';

export const MAX_POWER_SCORE = 4 * COMPONENT_STAT_MULTIPLIERS.ultra_rare; // 10.0

export function calcPowerScore(equipped: Record<ComponentSlot, ShipComponent | null>): number {
  return SLOT_ORDER.reduce((sum, slot) => sum + (equipped[slot]?.statMultiplier ?? 0), 0);
}
