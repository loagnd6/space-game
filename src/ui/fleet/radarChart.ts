import { COMPONENT_STAT_MULTIPLIERS } from '@/src/constants/game';

const MAX_MULTIPLIER = COMPONENT_STAT_MULTIPLIERS.ultra_rare; // 2.5

export function normalizeAxis(statMultiplier: number): number {
  return statMultiplier / MAX_MULTIPLIER;
}
