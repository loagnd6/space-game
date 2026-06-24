/** Game-balance constants. Never put magic numbers in game logic — reference these. */

export const MAX_FLEET_SIZE = 6;
export const BASE_DAMAGE_MULTIPLIER = 1.0;

/** Fixed simulation step for the deterministic battle loop (ms). */
export const BATTLE_TICK_MS = 50;

/** Starting resources for a new save. */
export const STARTING_RESOURCES = {
  credits: 500,
  fuel: 100,
  research: 0,
} as const;
