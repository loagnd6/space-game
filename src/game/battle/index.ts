/**
 * Battle system — deterministic combat loop.
 * All math must use SeededRNG, never Math.random() (see CLAUDE.md Critical Rules).
 * See skills/battle-systems.md.
 */
import type { Fleet } from '@/src/types';

export interface BattleState {
  tick: number;
  attacker: Fleet;
  defender: Fleet;
  done: boolean;
}

/** TODO: advance the battle by one fixed step. Must be deterministic + reversible. */
export function updateBattle(state: BattleState): BattleState {
  return { ...state, tick: state.tick + 1 };
}
