import { SeededRNG } from '../rng';
import { resolveBattle } from '../ships/CombatEngine';
import type { PlayerShip } from '../ships/types';

export type { BattleResult, BattleEvent } from '../ships/types';

/** Resolve a battle between two ships deterministically. */
export function startBattle(
  attacker: PlayerShip,
  defender: PlayerShip,
  seed: number,
) {
  const rng = new SeededRNG(seed);
  return resolveBattle(attacker, defender, rng);
}
