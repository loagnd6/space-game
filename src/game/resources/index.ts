/**
 * Resource system — credits, fuel, research economy.
 * See STARTING_RESOURCES in src/constants/game.ts.
 */
import { STARTING_RESOURCES } from '@/src/constants/game';
import type { Resources } from '@/src/types';

export function newResources(): Resources {
  return { ...STARTING_RESOURCES };
}
