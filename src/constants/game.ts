/** Game-balance constants. Never put magic numbers in game logic — reference these. */

import type { ComponentTier } from '@/src/game/ships/types';

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

// --- Spin System ---
export const SPIN_LOOT_WEIGHTS = {
  common:     0.600,
  uncommon:   0.250,
  rare:       0.120,
  legendary:  0.025,
  ultra_rare: 0.005,
} as const;

export const PITY_THRESHOLD = 50;
// TEMP for testing — real design value is 4 (hours). Revert before release.
export const FREE_SPIN_INTERVAL_HOURS = 10 / 3600;
export const PREMIUM_SPIN_DAILY_CAP = 1;
export const FRAGMENT_COMBINE_COUNT = 3; // 3 fragments → 1 Uncommon component
export const SPIN_TICKET_RAID_DROP_CHANCE = 0.10; // 10% on raid win

// --- Ship Components ---
export const COMPONENT_STAT_MULTIPLIERS: Record<ComponentTier, number> = {
  common:     1.0,
  uncommon:   1.3,
  rare:       1.7,
  legendary:  2.2,
  ultra_rare: 2.5,
};

export const ULTRA_RARE_ABILITIES = {
  PHASE_CANNON_BYPASS_CHANCE:   0.20,  // 20% to bypass shields
  ECHO_SHELL_REFLECT_PERCENT:   0.15,  // 15% damage reflected
  ECHO_SHELL_MAX_CHARGES:       2,     // max 2 reflects per battle
  OVERDRIVE_HP_COST_PERCENT:    0.10,  // 10% own HP sacrificed
  OVERDRIVE_BURST_MULTIPLIER:   1.5,   // burst = 1.5× weapon damage
} as const;

// --- Marketplace / Economy ---
export const MARKETPLACE = {
  LISTING_FEE_PERCENT:  0.05, // 5% taken from seller on sale
  MAX_ACTIVE_LISTINGS:  5,
  LISTING_DURATION_DAYS: 7,
} as const;

export const LUMEN_REWARDS = {
  RAID_WIN_MIN:          50,
  RAID_WIN_MAX:         200,
  MISSION_MIN:           25,
  MISSION_MAX:          100,
  SEASONAL_BONUS_MIN:   500,
  SEASONAL_BONUS_MAX:  2000,
} as const;

// --- Exploration ---
export const EXPLORATION = {
  MAP_SIZE:              2000,
  SYSTEM_COUNT:          20,
  MIN_SYSTEM_SPACING:    150,
  TRAVEL_LANE_MAX_DIST:  400,
  FUEL_COST_DIVISOR:     100,
  TRAVEL_TIME_SCALE:     300,      // ms per pt of distance
  TRAVEL_TIME_MIN_MS:    90_000,        // 1.5 minutes
  TRAVEL_TIME_MAX_MS:    30 * 60_000,   // 30 minutes
  FRAGMENT_BASE_CHANCE:  0.08,
  FRAGMENT_DANGER_BONUS: 0.02,
} as const;

// --- Battle Arena / Progression ---
export const BATTLE = {
  PLAYER_LEVEL_CAP:         30,
  XP_CURVE_BASE:            100,   // xpToNext(level) = round(BASE * level^EXP)
  XP_CURVE_EXP:             1.5,
  CONSOLATION_RATE:         0.15,  // non-first-win-of-day reward fraction (ceil)
  SKIRMISH_XP_PER_TIER:     50,
  SKIRMISH_LUMENS_PER_TIER: 25,
  SKIRMISH_SALVAGE_PER_TIER: 10,
  PVP_REWARD_MULTIPLIER:    1.5,   // × highest-unlocked-tier full reward
  PVP_DAILY_WIN_CAP:        5,     // paid wins per UTC day, then consolation
  PVP_CHALLENGE_RANGE:      5,     // may challenge the N ranks directly above
} as const;

export const SHIP_LEVELING = {
  LEVEL_CAP:             20,
  STAT_BONUS_PER_LEVEL:  0.02,  // +2% HP/damage/shields per level above 1
  LUMENS_BASE_COST:      200,   // cost(level n → n+1) = round(BASE * GROWTH^(n-1))
  LUMENS_COST_GROWTH:    1.5,
  SALVAGE_COST_PER_LEVEL: 10,   // salvage cost = 10 × current level
} as const;
