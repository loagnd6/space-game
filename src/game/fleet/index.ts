/**
 * Fleet system — ship roster, loadouts, repairs.
 * See MAX_FLEET_SIZE in src/constants/game.ts.
 */
import type { Fleet } from '@/src/types';

/** TODO: fleet management actions. */
export function createEmptyFleet(id: string): Fleet {
  return { id, ships: [] };
}
