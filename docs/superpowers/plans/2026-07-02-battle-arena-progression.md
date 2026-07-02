# Battle Arena, Progression & Combat Economy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Battle Arena (AI Skirmish ladder + PvP ladder + Planetary Defense fights), Player Level/XP, Ship Leveling with the new Salvage resource, Wormhole item, and the app-wide visual pass (SpaceBackground, spin landing overhaul, per-screen polish).

**Architecture:** Pure battle/progression logic in `src/game/battle/` (client) mirrored in `supabase/functions/_shared/battle.ts` (server-authoritative resolution — client only animates returned `BattleEvent[]` logs). New `useBattleStore` calls three new Edge Functions. Replay UI is a full-screen modal route driven by a precomputed beat timeline.

**Tech Stack:** Expo SDK 56, TypeScript strict, Zustand 5, Reanimated 4, @shopify/react-native-skia 2, expo-linear-gradient, expo-haptics, Supabase (Postgres + Deno Edge Functions), Jest.

**Specs (read the relevant section before each task):**
- Design: `docs/superpowers/specs/2026-07-02-battle-arena-progression-design.md`
- Visual: `docs/superpowers/specs/2026-07-02-battle-arena-visual-spec.md` (Part A = battle screens, Part B = app-wide/spin)

## Global Constraints

- TypeScript strict mode; **no new npm dependencies**.
- **No `Math.random()` in anything reward- or battle-affecting** — `SeededRNG` only. Presentation-only randomness in UI files is allowed and must be commented as such.
- `src/game/` stays pure: no JSX, no Supabase imports.
- Edge Functions own ALL reward mutations (XP, Lumens, Salvage, fragments, rank). Client never writes these tables directly.
- Balance numbers live in `src/constants/game.ts` — never inline magic numbers in game logic.
- Glow rule (Android): never `shadowColor`/`elevation` for glows — translucent border rings or Skia effects only.
- Existing tests must stay green. Baseline: 85/86 passing (`marketStyles.test.ts` has a known DST flake — re-run in isolation before assuming regression).
- Commands: `npm test` (Jest), `npm run lint`, `npx tsc --noEmit`. Run all three before every commit.
- Supabase CLI is authenticated and linked. Deploy functions with `supabase functions deploy <name>`; push migrations with `supabase db push`.
- Naming: stores `useXStore`, constants `SCREAMING_SNAKE`, game-loop functions verb-first, PascalCase entity types.

---

## Phase 1 — Pure game logic (client)

### Task 1: Battle/leveling constants, wormhole item type, travel-time retuning

**Files:**
- Modify: `src/constants/game.ts`
- Modify: `src/types/inventory.ts`
- Modify: `src/game/exploration/mission.test.ts` (clamp assertions only)

**Interfaces:**
- Produces: `BATTLE`, `SHIP_LEVELING` const objects in `@/src/constants/game`; `'wormhole'` member of `ItemType`; `EXPLORATION.TRAVEL_TIME_MIN_MS = 90_000`, `EXPLORATION.TRAVEL_TIME_MAX_MS = 1_800_000`.

- [ ] **Step 1: Add constants to `src/constants/game.ts`** — append after the `EXPLORATION` block:

```ts
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
```

- [ ] **Step 2: Widen the travel clamp in the same file** — in `EXPLORATION`, change:

```ts
  TRAVEL_TIME_MIN_MS:    90_000,        // was 5 * 60_000
  TRAVEL_TIME_MAX_MS:    30 * 60_000,   // was 20 * 60_000
```

- [ ] **Step 3: Add `'wormhole'` to the `ItemType` union** in `src/types/inventory.ts` (read the file; append `| 'wormhole'` to the union — a consumable that makes an in-transit fleet arrive instantly).

- [ ] **Step 4: Run tests to find broken clamp assertions**

Run: `npm test -- src/game/exploration/mission.test.ts`
Expected: FAIL on any test asserting the old 5-min floor / 20-min ceiling.

- [ ] **Step 5: Update those assertions** to the new constants — always reference `EXPLORATION.TRAVEL_TIME_MIN_MS` / `EXPLORATION.TRAVEL_TIME_MAX_MS` rather than literals, e.g.:

```ts
expect(calculateTravelTime(a, b)).toBeGreaterThanOrEqual(EXPLORATION.TRAVEL_TIME_MIN_MS);
expect(calculateTravelTime(a, farAway)).toBe(EXPLORATION.TRAVEL_TIME_MAX_MS);
```

- [ ] **Step 6: Verify green + full suite**

Run: `npm test -- src/game/exploration/mission.test.ts` then `npx tsc --noEmit`
Expected: PASS / no errors.

- [ ] **Step 7: Commit**

```bash
git add src/constants/game.ts src/types/inventory.ts src/game/exploration/mission.test.ts
git commit -m "feat: add battle/ship-leveling constants, wormhole item type, wider travel clamp"
```

---

### Task 2: XP curve + ship-leveling math

**Files:**
- Create: `src/game/battle/xp.ts`, `src/game/battle/leveling.ts`
- Test: `src/game/battle/xp.test.ts`, `src/game/battle/leveling.test.ts`

**Interfaces:**
- Consumes: `BATTLE`, `SHIP_LEVELING` from Task 1.
- Produces:
  - `xpToNext(level: number): number`
  - `levelFromXp(totalXp: number): { level: number; intoLevel: number; toNext: number }` (`toNext === 0` at cap)
  - `shipLevelMultiplier(level: number): number` (clamped 1..cap; `1 + (level-1) * 0.02`)
  - `shipLevelCost(currentLevel: number): { lumens: number; salvage: number } | null` (null at cap)

- [ ] **Step 1: Write failing tests**

`src/game/battle/xp.test.ts`:
```ts
import { xpToNext, levelFromXp } from './xp';
import { BATTLE } from '@/src/constants/game';

describe('xpToNext', () => {
  it('follows round(100 * level^1.5)', () => {
    expect(xpToNext(1)).toBe(100);
    expect(xpToNext(4)).toBe(800);
    expect(xpToNext(9)).toBe(2700);
  });
});

describe('levelFromXp', () => {
  it('starts at level 1 with 0 xp', () => {
    expect(levelFromXp(0)).toEqual({ level: 1, intoLevel: 0, toNext: 100 });
  });
  it('levels up exactly at the threshold', () => {
    expect(levelFromXp(100).level).toBe(2);
    expect(levelFromXp(99).level).toBe(1);
  });
  it('tracks partial progress', () => {
    const p = levelFromXp(150); // 100 spent on L1→2, 50 into level 2
    expect(p).toEqual({ level: 2, intoLevel: 50, toNext: xpToNext(2) });
  });
  it('caps at PLAYER_LEVEL_CAP with toNext 0', () => {
    const p = levelFromXp(10_000_000);
    expect(p.level).toBe(BATTLE.PLAYER_LEVEL_CAP);
    expect(p.toNext).toBe(0);
    expect(p.intoLevel).toBe(0);
  });
  it('clamps negative xp to level 1', () => {
    expect(levelFromXp(-50).level).toBe(1);
  });
});
```

`src/game/battle/leveling.test.ts`:
```ts
import { shipLevelMultiplier, shipLevelCost } from './leveling';
import { SHIP_LEVELING } from '@/src/constants/game';

describe('shipLevelMultiplier', () => {
  it('is 1.0 at level 1 and +2% per level after', () => {
    expect(shipLevelMultiplier(1)).toBe(1.0);
    expect(shipLevelMultiplier(2)).toBeCloseTo(1.02);
    expect(shipLevelMultiplier(20)).toBeCloseTo(1.38);
  });
  it('clamps out-of-range levels', () => {
    expect(shipLevelMultiplier(0)).toBe(1.0);
    expect(shipLevelMultiplier(99)).toBeCloseTo(1.38);
  });
});

describe('shipLevelCost', () => {
  it('costs 200 lumens + 10 salvage for level 1 → 2', () => {
    expect(shipLevelCost(1)).toEqual({ lumens: 200, salvage: 10 });
  });
  it('grows lumens 1.5× per level, salvage 10 × level', () => {
    expect(shipLevelCost(2)).toEqual({ lumens: 300, salvage: 20 });
    expect(shipLevelCost(5)).toEqual({ lumens: Math.round(200 * 1.5 ** 4), salvage: 50 });
  });
  it('returns null at the cap', () => {
    expect(shipLevelCost(SHIP_LEVELING.LEVEL_CAP)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/game/battle/xp.test.ts src/game/battle/leveling.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/game/battle/xp.ts`:
```ts
import { BATTLE } from '@/src/constants/game';

/** XP needed to advance FROM `level` to `level + 1`. */
export function xpToNext(level: number): number {
  return Math.round(BATTLE.XP_CURVE_BASE * Math.pow(level, BATTLE.XP_CURVE_EXP));
}

export interface LevelProgress {
  level: number;
  intoLevel: number; // xp accumulated toward the next level
  toNext: number;    // xp required for the next level; 0 at cap
}

/** Derive level + progress from lifetime XP. XP past the cap is discarded. */
export function levelFromXp(totalXp: number): LevelProgress {
  let level = 1;
  let rem = Math.max(0, totalXp);
  while (level < BATTLE.PLAYER_LEVEL_CAP && rem >= xpToNext(level)) {
    rem -= xpToNext(level);
    level++;
  }
  if (level >= BATTLE.PLAYER_LEVEL_CAP) return { level, intoLevel: 0, toNext: 0 };
  return { level, intoLevel: rem, toNext: xpToNext(level) };
}
```

`src/game/battle/leveling.ts`:
```ts
import { SHIP_LEVELING } from '@/src/constants/game';

/** Flat stat multiplier applied to HP/damage/shields for a ship level. */
export function shipLevelMultiplier(level: number): number {
  const l = Math.min(Math.max(1, level), SHIP_LEVELING.LEVEL_CAP);
  return 1 + (l - 1) * SHIP_LEVELING.STAT_BONUS_PER_LEVEL;
}

export interface UpgradeCost {
  lumens: number;
  salvage: number;
}

/** Cost to upgrade FROM currentLevel to currentLevel + 1. Null at the cap. */
export function shipLevelCost(currentLevel: number): UpgradeCost | null {
  if (currentLevel >= SHIP_LEVELING.LEVEL_CAP) return null;
  return {
    lumens: Math.round(
      SHIP_LEVELING.LUMENS_BASE_COST *
        Math.pow(SHIP_LEVELING.LUMENS_COST_GROWTH, currentLevel - 1),
    ),
    salvage: SHIP_LEVELING.SALVAGE_COST_PER_LEVEL * currentLevel,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/game/battle/xp.test.ts src/game/battle/leveling.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/battle/xp.ts src/game/battle/xp.test.ts src/game/battle/leveling.ts src/game/battle/leveling.test.ts
git commit -m "feat: player XP curve and ship-leveling cost/bonus math"
```

---

### Task 3: CombatEngine ship-level support

**Files:**
- Modify: `src/game/ships/CombatEngine.ts`
- Modify: `src/game/battle/index.ts`
- Test: extend `src/game/ships/CombatEngine.test.ts` (append new describe block; do not modify existing tests)

**Interfaces:**
- Consumes: `shipLevelMultiplier` from Task 2.
- Produces (signature changes are backward compatible — all new params default to 1):
  - `buildCombatant(ship: PlayerShip, shipLevel = 1): Combatant`
  - `resolveBattle(attackerShip: PlayerShip, defenderShip: PlayerShip, rng: SeededRNG, attackerShipLevel = 1, defenderShipLevel = 1): BattleResult`
  - `startBattle(attacker: PlayerShip, defender: PlayerShip, seed: number, attackerShipLevel = 1, defenderShipLevel = 1): BattleResult`
  - New exports: `BASE_HP`, `BASE_DAMAGE`, `BASE_SHIELD` (Task 15's timeline builder needs them).

- [ ] **Step 1: Write failing tests** — append to `CombatEngine.test.ts`:

```ts
describe('ship level scaling', () => {
  // makeShip(...) already exists in this file — reuse the same helper the
  // existing tests use to build a PlayerShip with all-common components.
  it('scales maxHp by the ship-level multiplier', () => {
    const ship = makeShip('p1');
    expect(buildCombatant(ship, 20).maxHp).toBe(Math.round(1000 * 1.38));
    expect(buildCombatant(ship).maxHp).toBe(1000); // default unchanged
  });
  it('identical ships: level 20 beats level 1', () => {
    const a = makeShip('high');
    const b = makeShip('low');
    const result = resolveBattle(a, b, new SeededRNG(42), 20, 1);
    expect(result.winnerId).toBe('high');
  });
  it('level params default to 1 (existing behavior preserved)', () => {
    const r1 = resolveBattle(makeShip('a'), makeShip('b'), new SeededRNG(7));
    const r2 = resolveBattle(makeShip('a'), makeShip('b'), new SeededRNG(7), 1, 1);
    expect(r1).toEqual(r2);
  });
});
```

If the file's ship-builder helper has a different name/signature, adapt the test to it — read the file first.

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/game/ships/CombatEngine.test.ts`
Expected: FAIL — `buildCombatant` takes 1 argument / level has no effect.

- [ ] **Step 3: Implement.** In `CombatEngine.ts`:

```ts
import { shipLevelMultiplier } from '../battle/leveling';

// (change the three consts to exports)
export const BASE_HP = 1000;
export const BASE_DAMAGE = 100;
export const BASE_SHIELD = 500;

export function buildCombatant(ship: PlayerShip, shipLevel = 1): Combatant {
  const maxHp = Math.round(BASE_HP * ship.hull.statMultiplier * shipLevelMultiplier(shipLevel));
  // ...rest unchanged
}

function shieldPool(ship: PlayerShip, levelMult: number): number {
  return Math.round(BASE_SHIELD * ship.shields.statMultiplier * levelMult);
}

function baseDamage(ship: PlayerShip, levelMult: number): number {
  return Math.round(BASE_DAMAGE * ship.weapons.statMultiplier * levelMult);
}
```

In `resolveBattle`, accept `attackerShipLevel = 1, defenderShipLevel = 1`, compute the two multipliers once, build combatants with their levels, build `shields` with the multipliers, and precompute per-player damage so `applyAttack` needs no level knowledge:

```ts
export function resolveBattle(
  attackerShip: PlayerShip,
  defenderShip: PlayerShip,
  rng: SeededRNG,
  attackerShipLevel = 1,
  defenderShipLevel = 1,
): BattleResult {
  const aMult = shipLevelMultiplier(attackerShipLevel);
  const dMult = shipLevelMultiplier(defenderShipLevel);
  const a = buildCombatant(attackerShip, attackerShipLevel);
  const d = buildCombatant(defenderShip, defenderShipLevel);
  const events: BattleEvent[] = [];

  const shields = {
    [attackerShip.playerId]: shieldPool(attackerShip, aMult),
    [defenderShip.playerId]: shieldPool(defenderShip, dMult),
  };
  const damageOf: Record<string, number> = {
    [attackerShip.playerId]: baseDamage(attackerShip, aMult),
    [defenderShip.playerId]: baseDamage(defenderShip, dMult),
  };
  // Overdrive burst: use damageOf[a.playerId] instead of baseDamage(attackerShip)
  // Turn loop unchanged, but pass damageOf into applyAttack.
```

`applyAttack` change: replace its `let damage = baseDamage(actor.ship);` with `let damage = damageOf[actor.playerId];` and add `damageOf: Record<string, number>` as the third parameter (callers updated accordingly). Everything else (phase cannon, iron tomb, echo shell) is untouched.

In `src/game/battle/index.ts`:

```ts
export function startBattle(
  attacker: PlayerShip,
  defender: PlayerShip,
  seed: number,
  attackerShipLevel = 1,
  defenderShipLevel = 1,
) {
  const rng = new SeededRNG(seed);
  return resolveBattle(attacker, defender, rng, attackerShipLevel, defenderShipLevel);
}
```

- [ ] **Step 4: Run the whole ships suite** (existing tests must pass unmodified)

Run: `npm test -- src/game/ships`
Expected: PASS, including all pre-existing tests.

- [ ] **Step 5: Commit**

```bash
git add src/game/ships/CombatEngine.ts src/game/ships/CombatEngine.test.ts src/game/battle/index.ts
git commit -m "feat: ship-level stat scaling in CombatEngine (backward compatible)"
```

---

### Task 4: Skirmish ladder — tiers, daily opponents, fleet names

**Files:**
- Create: `src/game/battle/ladder.ts`
- Test: `src/game/battle/ladder.test.ts`

**Interfaces:**
- Consumes: `SeededRNG` (`../rng`), `COMPONENT_STAT_MULTIPLIERS` (constants), `hashUUID` (`../exploration/mission`), ship types (`../ships/types`).
- Produces:
  - `SKIRMISH_TIERS: SkirmishTier[]` — 8 entries `{ id, name, description, minLevel, opponentShipLevel, componentPool, accent, glyph }`
  - `dailySeed(playerId: string, tierId: number, dateUTC: string): number`
  - `generateOpponent(tier: SkirmishTier, seed: number): PlayerShip`
  - `fleetName(seed: number): string`
  - `highestUnlockedTier(playerLevel: number): SkirmishTier`

- [ ] **Step 1: Write failing tests** — `src/game/battle/ladder.test.ts`:

```ts
import { SKIRMISH_TIERS, dailySeed, generateOpponent, fleetName, highestUnlockedTier } from './ladder';
import { COMPONENT_STAT_MULTIPLIERS } from '@/src/constants/game';

describe('SKIRMISH_TIERS', () => {
  it('has 8 tiers with ascending ids, minLevels, and ship levels', () => {
    expect(SKIRMISH_TIERS).toHaveLength(8);
    expect(SKIRMISH_TIERS.map(t => t.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(SKIRMISH_TIERS.map(t => t.minLevel)).toEqual([1, 3, 5, 8, 11, 14, 17, 20]);
    expect(SKIRMISH_TIERS.map(t => t.opponentShipLevel)).toEqual([1, 2, 4, 6, 9, 12, 16, 20]);
  });
});

describe('generateOpponent', () => {
  it('is deterministic for the same seed', () => {
    const t = SKIRMISH_TIERS[4];
    expect(generateOpponent(t, 12345)).toEqual(generateOpponent(t, 12345));
  });
  it('only rolls tiers from the tier componentPool, with correct multipliers', () => {
    const t = SKIRMISH_TIERS[0]; // Recruit: all common
    const ship = generateOpponent(t, 999);
    for (const slot of ['hull', 'weapons', 'shields', 'engine'] as const) {
      expect(ship[slot].tier).toBe('common');
      expect(ship[slot].statMultiplier).toBe(COMPONENT_STAT_MULTIPLIERS.common);
      expect(ship[slot].ability).toBeUndefined();
    }
  });
  it('gives ultra_rare components their slot ability', () => {
    const t = SKIRMISH_TIERS[7]; // Sovereign: legendary/ultra_rare pool
    for (let seed = 0; seed < 200; seed++) {
      const ship = generateOpponent(t, seed);
      if (ship.weapons.tier === 'ultra_rare') {
        expect(ship.weapons.ability).toBe('phase_cannon');
        return;
      }
    }
    throw new Error('no ultra_rare weapons rolled in 200 seeds — pool broken');
  });
});

describe('dailySeed / fleetName', () => {
  it('differs by player, tier, and date', () => {
    expect(dailySeed('p1', 3, '2026-07-02')).not.toBe(dailySeed('p2', 3, '2026-07-02'));
    expect(dailySeed('p1', 3, '2026-07-02')).not.toBe(dailySeed('p1', 4, '2026-07-02'));
    expect(dailySeed('p1', 3, '2026-07-02')).not.toBe(dailySeed('p1', 3, '2026-07-03'));
  });
  it('fleetName is a stable "Prefix Suffix" pairing', () => {
    const n = fleetName(4242);
    expect(n).toBe(fleetName(4242));
    expect(n.split(' ')).toHaveLength(2);
  });
});

describe('highestUnlockedTier', () => {
  it('returns the top tier the level qualifies for', () => {
    expect(highestUnlockedTier(1).id).toBe(1);
    expect(highestUnlockedTier(10).id).toBe(4);
    expect(highestUnlockedTier(30).id).toBe(8);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/game/battle/ladder.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `src/game/battle/ladder.ts` (tier copy and accents come from visual spec §A3.1/§A1.3 — keep verbatim):

```ts
import { SeededRNG } from '../rng';
import { COMPONENT_STAT_MULTIPLIERS } from '@/src/constants/game';
import { hashUUID } from '../exploration/mission';
import type {
  ComponentSlot, ComponentTier, PlayerShip, ShipComponent, UltraRareAbility,
} from '../ships/types';

export interface SkirmishTier {
  id: number;                    // 1-8
  name: string;
  description: string;           // launcher sub-copy
  minLevel: number;              // player level gate
  opponentShipLevel: number;
  componentPool: ComponentTier[]; // rolled uniformly per slot
  accent: string;                // tier accent color (visual spec §A1.3)
  glyph: string;                 // emblem glyph
}

export const SKIRMISH_TIERS: SkirmishTier[] = [
  { id: 1, name: 'Recruit',     description: 'Fresh out of the academy. Their shields are mostly paint.',            minLevel: 1,  opponentShipLevel: 1,  componentPool: ['common'],                                accent: '#9E9E9E', glyph: '🎖️' },
  { id: 2, name: 'Scout',       description: 'Fast, curious, lightly armed. Someone has to report your victories.',  minLevel: 3,  opponentShipLevel: 2,  componentPool: ['common', 'common', 'uncommon'],          accent: '#4CAF50', glyph: '🛰️' },
  { id: 3, name: 'Corsair',     description: 'Freelance raiders flying stolen guns with something to prove.',        minLevel: 5,  opponentShipLevel: 4,  componentPool: ['uncommon'],                              accent: '#2196F3', glyph: '🏴‍☠️' },
  { id: 4, name: 'Vanguard',    description: 'Disciplined front-line crews. The first real test.',                   minLevel: 8,  opponentShipLevel: 6,  componentPool: ['uncommon', 'uncommon', 'rare'],          accent: '#5EC8FF', glyph: '🛡️' },
  { id: 5, name: 'Ace',         description: 'One pilot. No wasted shots. Bring your best loadout.',                 minLevel: 11, opponentShipLevel: 9,  componentPool: ['rare'],                                  accent: '#FFB454', glyph: '🎯' },
  { id: 6, name: 'Warlord',     description: "A conqueror's escort fleet. They don't retreat — they regroup.",       minLevel: 14, opponentShipLevel: 12, componentPool: ['rare', 'rare', 'legendary'],             accent: '#FF9800', glyph: '⚔️' },
  { id: 7, name: 'Dreadnought', description: 'A wall of legendary plating. Chip it down or be buried under it.',     minLevel: 17, opponentShipLevel: 16, componentPool: ['legendary'],                             accent: '#FF5E7A', glyph: '🚀' },
  { id: 8, name: 'Sovereign',   description: 'The throne fleet. Ultra-rare tech, zero mercy.',                       minLevel: 20, opponentShipLevel: 20, componentPool: ['legendary', 'legendary', 'ultra_rare'],  accent: '#9C27B0', glyph: '👑' },
];

const ABILITY_BY_SLOT: Record<ComponentSlot, UltraRareAbility> = {
  hull: 'iron_tomb', weapons: 'phase_cannon', shields: 'echo_shell', engine: 'overdrive',
};
const SLOTS: ComponentSlot[] = ['hull', 'weapons', 'shields', 'engine'];

// Visual spec §A3.2 — 144 combos, "Vanguard" deliberately absent from suffixes.
const FLEET_PREFIXES = ['Crimson', 'Void', 'Iron', 'Silent', 'Obsidian', 'Rogue', 'Solar', 'Phantom', 'Ashen', 'Feral', 'Zenith', 'Hollow'];
const FLEET_SUFFIXES = ['Talons', 'Armada', 'Reavers', 'Wardens', 'Syndicate', 'Lancers', 'Vultures', 'Legion', 'Pact', 'Swarm', 'Halo', 'Fangs'];

export function fleetName(seed: number): string {
  return `${FLEET_PREFIXES[seed % 12]} ${FLEET_SUFFIXES[Math.floor(seed / 12) % 12]}`;
}

/** Same fleet all UTC day per player+tier; fresh tomorrow. Server derives identically. */
export function dailySeed(playerId: string, tierId: number, dateUTC: string): number {
  return hashUUID(`${playerId}:skirmish:${tierId}:${dateUTC}`);
}

export function generateOpponent(tier: SkirmishTier, seed: number): PlayerShip {
  const rng = new SeededRNG(seed);
  const playerId = `ai:skirmish:${tier.id}`;
  const roll = (slot: ComponentSlot): ShipComponent => {
    const t = tier.componentPool[rng.int(0, tier.componentPool.length - 1)];
    return {
      id: `${playerId}:${slot}`,
      slot,
      tier: t,
      statMultiplier: COMPONENT_STAT_MULTIPLIERS[t],
      ...(t === 'ultra_rare' ? { ability: ABILITY_BY_SLOT[slot] } : {}),
    };
  };
  const [hull, weapons, shields, engine] = SLOTS.map(roll);
  return { playerId, hull, weapons, shields, engine };
}

export function highestUnlockedTier(playerLevel: number): SkirmishTier {
  let best = SKIRMISH_TIERS[0];
  for (const t of SKIRMISH_TIERS) if (playerLevel >= t.minLevel) best = t;
  return best;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/game/battle/ladder.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/battle/ladder.ts src/game/battle/ladder.test.ts
git commit -m "feat: skirmish tier ladder with daily deterministic opponents and fleet names"
```

---

### Task 5: Reward math

**Files:**
- Create: `src/game/battle/rewards.ts`
- Modify: `src/game/battle/index.ts` (barrel exports)
- Test: `src/game/battle/rewards.test.ts`

**Interfaces:**
- Consumes: `BATTLE` constants.
- Produces:
  - `interface BattleRewards { xp: number; lumens: number; salvage: number; consolation: boolean }`
  - `skirmishReward(tierId: number, firstWinToday: boolean): BattleRewards`
  - `pvpReward(highestUnlockedTierId: number, underDailyCap: boolean): BattleRewards`

- [ ] **Step 1: Write failing tests** — `src/game/battle/rewards.test.ts`:

```ts
import { skirmishReward, pvpReward } from './rewards';

describe('skirmishReward', () => {
  it('full first-win reward scales linearly by tier', () => {
    expect(skirmishReward(1, true)).toEqual({ xp: 50, lumens: 25, salvage: 10, consolation: false });
    expect(skirmishReward(8, true)).toEqual({ xp: 400, lumens: 200, salvage: 80, consolation: false });
  });
  it('consolation is ceil(15%) of full', () => {
    expect(skirmishReward(1, false)).toEqual({ xp: 8, lumens: 4, salvage: 2, consolation: true });
  });
});

describe('pvpReward', () => {
  it('is ceil(1.5×) the full reward of the highest unlocked tier', () => {
    expect(pvpReward(4, true)).toEqual({ xp: 300, lumens: 150, salvage: 60, consolation: false });
  });
  it('drops to consolation past the daily cap', () => {
    expect(pvpReward(4, false)).toEqual({ xp: 45, lumens: 23, salvage: 9, consolation: true });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/game/battle/rewards.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `src/game/battle/rewards.ts`:

```ts
import { BATTLE } from '@/src/constants/game';

export interface BattleRewards {
  xp: number;
  lumens: number;
  salvage: number;
  consolation: boolean;
}

function consolate(full: Omit<BattleRewards, 'consolation'>): BattleRewards {
  return {
    xp: Math.ceil(full.xp * BATTLE.CONSOLATION_RATE),
    lumens: Math.ceil(full.lumens * BATTLE.CONSOLATION_RATE),
    salvage: Math.ceil(full.salvage * BATTLE.CONSOLATION_RATE),
    consolation: true,
  };
}

export function skirmishReward(tierId: number, firstWinToday: boolean): BattleRewards {
  const full = {
    xp: BATTLE.SKIRMISH_XP_PER_TIER * tierId,
    lumens: BATTLE.SKIRMISH_LUMENS_PER_TIER * tierId,
    salvage: BATTLE.SKIRMISH_SALVAGE_PER_TIER * tierId,
  };
  return firstWinToday ? { ...full, consolation: false } : consolate(full);
}

export function pvpReward(highestUnlockedTierId: number, underDailyCap: boolean): BattleRewards {
  const base = skirmishReward(highestUnlockedTierId, true);
  const full = {
    xp: Math.ceil(base.xp * BATTLE.PVP_REWARD_MULTIPLIER),
    lumens: Math.ceil(base.lumens * BATTLE.PVP_REWARD_MULTIPLIER),
    salvage: Math.ceil(base.salvage * BATTLE.PVP_REWARD_MULTIPLIER),
  };
  return underDailyCap ? { ...full, consolation: false } : consolate(full);
}
```

Update `src/game/battle/index.ts` to re-export everything the UI will need:

```ts
export * from './xp';
export * from './leveling';
export * from './ladder';
export * from './rewards';
```

(keep the existing `startBattle` + type re-exports in place).

- [ ] **Step 4: Run to verify pass + typecheck**

Run: `npm test -- src/game/battle` then `npx tsc --noEmit`
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add src/game/battle/rewards.ts src/game/battle/rewards.test.ts src/game/battle/index.ts
git commit -m "feat: skirmish/pvp reward math with daily consolation"
```

---

### Task 6: Planetary defender generator

**Files:**
- Create: `src/game/exploration/defender.ts`
- Modify: `src/game/exploration/index.ts` (add `export * from './defender';`)
- Test: `src/game/exploration/defender.test.ts`

**Interfaces:**
- Consumes: `SeededRNG`, `COMPONENT_STAT_MULTIPLIERS`, `fleetName` (from `../battle/ladder`), ship types.
- Produces: `generateDefender(dangerLevel: 1|2|3|4|5, seed: number): { ship: PlayerShip; shipLevel: number; name: string }`

- [ ] **Step 1: Write failing tests** — `src/game/exploration/defender.test.ts`:

```ts
import { generateDefender } from './defender';

describe('generateDefender', () => {
  it('is deterministic per seed', () => {
    expect(generateDefender(3, 777)).toEqual(generateDefender(3, 777));
  });
  it('danger 1 fields common fleets at ship level 1', () => {
    const d = generateDefender(1, 42);
    expect(d.shipLevel).toBe(1);
    expect(d.ship.hull.tier).toBe('common');
  });
  it('danger 5 fields legendary+ fleets at ship level 13', () => {
    const d = generateDefender(5, 42);
    expect(d.shipLevel).toBe(13);
    expect(['legendary', 'ultra_rare']).toContain(d.ship.weapons.tier);
  });
  it('has a generated two-word fleet name', () => {
    expect(generateDefender(2, 5).name.split(' ')).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/game/exploration/defender.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `src/game/exploration/defender.ts`:

```ts
import { SeededRNG } from '../rng';
import { COMPONENT_STAT_MULTIPLIERS } from '@/src/constants/game';
import { fleetName } from '../battle/ladder';
import type {
  ComponentSlot, ComponentTier, PlayerShip, ShipComponent, UltraRareAbility,
} from '../ships/types';

const DEFENDER_POOLS: Record<1 | 2 | 3 | 4 | 5, ComponentTier[]> = {
  1: ['common'],
  2: ['common', 'uncommon'],
  3: ['uncommon', 'uncommon', 'rare'],
  4: ['rare', 'rare', 'legendary'],
  5: ['legendary', 'legendary', 'ultra_rare'],
};

/** Defender ship level ramps 1 → 13 with danger. */
export const DEFENDER_SHIP_LEVELS: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: 1, 2: 4, 3: 7, 4: 10, 5: 13,
};

const ABILITY_BY_SLOT: Record<ComponentSlot, UltraRareAbility> = {
  hull: 'iron_tomb', weapons: 'phase_cannon', shields: 'echo_shell', engine: 'overdrive',
};
const SLOTS: ComponentSlot[] = ['hull', 'weapons', 'shields', 'engine'];

export interface DefenderFleet {
  ship: PlayerShip;
  shipLevel: number;
  name: string;
}

/** Seeded from hashUUID(missionId) so client preview and server resolution agree. */
export function generateDefender(dangerLevel: 1 | 2 | 3 | 4 | 5, seed: number): DefenderFleet {
  const rng = new SeededRNG(seed);
  const pool = DEFENDER_POOLS[dangerLevel];
  const playerId = `ai:defense:${dangerLevel}`;
  const roll = (slot: ComponentSlot): ShipComponent => {
    const t = pool[rng.int(0, pool.length - 1)];
    return {
      id: `${playerId}:${slot}`,
      slot,
      tier: t,
      statMultiplier: COMPONENT_STAT_MULTIPLIERS[t],
      ...(t === 'ultra_rare' ? { ability: ABILITY_BY_SLOT[slot] } : {}),
    };
  };
  const [hull, weapons, shields, engine] = SLOTS.map(roll);
  return {
    ship: { playerId, hull, weapons, shields, engine },
    shipLevel: DEFENDER_SHIP_LEVELS[dangerLevel],
    name: fleetName(seed),
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/game/exploration/defender.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/exploration/defender.ts src/game/exploration/defender.test.ts src/game/exploration/index.ts
git commit -m "feat: seeded planetary-defense fleet generator scaled by danger level"
```

---

### Task 7: Wormhole in the spin loot pool (client side)

**Files:**
- Modify: `src/game/spin/lootTable.ts` (rare-tier item roll)
- Modify: `src/game/spin/lootTable.test.ts`
- Modify: `src/ui/spin/reelData.ts` (display mapping)

**Interfaces:**
- Consumes: `'wormhole'` ItemType from Task 1.
- Produces: rare-tier rolls return `{ itemType: 'wormhole', itemData: {} }` 20% of the time. Distribution: `roll < 0.4` → ship_component, `< 0.8` → blueprint, else wormhole. (The server copy is patched in Task 12 — both must match.)

- [ ] **Step 1: Read `src/game/spin/lootTable.ts`**, find the rare branch of `rollItemForTier` (currently 40% ship_component / 60% blueprint).

- [ ] **Step 2: Write a failing distribution test** — append to `lootTable.test.ts` (match the file's existing test style for constructing the RNG):

```ts
it('rare tier rolls ~20% wormholes (40/40/20 split)', () => {
  const counts = { ship_component: 0, blueprint: 0, wormhole: 0 };
  for (let seed = 0; seed < 2000; seed++) {
    const item = rollItemForTier(new SeededRNG(seed), 'rare');
    counts[item.itemType as keyof typeof counts] += 1;
  }
  expect(counts.wormhole).toBeGreaterThan(2000 * 0.15);
  expect(counts.wormhole).toBeLessThan(2000 * 0.25);
  expect(counts.ship_component).toBeGreaterThan(2000 * 0.35 - 100);
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm test -- src/game/spin/lootTable.test.ts`
Expected: FAIL — wormhole count 0.

- [ ] **Step 4: Implement** — change the rare branch to a three-way split (adapt to the file's local helper names):

```ts
case 'rare': {
  const r = rng.next();
  if (r < 0.4) return { itemType: 'ship_component', itemData: { tier: 'rare', slot: pickSlot(rng) } };
  if (r < 0.8) return { itemType: 'blueprint', itemData: { buildingTier: 'advanced' } };
  return { itemType: 'wormhole', itemData: {} };
}
```

- [ ] **Step 5: Add display mappings in `src/ui/spin/reelData.ts`:**

In `spinResultToReelItem`'s switch, before `default`:

```ts
case 'wormhole':
  label = 'Wormhole';
  sublabel = 'Instant travel';
  icon = '🌀';
  break;
```

In `TIER_POOL.rare`, add `{ label: 'Wormhole', sublabel: 'Instant travel', icon: '🌀' },`.

- [ ] **Step 6: Run spin suites + typecheck**

Run: `npm test -- src/game/spin src/ui/spin` then `npx tsc --noEmit`
Expected: PASS / clean.

- [ ] **Step 7: Commit**

```bash
git add src/game/spin/lootTable.ts src/game/spin/lootTable.test.ts src/ui/spin/reelData.ts
git commit -m "feat: wormhole consumable drops from rare spin rolls (client loot table)"
```

---

## Phase 2 — Backend (migration + Edge Functions)

### Task 8: Database migration — progression, ladder, claims, RPCs

**Files:**
- Create: `supabase/migrations/20260702000000_battle_arena_progression.sql`

**Interfaces:**
- Produces tables: `player_progress` (xp/level/salvage/ship_level), `skirmish_clears`, `pvp_ladder` (deferred-unique rank), `claimed_missions`.
- Produces RPCs: `join_pvp_ladder() → INT`, `upgrade_ship() → JSON` (both callable by authenticated users), `increment_progress`, `increment_fragment`, `swap_pvp_ranks` (service-role helpers). `increment_lumens` already exists from the spin migration.

- [ ] **Step 1: Write the migration** — full contents:

```sql
-- ============================================================
-- Player progression (XP / level / salvage / ship level)
-- ============================================================
CREATE TABLE player_progress (
  player_id  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  xp         BIGINT NOT NULL DEFAULT 0 CHECK (xp >= 0),
  level      INT NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 30),
  salvage    BIGINT NOT NULL DEFAULT 0 CHECK (salvage >= 0),
  ship_level INT NOT NULL DEFAULT 1 CHECK (ship_level BETWEEN 1 AND 20)
);
ALTER TABLE player_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players read own progress" ON player_progress
  FOR SELECT USING (auth.uid() = player_id);

-- Daily first-win tracking per skirmish tier
CREATE TABLE skirmish_clears (
  player_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier_id      INT NOT NULL CHECK (tier_id BETWEEN 1 AND 8),
  cleared_date DATE NOT NULL,
  PRIMARY KEY (player_id, tier_id, cleared_date)
);
ALTER TABLE skirmish_clears ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players read own clears" ON skirmish_clears
  FOR SELECT USING (auth.uid() = player_id);

-- PvP ladder. Rank swap needs the unique constraint deferred inside a tx.
CREATE TABLE pvp_ladder (
  player_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  rank         INT NOT NULL,
  display_name TEXT NOT NULL,
  wins_today   INT NOT NULL DEFAULT 0,
  wins_date    DATE,
  CONSTRAINT pvp_rank_unique UNIQUE (rank) DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE pvp_ladder ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view ladder" ON pvp_ladder FOR SELECT USING (TRUE);

-- Planetary-defense claim dedupe + cooldown
CREATE TABLE claimed_missions (
  mission_id TEXT PRIMARY KEY,
  player_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  system_id  TEXT NOT NULL,
  won        BOOLEAN,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX claimed_missions_cooldown
  ON claimed_missions (player_id, system_id, claimed_at DESC);
ALTER TABLE claimed_missions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players read own claims" ON claimed_missions
  FOR SELECT USING (auth.uid() = player_id);

-- ============================================================
-- Helpers (called with service role from Edge Functions)
-- ============================================================
CREATE OR REPLACE FUNCTION increment_progress(
  p_player_id UUID, p_xp BIGINT, p_salvage BIGINT, p_level INT
) RETURNS VOID LANGUAGE sql AS $fn$
  INSERT INTO player_progress (player_id, xp, salvage, level)
  VALUES (p_player_id, p_xp, p_salvage, p_level)
  ON CONFLICT (player_id) DO UPDATE
    SET xp = player_progress.xp + p_xp,
        salvage = player_progress.salvage + p_salvage,
        level = p_level;
$fn$;

CREATE OR REPLACE FUNCTION increment_fragment(p_player_id UUID, p_slot TEXT)
RETURNS VOID LANGUAGE sql AS $fn$
  INSERT INTO component_fragments (player_id, slot_type, count)
  VALUES (p_player_id, p_slot, 1)
  ON CONFLICT (player_id, slot_type)
  DO UPDATE SET count = component_fragments.count + 1;
$fn$;

CREATE OR REPLACE FUNCTION swap_pvp_ranks(p_winner UUID, p_loser UUID)
RETURNS VOID LANGUAGE plpgsql AS $fn$
DECLARE w_rank INT; l_rank INT;
BEGIN
  SELECT rank INTO w_rank FROM pvp_ladder WHERE player_id = p_winner;
  SELECT rank INTO l_rank FROM pvp_ladder WHERE player_id = p_loser;
  -- Only swap upward (lower rank number = better)
  IF w_rank IS NULL OR l_rank IS NULL OR w_rank <= l_rank THEN RETURN; END IF;
  UPDATE pvp_ladder SET rank = w_rank WHERE player_id = p_loser;
  UPDATE pvp_ladder SET rank = l_rank WHERE player_id = p_winner;
END;
$fn$;

-- ============================================================
-- RPCs callable by authenticated clients
-- ============================================================
CREATE OR REPLACE FUNCTION join_pvp_ladder()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE my_rank INT;
BEGIN
  SELECT rank INTO my_rank FROM pvp_ladder WHERE player_id = auth.uid();
  IF my_rank IS NOT NULL THEN RETURN my_rank; END IF;
  INSERT INTO pvp_ladder (player_id, rank, display_name)
  VALUES (auth.uid(),
          COALESCE((SELECT MAX(rank) FROM pvp_ladder), 0) + 1,
          'Commander-' || LEFT(auth.uid()::TEXT, 4))
  RETURNING rank INTO my_rank;
  RETURN my_rank;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION join_pvp_ladder() FROM anon;

-- Atomic ship upgrade: validates balances server-side.
-- COST FORMULAS MUST MIRROR src/game/battle/leveling.ts shipLevelCost().
CREATE OR REPLACE FUNCTION upgrade_ship()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE cur INT; sal BIGINT; bal BIGINT; cost_lumens BIGINT; cost_salvage BIGINT;
BEGIN
  INSERT INTO player_progress (player_id) VALUES (auth.uid()) ON CONFLICT DO NOTHING;
  SELECT ship_level, salvage INTO cur, sal
    FROM player_progress WHERE player_id = auth.uid() FOR UPDATE;
  IF cur >= 20 THEN RETURN json_build_object('error', 'Ship is max level'); END IF;
  cost_lumens  := ROUND(200 * POWER(1.5, cur - 1));
  cost_salvage := 10 * cur;
  SELECT balance INTO bal FROM player_lumens WHERE player_id = auth.uid() FOR UPDATE;
  IF COALESCE(bal, 0) < cost_lumens THEN RETURN json_build_object('error', 'Not enough Lumens'); END IF;
  IF sal < cost_salvage THEN RETURN json_build_object('error', 'Not enough Salvage'); END IF;
  UPDATE player_lumens SET balance = balance - cost_lumens WHERE player_id = auth.uid();
  INSERT INTO lumen_ledger (player_id, delta, reason)
    VALUES (auth.uid(), -cost_lumens, 'ship_upgrade');
  UPDATE player_progress SET salvage = salvage - cost_salvage, ship_level = cur + 1
    WHERE player_id = auth.uid();
  RETURN json_build_object('shipLevel', cur + 1, 'salvage', sal - cost_salvage,
                           'lumens', bal - cost_lumens);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION upgrade_ship() FROM anon;
```

- [ ] **Step 2: Push the migration**

Run: `supabase db push`
Expected: `Applying migration 20260702000000_battle_arena_progression.sql... Finished supabase db push.`

- [ ] **Step 3: Smoke-check** — run `supabase db push` again; expected: `Remote database is up to date.`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260702000000_battle_arena_progression.sql
git commit -m "feat: battle-arena schema (progress, ladder, clears, claims) + RPCs"
```

---

### Task 9: Shared Deno battle module

**Files:**
- Create: `supabase/functions/_shared/battle.ts`

**Interfaces:**
- Produces (imported by Tasks 10–12 via `import { ... } from '../_shared/battle.ts'`):
  - `SeededRNG`, `hashUUID(id: string): number`
  - `resolveBattle(attackerShip, defenderShip, rng, attackerShipLevel, defenderShipLevel): BattleResult` — line-for-line mirror of the client engine after Task 3
  - `SKIRMISH_TIERS`, `dailySeed(playerId, tierId, dateUTC)`, `generateOpponent(tier, seed)`, `fleetName(seed)`, `highestUnlockedTierId(level): number`
  - `skirmishReward(tierId, first): Rewards`, `pvpReward(tierId, underCap): Rewards`
  - `xpToNext(level)`, `levelFromXp(totalXp)`
  - `generateStarSystems(seed): StarSystem[]` — mirror of `src/game/exploration/generator.ts`
  - `rollMissionEligibility(missionId, system): { eligible: boolean; tier: string | null }` — replicates `resolveMission`'s exact RNG call order
  - `generateDefender(dangerLevel, seed): { ship; shipLevel; name }`
  - `serviceClient()`, `getUser(req, supabase)`, `loadPlayerShip(supabase, playerId)`, `getProgress(supabase, playerId)`, `grantRewards(supabase, playerId, rewards, currentXp)`, `json(body, status?)`
  - `BATTLE_CONST`, `EXPLORATION` const objects

**This file is the server's single source of battle truth.** Every constant and algorithm must match the client exactly — copy values from `src/constants/game.ts` and logic from `src/game/` (post-Task-7 state), adjusting only imports/types for Deno. The proven pattern (see `supabase/functions/spin/index.ts`) is inlining; `_shared/` keeps it DRY across the three battle functions. `supabase functions deploy` bundles relative imports inside `supabase/functions/` automatically.

- [ ] **Step 1: Write the module.** Skeleton below; complete each `MIRROR:` marker by transcribing the named client file (they are short pure functions — copy the bodies, drop `@/src` imports, use the local loose types):

```ts
// supabase/functions/_shared/battle.ts
// Server-side mirror of src/game battle logic. KEEP IN SYNC — every value
// here must equal its src/game or src/constants counterpart.
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ---- constants (mirror src/constants/game.ts) ----
export const COMPONENT_STAT_MULTIPLIERS: Record<string, number> = {
  common: 1.0, uncommon: 1.3, rare: 1.7, legendary: 2.2, ultra_rare: 2.5,
};
export const ULTRA_RARE_ABILITIES = {
  PHASE_CANNON_BYPASS_CHANCE: 0.20, ECHO_SHELL_REFLECT_PERCENT: 0.15,
  ECHO_SHELL_MAX_CHARGES: 2, OVERDRIVE_HP_COST_PERCENT: 0.10,
  OVERDRIVE_BURST_MULTIPLIER: 1.5,
} as const;
export const BATTLE_CONST = {
  PLAYER_LEVEL_CAP: 30, XP_CURVE_BASE: 100, XP_CURVE_EXP: 1.5,
  CONSOLATION_RATE: 0.15, SKIRMISH_XP_PER_TIER: 50, SKIRMISH_LUMENS_PER_TIER: 25,
  SKIRMISH_SALVAGE_PER_TIER: 10, PVP_REWARD_MULTIPLIER: 1.5,
  PVP_DAILY_WIN_CAP: 5, PVP_CHALLENGE_RANGE: 5,
} as const;
export const SHIP_LEVELING = { LEVEL_CAP: 20, STAT_BONUS_PER_LEVEL: 0.02 } as const;
export const EXPLORATION = {
  MAP_SIZE: 2000, SYSTEM_COUNT: 20, MIN_SYSTEM_SPACING: 150,
  FRAGMENT_BASE_CHANCE: 0.08, FRAGMENT_DANGER_BONUS: 0.02,
  TRAVEL_TIME_MIN_MS: 90_000,
} as const;

// ---- loose structural types ----
export interface ShipComponent { id: string; slot: string; tier: string; statMultiplier: number; ability?: string; }
export interface PlayerShip { playerId: string; hull: ShipComponent; weapons: ShipComponent; shields: ShipComponent; engine: ShipComponent; }
export interface BattleEvent { turn: number; type: string; actorId: string; targetId: string; value: number; description: string; }
export interface BattleResult { winnerId: string; loserId: string; log: BattleEvent[]; turns: number; }
export interface StarSystem { id: string; name: string; position: { x: number; y: number }; planets: unknown[]; dangerLevel: number; }
export interface Rewards { xp: number; lumens: number; salvage: number; consolation: boolean; }

// MIRROR: SeededRNG class — copy verbatim from supabase/functions/spin/index.ts
// MIRROR: hashUUID — copy verbatim from src/game/exploration/mission.ts
// MIRROR: shipLevelMultiplier — src/game/battle/leveling.ts
// MIRROR: xpToNext + levelFromXp — src/game/battle/xp.ts (use BATTLE_CONST)
// MIRROR: BASE_HP/BASE_DAMAGE/BASE_SHIELD/MAX_TURNS + buildCombatant +
//         shieldPool + baseDamage + makeEvent + resolveBattle + applyAttack —
//         src/game/ships/CombatEngine.ts post-Task-3 (ship-level params +
//         damageOf map), typed with the loose interfaces above
// MIRROR: SKIRMISH_TIERS (id/name/minLevel/opponentShipLevel/componentPool
//         only — server doesn't need description/accent/glyph) + ABILITY_BY_SLOT +
//         FLEET_PREFIXES/FLEET_SUFFIXES + fleetName + dailySeed +
//         generateOpponent — src/game/battle/ladder.ts
// MIRROR: skirmishReward + pvpReward + consolate — src/game/battle/rewards.ts
//         (use BATTLE_CONST)
// MIRROR: SYSTEM_NAMES + placeSystem + makePlanets + generateStarSystems —
//         src/game/exploration/generator.ts verbatim
// MIRROR: DEFENDER_POOLS + DEFENDER_SHIP_LEVELS + generateDefender —
//         src/game/exploration/defender.ts

export function highestUnlockedTierId(playerLevel: number): number {
  let best = 1;
  for (const t of SKIRMISH_TIERS) if (playerLevel >= t.minLevel) best = t.id;
  return best;
}

// Replicates resolveMission()'s EXACT RNG consumption so the server derives
// the same eligibility/tier the client previewed. Order (src/game/exploration/mission.ts):
// next()×3 (credits, fuelRefund, research — values discarded here),
// next() vs dropChance, then int() for the tier pick.
const TIERS_BY_DANGER: Record<number, string[]> = {
  1: ['common', 'common', 'uncommon'], 2: ['common', 'uncommon', 'uncommon'],
  3: ['uncommon', 'uncommon', 'rare'], 4: ['uncommon', 'rare', 'rare'],
  5: ['rare', 'rare', 'legendary'],
};
export function rollMissionEligibility(
  missionId: string,
  system: { dangerLevel: number },
): { eligible: boolean; tier: string | null } {
  const rng = new SeededRNG(hashUUID(missionId));
  rng.next(); rng.next(); rng.next();
  const dropChance = EXPLORATION.FRAGMENT_BASE_CHANCE +
    Math.max(0, system.dangerLevel - 2) * EXPLORATION.FRAGMENT_DANGER_BONUS;
  if (rng.next() >= dropChance) return { eligible: false, tier: null };
  const tiers = TIERS_BY_DANGER[system.dangerLevel] ?? ['common'];
  return { eligible: true, tier: tiers[rng.int(0, tiers.length - 1)] };
}

// ---- Supabase helpers ----
export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}

export async function getUser(req: Request, supabase: SupabaseClient) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  return user;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

const DEFAULT_COMPONENT = (slot: string): ShipComponent =>
  ({ id: `default:${slot}`, slot, tier: 'common', statMultiplier: 1.0 });
const ABILITY_BY_SLOT_DB: Record<string, string> = {
  hull: 'iron_tomb', weapons: 'phase_cannon', shields: 'echo_shell', engine: 'overdrive',
};

/** Read a player's equipped loadout + ship level. Empty slots → default common. */
export async function loadPlayerShip(supabase: SupabaseClient, playerId: string) {
  const [{ data: shipRow }, { data: components }, { data: progress }] = await Promise.all([
    supabase.from('player_ships').select('*').eq('player_id', playerId).maybeSingle(),
    supabase.from('ship_components').select('*').eq('player_id', playerId),
    supabase.from('player_progress').select('ship_level').eq('player_id', playerId).maybeSingle(),
  ]);
  const bySlot = (slot: string): ShipComponent => {
    const id = (shipRow as Record<string, unknown> | null)?.[`${slot}_component_id`];
    const row = (components ?? []).find((c: { id: string }) => c.id === id);
    if (!row) return DEFAULT_COMPONENT(slot);
    return {
      id: row.id, slot, tier: row.tier,
      statMultiplier: COMPONENT_STAT_MULTIPLIERS[row.tier] ?? 1.0,
      ...(row.tier === 'ultra_rare' ? { ability: ABILITY_BY_SLOT_DB[slot] } : {}),
    };
  };
  return {
    ship: {
      playerId,
      hull: bySlot('hull'), weapons: bySlot('weapons'),
      shields: bySlot('shields'), engine: bySlot('engine'),
    } as PlayerShip,
    shipLevel: (progress?.ship_level as number | undefined) ?? 1,
  };
}

/** Upsert-and-return the caller's progress row. */
export async function getProgress(supabase: SupabaseClient, playerId: string) {
  await supabase.from('player_progress')
    .upsert({ player_id: playerId }, { onConflict: 'player_id', ignoreDuplicates: true });
  const { data: row } = await supabase.from('player_progress')
    .select('*').eq('player_id', playerId).single();
  return row!;
}

/** Grant xp/lumens/salvage and recompute level. Returns the new xp/level. */
export async function grantRewards(
  supabase: SupabaseClient, playerId: string, rewards: Rewards, currentXp: number,
) {
  const newXp = currentXp + rewards.xp;
  const newLevel = levelFromXp(newXp).level;
  await supabase.rpc('increment_progress', {
    p_player_id: playerId, p_xp: rewards.xp, p_salvage: rewards.salvage, p_level: newLevel,
  });
  if (rewards.lumens > 0) {
    await supabase.rpc('increment_lumens', { p_player_id: playerId, p_amount: rewards.lumens });
    await supabase.from('lumen_ledger').insert({
      player_id: playerId, delta: rewards.lumens, reason: 'battle_reward',
    });
  }
  return { xp: newXp, level: newLevel };
}
```

- [ ] **Step 2: Sanity-check the mirrors.** Diff each transcribed block against its source file by eye; the RNG class, `hashUUID`, tier tables, engine math, and reward numbers must be identical. No automated test exists for this file — the deploy + smoke tests in Tasks 10–12 are the check.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/battle.ts
git commit -m "feat: shared Deno battle module mirroring client game logic"
```

---

### Task 10: `battle-skirmish` Edge Function

**Files:**
- Create: `supabase/functions/battle-skirmish/index.ts`

**Interfaces:**
- Consumes: `../_shared/battle.ts` (Task 9); tables/RPCs from Task 8.
- Produces API: `POST /functions/v1/battle-skirmish` body `{ tierId: number }` →
  `200 { result: BattleResult, won: boolean, rewards: Rewards | null, progress: { xp, level, salvage, shipLevel }, player: { ship: PlayerShip, shipLevel: number }, opponent: { ship: PlayerShip, shipLevel: number, name: string, tierId: number } }`
  Errors: `401` no/bad auth; `400 { error: 'Invalid tierId' }`; `403 { error: 'Requires level N' }`.

- [ ] **Step 1: Write the function** — full contents:

```ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  serviceClient, getUser, json, loadPlayerShip, getProgress, grantRewards,
  SeededRNG, resolveBattle, SKIRMISH_TIERS, dailySeed, generateOpponent,
  fleetName, skirmishReward,
} from '../_shared/battle.ts';

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
  const supabase = serviceClient();
  const user = await getUser(req, supabase);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const { tierId } = await req.json().catch(() => ({}));
  const tier = SKIRMISH_TIERS.find((t) => t.id === tierId);
  if (!tier) return json({ error: 'Invalid tierId' }, 400);

  const progress = await getProgress(supabase, user.id);
  if (progress.level < tier.minLevel) {
    return json({ error: `Requires level ${tier.minLevel}` }, 403);
  }

  const player = await loadPlayerShip(supabase, user.id);
  const today = new Date().toISOString().slice(0, 10);
  const seed = dailySeed(user.id, tier.id, today);
  const opponentShip = generateOpponent(tier, seed);

  // Deterministic per (player, tier, day): same fight all day unless the
  // loadout changes — matches the daily-opponent + consolation design.
  const rng = new SeededRNG((seed ^ 0x9e3779b9) >>> 0);
  const result = resolveBattle(
    player.ship, opponentShip, rng, player.shipLevel, tier.opponentShipLevel,
  );
  const won = result.winnerId === user.id;

  let rewards = null;
  let newProgress = { xp: progress.xp, level: progress.level };
  if (won) {
    const { error: clearErr } = await supabase.from('skirmish_clears').insert({
      player_id: user.id, tier_id: tier.id, cleared_date: today,
    });
    const firstWinToday = !clearErr; // duplicate-key error → already cleared today
    rewards = skirmishReward(tier.id, firstWinToday);
    newProgress = await grantRewards(supabase, user.id, rewards, progress.xp);
  }

  return json({
    result,
    won,
    rewards,
    progress: {
      xp: newProgress.xp,
      level: newProgress.level,
      salvage: progress.salvage + (rewards?.salvage ?? 0),
      shipLevel: player.shipLevel,
    },
    player: { ship: player.ship, shipLevel: player.shipLevel },
    opponent: {
      ship: opponentShip, shipLevel: tier.opponentShipLevel,
      name: fleetName(seed), tierId: tier.id,
    },
  });
});
```

- [ ] **Step 2: Deploy**

Run: `supabase functions deploy battle-skirmish`
Expected: `Deployed Function battle-skirmish` (this also bundles `_shared/battle.ts`; a bundle error means a Task 9 mirror is broken — fix there).

- [ ] **Step 3: Smoke test with a real session token.** Get a token from the running app (log `session.access_token`) or the Supabase dashboard test user. Then:

```powershell
$token = "<paste access token>"
Invoke-RestMethod -Method Post -Uri "$env:EXPO_PUBLIC_SUPABASE_URL/functions/v1/battle-skirmish" -Headers @{ Authorization = "Bearer $token" } -ContentType 'application/json' -Body '{"tierId":1}'
```

Expected: JSON with `result.winnerId`, `won`, two-word `opponent.name`, `progress.level` ≥ 1. Call twice: a second win the same day returns `rewards.consolation: true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/battle-skirmish/index.ts
git commit -m "feat: battle-skirmish Edge Function (server-authoritative ladder fights)"
```

---

### Task 11: `battle-pvp` Edge Function

**Files:**
- Create: `supabase/functions/battle-pvp/index.ts`

**Interfaces:**
- Consumes: `../_shared/battle.ts`; `pvp_ladder` table + `swap_pvp_ranks` RPC from Task 8.
- Produces API: `POST /functions/v1/battle-pvp` body `{ defenderId: string }` →
  `200 { result, won, rewards: Rewards | null, progress: { xp, level, salvage, shipLevel }, player: { ship, shipLevel }, opponent: { ship, shipLevel, name: string, rank: number }, oldRank: number, newRank: number }`
  Errors: `401`; `400 { error: 'Invalid defenderId' | 'Not on ladder' | 'Defender not on ladder' }`; `403 { error: 'Defender out of challenge range' }`.

- [ ] **Step 1: Write the function** — full contents:

```ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  serviceClient, getUser, json, loadPlayerShip, getProgress, grantRewards,
  SeededRNG, resolveBattle, pvpReward, highestUnlockedTierId, BATTLE_CONST,
} from '../_shared/battle.ts';

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
  const supabase = serviceClient();
  const user = await getUser(req, supabase);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const { defenderId } = await req.json().catch(() => ({}));
  if (typeof defenderId !== 'string' || defenderId === user.id) {
    return json({ error: 'Invalid defenderId' }, 400);
  }

  const { data: me } = await supabase.from('pvp_ladder')
    .select('*').eq('player_id', user.id).maybeSingle();
  if (!me) return json({ error: 'Not on ladder' }, 400);
  const { data: them } = await supabase.from('pvp_ladder')
    .select('*').eq('player_id', defenderId).maybeSingle();
  if (!them) return json({ error: 'Defender not on ladder' }, 400);

  // Challenge upward only, within range (lower rank number = better).
  if (them.rank >= me.rank || me.rank - them.rank > BATTLE_CONST.PVP_CHALLENGE_RANGE) {
    return json({ error: 'Defender out of challenge range' }, 403);
  }

  const progress = await getProgress(supabase, user.id);
  const attacker = await loadPlayerShip(supabase, user.id);
  const defender = await loadPlayerShip(supabase, defenderId); // service role reads through RLS

  // Server entropy is fine here: a PvP fight never needs to replay
  // identically across calls (unlike daily skirmish opponents).
  const seed = Math.floor(Math.random() * 2 ** 32);
  const result = resolveBattle(
    attacker.ship, defender.ship, new SeededRNG(seed),
    attacker.shipLevel, defender.shipLevel,
  );
  const won = result.winnerId === user.id;

  const today = new Date().toISOString().slice(0, 10);
  let rewards = null;
  let newProgress = { xp: progress.xp, level: progress.level };
  let newRank = me.rank;
  if (won) {
    const winsToday = me.wins_date === today ? me.wins_today : 0;
    rewards = pvpReward(
      highestUnlockedTierId(progress.level),
      winsToday < BATTLE_CONST.PVP_DAILY_WIN_CAP,
    );
    newProgress = await grantRewards(supabase, user.id, rewards, progress.xp);
    await supabase.from('pvp_ladder')
      .update({ wins_today: winsToday + 1, wins_date: today })
      .eq('player_id', user.id);
    await supabase.rpc('swap_pvp_ranks', { p_winner: user.id, p_loser: defenderId });
    newRank = them.rank;
  }

  return json({
    result,
    won,
    rewards,
    progress: {
      xp: newProgress.xp,
      level: newProgress.level,
      salvage: progress.salvage + (rewards?.salvage ?? 0),
      shipLevel: attacker.shipLevel,
    },
    player: { ship: attacker.ship, shipLevel: attacker.shipLevel },
    opponent: {
      ship: defender.ship, shipLevel: defender.shipLevel,
      name: them.display_name, rank: them.rank,
    },
    oldRank: me.rank,
    newRank,
  });
});
```

- [ ] **Step 2: Deploy**

Run: `supabase functions deploy battle-pvp`
Expected: `Deployed Function battle-pvp`.

- [ ] **Step 3: Smoke test.** Needs two ladder rows: run `SELECT join_pvp_ladder();` as two test users in the Supabase SQL editor (or via the app once Task 14 lands). POST with the lower-ranked user's token and the higher-ranked user's UUID as `defenderId` (same PowerShell pattern as Task 10). Expected: `oldRank`/`newRank` in the response; on a win the two `pvp_ladder.rank` values are swapped; on a loss nothing changes.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/battle-pvp/index.ts
git commit -m "feat: battle-pvp Edge Function (rank-swap ladder duels)"
```

---

### Task 12: `battle-defense` + `use-item` Edge Functions, spin wormhole patch

**Files:**
- Create: `supabase/functions/battle-defense/index.ts`
- Create: `supabase/functions/use-item/index.ts`
- Modify: `supabase/functions/spin/index.ts` (rare-tier roll only)

**Interfaces:**
- Produces API 1: `POST /functions/v1/battle-defense` body `{ missionId: string, systemId: string }` →
  `200 { result, won, fragment: { slot: string, tier: string } | null, player: { ship, shipLevel }, opponent: { ship, shipLevel, name, dangerLevel } }`
  Errors: `401`; `400 { error: 'Unknown system' | 'No fragment contested for this mission' }`; `409 { error: 'Mission already claimed' }`; `429 { error: 'System on cooldown' }`.
- Produces API 2: `POST /functions/v1/use-item` body `{ itemType: 'wormhole' }` →
  `200 { ok: true, remaining: number }`; `400 { error: 'No wormhole available' | 'Unsupported itemType' }`; `401`.

- [ ] **Step 1: Write `battle-defense/index.ts`** — full contents:

```ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  serviceClient, getUser, json, loadPlayerShip,
  SeededRNG, hashUUID, resolveBattle, generateStarSystems,
  rollMissionEligibility, generateDefender, EXPLORATION,
} from '../_shared/battle.ts';

// Map seed derivation — MUST match uuidToSeed in src/stores/useExplorationStore.ts
function uuidToSeed(uuid: string): number {
  const hex = uuid.replace(/-/g, '').slice(0, 8);
  return parseInt(hex, 16) || 1;
}

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
  const supabase = serviceClient();
  const user = await getUser(req, supabase);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const { missionId, systemId } = await req.json().catch(() => ({}));
  if (typeof missionId !== 'string' || typeof systemId !== 'string') {
    return json({ error: 'Unknown system' }, 400);
  }

  // Regenerate the caller's deterministic map — no trust in client claims.
  const systems = generateStarSystems(uuidToSeed(user.id));
  const system = systems.find((s) => s.id === systemId);
  if (!system) return json({ error: 'Unknown system' }, 400);

  // Same eligibility roll the client previewed (seeded off missionId).
  const eligibility = rollMissionEligibility(missionId, system);
  if (!eligibility.eligible) {
    return json({ error: 'No fragment contested for this mission' }, 400);
  }

  // Per-system cooldown ≥ min travel time — makes missionId-minting useless.
  const { data: recent } = await supabase.from('claimed_missions')
    .select('claimed_at').eq('player_id', user.id).eq('system_id', systemId)
    .order('claimed_at', { ascending: false }).limit(1).maybeSingle();
  if (recent && Date.now() - new Date(recent.claimed_at).getTime() < EXPLORATION.TRAVEL_TIME_MIN_MS) {
    return json({ error: 'System on cooldown' }, 429);
  }

  // Dedupe: one attempt per mission, ever.
  const { error: claimErr } = await supabase.from('claimed_missions').insert({
    mission_id: missionId, player_id: user.id, system_id: systemId,
  });
  if (claimErr) return json({ error: 'Mission already claimed' }, 409);

  const player = await loadPlayerShip(supabase, user.id);
  const defSeed = hashUUID(missionId);
  const defender = generateDefender(system.dangerLevel, defSeed);
  const rng = new SeededRNG((defSeed ^ 0x5deece66) >>> 0);
  const result = resolveBattle(
    player.ship, defender.ship, rng, player.shipLevel, defender.shipLevel,
  );
  const won = result.winnerId === user.id;

  let fragment = null;
  if (won) {
    // Slot rolled deterministically from the mission too.
    const slots = ['hull', 'weapons', 'shields', 'engine'];
    const slot = slots[new SeededRNG((defSeed ^ 0x1f123bb5) >>> 0).int(0, 3)];
    await supabase.rpc('increment_fragment', { p_player_id: user.id, p_slot: slot });
    fragment = { slot, tier: eligibility.tier };
  }
  await supabase.from('claimed_missions').update({ won }).eq('mission_id', missionId);

  return json({
    result,
    won,
    fragment,
    player: { ship: player.ship, shipLevel: player.shipLevel },
    opponent: {
      ship: defender.ship, shipLevel: defender.shipLevel,
      name: defender.name, dangerLevel: system.dangerLevel,
    },
  });
});
```

- [ ] **Step 2: Write `use-item/index.ts`** — full contents:

```ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { serviceClient, getUser, json } from '../_shared/battle.ts';

const CONSUMABLE_TYPES = ['wormhole'];

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
  const supabase = serviceClient();
  const user = await getUser(req, supabase);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const { itemType } = await req.json().catch(() => ({}));
  if (!CONSUMABLE_TYPES.includes(itemType)) {
    return json({ error: 'Unsupported itemType' }, 400);
  }

  const { data: item } = await supabase.from('player_inventory')
    .select('id, quantity').eq('player_id', user.id).eq('item_type', itemType)
    .order('acquired_at').limit(1).maybeSingle();
  if (!item) return json({ error: `No ${itemType} available` }, 400);

  if (item.quantity <= 1) {
    await supabase.from('player_inventory').delete().eq('id', item.id);
  } else {
    await supabase.from('player_inventory')
      .update({ quantity: item.quantity - 1 }).eq('id', item.id);
  }
  return json({ ok: true, remaining: Math.max(0, item.quantity - 1) });
});
```

- [ ] **Step 3: Patch the spin function's rare roll.** In `supabase/functions/spin/index.ts`, `rollItem`'s `case 'rare':` currently reads:

```ts
case 'rare':      return rng.next() < 0.4 ? { itemType: 'ship_component', itemData: { tier: 'rare', slot: pickSlot(rng) } } : { itemType: 'blueprint', itemData: { buildingTier: 'advanced' } };
```

Replace with (must match the client change from Task 7 — 40/40/20):

```ts
case 'rare': {
  const r = rng.next();
  if (r < 0.4) return { itemType: 'ship_component', itemData: { tier: 'rare', slot: pickSlot(rng) } };
  if (r < 0.8) return { itemType: 'blueprint', itemData: { buildingTier: 'advanced' } };
  return { itemType: 'wormhole', itemData: {} };
}
```

- [ ] **Step 4: Deploy all three**

Run: `supabase functions deploy battle-defense; supabase functions deploy use-item; supabase functions deploy spin`
Expected: three `Deployed Function ...` lines; `supabase functions list` shows all ACTIVE.

- [ ] **Step 5: Smoke test defense idempotency.** POST `battle-defense` twice with the same `{missionId, systemId}` (a real system id from the test user's map, e.g. `sys-3`; missionId shaped like `mission-sys-3-1719900000000`). Eligibility is an ~8–14% roll, so try a few missionIds until one returns 200. Then: same missionId again → 409; a fresh missionId on the same system inside 90s → 429.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/battle-defense/index.ts supabase/functions/use-item/index.ts supabase/functions/spin/index.ts
git commit -m "feat: battle-defense + use-item Edge Functions; wormhole in server spin table"
```

---

## Phase 3 — Shared visuals, store, timeline

### Task 13: Theme tokens + SpaceBackground

**Files:**
- Modify: `src/constants/theme.ts`
- Create: `src/ui/common/SpaceBackground.tsx`

**Interfaces:**
- Produces: extended `COLORS` (new tokens below), new `GRADIENTS` and `BATTLE_COLORS` exports from `@/src/constants/theme`; `<SpaceBackground variant? seed? focalGlow? />` component from `@/src/ui/common/SpaceBackground`.

- [ ] **Step 1: Extend `src/constants/theme.ts`** — add inside `COLORS`:

```ts
  backgroundDeep: '#070912',
  surfaceRaised:  '#1B2440',
  borderBright:   '#3A4A78',
  success:        '#10B981',
  primaryGlow:    '#5EC8FF33',
  accentGlow:     '#FFB45433',
  successGlow:    '#10B98122',
  starFaint:      '#8FA3C8',
  starMid:        '#C9D6F2',
  starBright:     '#FFFFFF',
  nebulaIndigo:   '#1B2A5E',
  nebulaViolet:   '#3A1B5E',
  nebulaEmber:    '#7A2E4A',
```

and append after the `FONT` block:

```ts
export const GRADIENTS = {
  screen:       ['#0B0E1A', '#070912'],
  card:         ['#1B2440', '#141A2E'],
  primaryBtn:   ['#5EC8FF', '#3D9BFF'],
  accentBtn:    ['#FFB454', '#FF8A3D'],
  reelBackdrop: ['#10162B', '#0B0E1A'],
} as const;

/** Battle-replay palette (visual spec §A0). */
export const BATTLE_COLORS = {
  abilityPhase:     '#B45BFF',
  abilityTomb:      COLORS.accent,
  abilityOverdrive: COLORS.danger,
  abilityEcho:      COLORS.primary,
  hpHigh:           '#4CAF50',
  hpMid:            COLORS.accent,
  hpLow:            COLORS.danger,
  ghostDamage:      '#FF5E7A99',
} as const;
```

- [ ] **Step 2: Create `src/ui/common/SpaceBackground.tsx`** — full contents (values from visual spec §B1):

```tsx
import { useEffect, useMemo } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import {
  Canvas, Circle, Group, Rect, LinearGradient, RadialGradient, vec,
} from '@shopify/react-native-skia';
import {
  Easing, useDerivedValue, useSharedValue, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { COLORS, GRADIENTS } from '@/src/constants/theme';

// Deterministic star layout per seed — presentation-only randomness.
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Star { x: number; y: number; r: number; baseOpacity: number; color: string; }

type Variant = 'default' | 'battle';

interface Props {
  variant?: Variant;
  /** Stable per-screen seed so layouts don't shuffle between mounts. */
  seed?: number;
  /** Optional spotlight, fractions of width/height (visual spec §B2.1). */
  focalGlow?: { cx: number; cy: number; r: number; color: string };
}

const DENSITY: Record<Variant, { a: number; b: number; c: number }> = {
  default: { a: 2.4, b: 1.2, c: 0.5 },
  battle:  { a: 3.6, b: 1.8, c: 0.75 },
};
const TWINKLE: Record<Variant, { periods: [number, number]; min: number; bShare: number }> = {
  default: { periods: [2800, 3700], min: 0.55, bShare: 0.3 },
  battle:  { periods: [1600, 2300], min: 0.40, bShare: 0.5 },
};

export function SpaceBackground({ variant = 'default', seed = 1337, focalGlow }: Props) {
  const { width, height } = useWindowDimensions();
  const isBattle = variant === 'battle';

  const { staticStars, twinkleA, twinkleB } = useMemo(() => {
    const rng = mulberry32(seed);
    const count = (d: number) => Math.round((d * width * height) / 10_000);
    const make = (n: number, rMin: number, rMax: number, oMin: number, oMax: number, color: string): Star[] =>
      Array.from({ length: n }, () => ({
        x: rng() * width, y: rng() * height,
        r: rMin + rng() * (rMax - rMin),
        baseOpacity: oMin + rng() * (oMax - oMin),
        color,
      }));
    const d = DENSITY[variant];
    const layerA = make(count(d.a), 0.5, 1.0, 0.15, 0.35, COLORS.starFaint);
    const layerB = make(count(d.b), 1.0, 1.8, 0.30, 0.60, COLORS.starMid);
    const layerC = make(count(d.c), 1.8, 2.6, 0.55, 0.90, COLORS.starBright);
    if (layerC.length >= 3) {
      layerC[0].color = COLORS.primary;
      layerC[1].color = COLORS.primary;
      layerC[2].color = COLORS.accent;
    }
    const t = TWINKLE[variant];
    const bFlags = layerB.map(() => rng() < t.bShare);
    const twinklers = [...layerC, ...layerB.filter((_, i) => bFlags[i])];
    return {
      staticStars: [...layerA, ...layerB.filter((_, i) => !bFlags[i])],
      twinkleA: twinklers.filter((_, i) => i % 2 === 0),
      twinkleB: twinklers.filter((_, i) => i % 2 === 1),
    };
  }, [seed, width, height, variant]);

  // Exactly 3 shared values; zero per-frame JS (visual spec §B1 strategy).
  const t = TWINKLE[variant];
  const g1 = useSharedValue(t.min);
  const g2 = useSharedValue(1);
  const drift = useSharedValue(0);

  useEffect(() => {
    const loop = (min: number, period: number) =>
      withRepeat(
        withSequence(
          withTiming(1, { duration: period / 2, easing: Easing.inOut(Easing.quad) }),
          withTiming(min, { duration: period / 2, easing: Easing.inOut(Easing.quad) }),
        ),
        -1, false,
      );
    g1.value = loop(t.min, t.periods[0]);
    g2.value = loop(t.min, t.periods[1]);
    if (isBattle) {
      drift.value = -8;
      drift.value = withRepeat(
        withTiming(8, { duration: 14_000, easing: Easing.inOut(Easing.quad) }),
        -1, true,
      );
    }
  }, [g1, g2, drift, isBattle, t.min, t.periods]);

  const driftTransform = useDerivedValue(() => [{ translateY: drift.value }]);

  const nebulaAlpha = isBattle ? ['42', '38'] : ['33', '29'];
  const blob = (cx: number, cy: number, r: number, color: string, a: string) => (
    <Circle cx={cx} cy={cy} r={r}>
      <RadialGradient
        c={vec(cx, cy)} r={r}
        colors={[`${color}${a}`, `${color}14`, '#00000000']}
        positions={[0, 0.55, 1]}
      />
    </Circle>
  );

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Rect x={0} y={0} width={width} height={height}>
        <LinearGradient start={vec(0, 0)} end={vec(0, height)} colors={[...GRADIENTS.screen]} />
      </Rect>

      {blob(0.18 * width, 0.12 * height, 0.55 * width, COLORS.nebulaIndigo, nebulaAlpha[0])}
      {blob(0.88 * width, 0.68 * height, 0.48 * width, COLORS.nebulaViolet, nebulaAlpha[1])}
      {isBattle && blob(0.5 * width, 0.95 * height, 0.7 * width, COLORS.nebulaEmber, '2E')}

      {focalGlow && (
        <Circle cx={focalGlow.cx * width} cy={focalGlow.cy * height} r={focalGlow.r * width}>
          <RadialGradient
            c={vec(focalGlow.cx * width, focalGlow.cy * height)} r={focalGlow.r * width}
            colors={[focalGlow.color, '#00000000']}
          />
        </Circle>
      )}

      {/* Layer A never moves; B+C drift together in battle for parallax */}
      {staticStars.filter(s => s.color === COLORS.starFaint).map((s, i) => (
        <Circle key={`a-${i}`} cx={s.x} cy={s.y} r={s.r} color={s.color} opacity={s.baseOpacity} />
      ))}
      <Group transform={driftTransform}>
        {staticStars.filter(s => s.color !== COLORS.starFaint).map((s, i) => (
          <Circle key={`b-${i}`} cx={s.x} cy={s.y} r={s.r} color={s.color} opacity={s.baseOpacity} />
        ))}
        <Group opacity={g1}>
          {twinkleA.map((s, i) => (
            <Circle key={`t1-${i}`} cx={s.x} cy={s.y} r={s.r} color={s.color} opacity={s.baseOpacity} />
          ))}
        </Group>
        <Group opacity={g2}>
          {twinkleB.map((s, i) => (
            <Circle key={`t2-${i}`} cx={s.x} cy={s.y} r={s.r} color={s.color} opacity={s.baseOpacity} />
          ))}
        </Group>
      </Group>

      {isBattle && (
        <Rect x={0} y={0} width={width} height={height}>
          <LinearGradient
            start={vec(0, 0)} end={vec(0, height)}
            colors={['#070912CC', '#07091200', '#07091200', '#070912CC']}
            positions={[0, 0.2, 0.8, 1]}
          />
        </Rect>
      )}
    </Canvas>
  );
}
```

Note: ~150 static `<Circle>` elements render in one Skia pass — within budget (the visual spec's `createPicture` variant is an optional optimization; only reach for it if the Task 24 emulator pass shows jank).

- [ ] **Step 3: Typecheck + full test suite**

Run: `npx tsc --noEmit` then `npm test`
Expected: clean / baseline pass count.

- [ ] **Step 4: Commit**

```bash
git add src/constants/theme.ts src/ui/common/SpaceBackground.tsx
git commit -m "feat: theme tokens (gradients, battle palette) + shared Skia SpaceBackground"
```

---

### Task 14: `useBattleStore`

**Files:**
- Create: `src/stores/useBattleStore.ts`
- Test: `src/stores/useBattleStore.test.ts`

**Interfaces:**
- Consumes: Edge Function APIs (Tasks 10–12), `join_pvp_ladder`/`upgrade_ship` RPCs (Task 8), `levelFromXp` (Task 2), `BattleRewards` (Task 5), ship types.
- Produces (used by all battle UI + exploration flow):

```ts
export type BattleSource = 'skirmish' | 'pvp' | 'defense';
export interface PendingBattle {
  source: BattleSource;
  result: BattleResult;
  won: boolean;
  rewards: BattleRewards | null;
  player: { ship: PlayerShip; shipLevel: number };
  opponent: { ship: PlayerShip; shipLevel: number; name: string };
  oldRank?: number;
  newRank?: number;
  fragment?: { slot: ComponentSlot; tier: ComponentTier } | null;
  tierId?: number;
}
export interface BattleProgress {
  xp: number; level: number; intoLevel: number; toNext: number;
  salvage: number; shipLevel: number;
}
export interface Rival { playerId: string; rank: number; displayName: string; }
```

Store shape: `{ progress, rank, rivals, clearedTiers, pendingBattle, isChallenging, error, fetchProgress(), fetchRivals(), challengeSkirmish(tierId), challengePvp(defenderId), challengeDefense(missionId, systemId), levelUpShip(), clearPendingBattle() }`.

- [ ] **Step 1: Write failing tests** — `src/stores/useBattleStore.test.ts`:

```ts
import { useBattleStore } from './useBattleStore';

jest.mock('@/src/services/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: { user: { id: 'me' }, access_token: 'tok' } },
      }),
    },
    rpc: jest.fn(),
    from: jest.fn(),
  },
}));
import { supabase } from '@/src/services/supabase';

const FN_RESPONSE = {
  result: { winnerId: 'me', loserId: 'ai:skirmish:1', log: [], turns: 0 },
  won: true,
  rewards: { xp: 50, lumens: 25, salvage: 10, consolation: false },
  progress: { xp: 50, level: 1, salvage: 10, shipLevel: 1 },
  player: { ship: {} as never, shipLevel: 1 },
  opponent: { ship: {} as never, shipLevel: 1, name: 'Crimson Talons', tierId: 1 },
};

beforeEach(() => {
  useBattleStore.setState({
    progress: null, rank: null, rivals: [], clearedTiers: [],
    pendingBattle: null, isChallenging: false, error: null,
  });
  global.fetch = jest.fn();
});

describe('challengeSkirmish', () => {
  it('stores pendingBattle, progress, and daily clear on a full win', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true, json: async () => FN_RESPONSE,
    });
    await useBattleStore.getState().challengeSkirmish(1);
    const s = useBattleStore.getState();
    expect(s.pendingBattle?.source).toBe('skirmish');
    expect(s.pendingBattle?.opponent.name).toBe('Crimson Talons');
    expect(s.progress?.xp).toBe(50);
    expect(s.clearedTiers).toContain(1);
    expect(s.isChallenging).toBe(false);
  });
  it('sets error (no pendingBattle) on a failed call', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false, json: async () => ({ error: 'Requires level 3' }),
    });
    await useBattleStore.getState().challengeSkirmish(2);
    const s = useBattleStore.getState();
    expect(s.error).toBe('Requires level 3');
    expect(s.pendingBattle).toBeNull();
  });
});

describe('levelUpShip', () => {
  it('applies the RPC result to progress', async () => {
    useBattleStore.setState({
      progress: { xp: 0, level: 1, intoLevel: 0, toNext: 100, salvage: 50, shipLevel: 1 },
    });
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { shipLevel: 2, salvage: 40, lumens: 800 }, error: null,
    });
    await useBattleStore.getState().levelUpShip();
    expect(useBattleStore.getState().progress?.shipLevel).toBe(2);
    expect(useBattleStore.getState().progress?.salvage).toBe(40);
  });
  it('surfaces server-side validation errors', async () => {
    useBattleStore.setState({
      progress: { xp: 0, level: 1, intoLevel: 0, toNext: 100, salvage: 0, shipLevel: 1 },
    });
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { error: 'Not enough Salvage' }, error: null,
    });
    await useBattleStore.getState().levelUpShip();
    expect(useBattleStore.getState().error).toBe('Not enough Salvage');
    expect(useBattleStore.getState().progress?.shipLevel).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/stores/useBattleStore.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `src/stores/useBattleStore.ts`:

```ts
import { create } from 'zustand';
import { supabase } from '@/src/services/supabase';
import { levelFromXp } from '@/src/game/battle/xp';
import type { BattleRewards } from '@/src/game/battle/rewards';
import type { BattleResult, PlayerShip, ComponentSlot, ComponentTier } from '@/src/game/ships/types';

export type BattleSource = 'skirmish' | 'pvp' | 'defense';

export interface PendingBattle {
  source: BattleSource;
  result: BattleResult;
  won: boolean;
  rewards: BattleRewards | null;
  player: { ship: PlayerShip; shipLevel: number };
  opponent: { ship: PlayerShip; shipLevel: number; name: string };
  oldRank?: number;
  newRank?: number;
  fragment?: { slot: ComponentSlot; tier: ComponentTier } | null;
  tierId?: number;
}

export interface BattleProgress {
  xp: number; level: number; intoLevel: number; toNext: number;
  salvage: number; shipLevel: number;
}

export interface Rival { playerId: string; rank: number; displayName: string; }

async function callFn(name: string, body: unknown): Promise<Record<string, unknown>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');
  const res = await fetch(
    `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/${name}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `${name} failed`);
  return json as Record<string, unknown>;
}

function toProgress(p: { xp: number; level: number; salvage: number; shipLevel: number }): BattleProgress {
  const lp = levelFromXp(p.xp);
  return {
    xp: p.xp, level: lp.level, intoLevel: lp.intoLevel, toNext: lp.toNext,
    salvage: p.salvage, shipLevel: p.shipLevel,
  };
}

interface BattleStore {
  progress: BattleProgress | null;
  rank: number | null;
  rivals: Rival[];
  clearedTiers: number[];        // tier ids fully rewarded today
  pendingBattle: PendingBattle | null;
  isChallenging: boolean;
  error: string | null;
  fetchProgress(): Promise<void>;
  fetchRivals(): Promise<void>;
  challengeSkirmish(tierId: number): Promise<void>;
  challengePvp(defenderId: string): Promise<void>;
  challengeDefense(missionId: string, systemId: string): Promise<void>;
  levelUpShip(): Promise<void>;
  clearPendingBattle(): void;
}

export const useBattleStore = create<BattleStore>((set, get) => ({
  progress: null,
  rank: null,
  rivals: [],
  clearedTiers: [],
  pendingBattle: null,
  isChallenging: false,
  error: null,

  fetchProgress: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const playerId = session.user.id;
    const today = new Date().toISOString().slice(0, 10);

    const [{ data: rank }, { data: row }, { data: clears }] = await Promise.all([
      supabase.rpc('join_pvp_ladder'),
      supabase.from('player_progress').select('*').eq('player_id', playerId).maybeSingle(),
      supabase.from('skirmish_clears').select('tier_id')
        .eq('player_id', playerId).eq('cleared_date', today),
    ]);

    set({
      rank: (rank as number | null) ?? null,
      clearedTiers: (clears ?? []).map(c => c.tier_id as number),
      progress: toProgress({
        xp: row?.xp ?? 0,
        level: row?.level ?? 1,
        salvage: row?.salvage ?? 0,
        shipLevel: row?.ship_level ?? 1,
      }),
    });
  },

  fetchRivals: async () => {
    const { rank } = get();
    if (rank == null) return;
    const { data } = await supabase.from('pvp_ladder')
      .select('player_id, rank, display_name')
      .gte('rank', Math.max(1, rank - 5)).lt('rank', rank)
      .order('rank', { ascending: true });
    set({
      rivals: (data ?? []).map(r => ({
        playerId: r.player_id as string,
        rank: r.rank as number,
        displayName: r.display_name as string,
      })),
    });
  },

  challengeSkirmish: async (tierId) => {
    set({ isChallenging: true, error: null });
    try {
      const r = await callFn('battle-skirmish', { tierId }) as unknown as {
        result: BattleResult; won: boolean; rewards: BattleRewards | null;
        progress: { xp: number; level: number; salvage: number; shipLevel: number };
        player: PendingBattle['player'];
        opponent: { ship: PlayerShip; shipLevel: number; name: string; tierId: number };
      };
      set(s => ({
        pendingBattle: {
          source: 'skirmish', result: r.result, won: r.won, rewards: r.rewards,
          player: r.player, opponent: r.opponent, tierId: r.opponent.tierId,
        },
        progress: toProgress(r.progress),
        clearedTiers: r.won && r.rewards && !r.rewards.consolation
          ? [...new Set([...s.clearedTiers, tierId])]
          : s.clearedTiers,
        isChallenging: false,
      }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Battle failed', isChallenging: false });
    }
  },

  challengePvp: async (defenderId) => {
    set({ isChallenging: true, error: null });
    try {
      const r = await callFn('battle-pvp', { defenderId }) as unknown as {
        result: BattleResult; won: boolean; rewards: BattleRewards | null;
        progress: { xp: number; level: number; salvage: number; shipLevel: number };
        player: PendingBattle['player'];
        opponent: { ship: PlayerShip; shipLevel: number; name: string; rank: number };
        oldRank: number; newRank: number;
      };
      set({
        pendingBattle: {
          source: 'pvp', result: r.result, won: r.won, rewards: r.rewards,
          player: r.player, opponent: r.opponent,
          oldRank: r.oldRank, newRank: r.newRank,
        },
        progress: toProgress(r.progress),
        rank: r.newRank,
        isChallenging: false,
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Battle failed', isChallenging: false });
    }
  },

  challengeDefense: async (missionId, systemId) => {
    set({ isChallenging: true, error: null });
    try {
      const r = await callFn('battle-defense', { missionId, systemId }) as unknown as {
        result: BattleResult; won: boolean;
        fragment: { slot: ComponentSlot; tier: ComponentTier } | null;
        player: PendingBattle['player'];
        opponent: { ship: PlayerShip; shipLevel: number; name: string; dangerLevel: number };
      };
      set({
        pendingBattle: {
          source: 'defense', result: r.result, won: r.won, rewards: null,
          player: r.player, opponent: r.opponent, fragment: r.fragment,
        },
        isChallenging: false,
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Battle failed', isChallenging: false });
    }
  },

  levelUpShip: async () => {
    set({ error: null });
    const { data, error } = await supabase.rpc('upgrade_ship');
    if (error) { set({ error: error.message }); return; }
    const result = data as { error?: string; shipLevel?: number; salvage?: number };
    if (result?.error) { set({ error: result.error }); return; }
    set(s => ({
      progress: s.progress
        ? { ...s.progress, shipLevel: result.shipLevel!, salvage: result.salvage! }
        : s.progress,
    }));
  },

  clearPendingBattle: () => set({ pendingBattle: null }),
}));
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/stores/useBattleStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/useBattleStore.ts src/stores/useBattleStore.test.ts
git commit -m "feat: useBattleStore — progress, ladder, challenge + upgrade actions"
```

---

### Task 15: Replay timeline builder

**Files:**
- Create: `src/ui/battle/timeline.ts`
- Test: `src/ui/battle/timeline.test.ts`

**Interfaces:**
- Consumes: `BASE_DAMAGE`, `BASE_SHIELD`, `buildCombatant` (Task 3 exports), `shipLevelMultiplier` (Task 2), `ULTRA_RARE_ABILITIES` (constants), battle types.
- Produces (Tasks 17–18 drive all animation from this):

```ts
export interface Beat {
  event: BattleEvent;
  startMs: number;
  durationMs: number;
  /** State AFTER this beat resolves. */
  hp: Record<string, number>;
  shield: Record<string, number>;
  echoCharges: Record<string, number>;
  /** True when this attack bypassed shields (phase cannon). */
  bypass: boolean;
}
export interface ReplayTimeline {
  beats: Beat[];
  totalMs: number;
  maxHp: Record<string, number>;
  maxShield: Record<string, number>;
  attackerId: string;
  defenderId: string;
  winnerId: string;
}
export function buildTimeline(
  player: { ship: PlayerShip; shipLevel: number },
  opponent: { ship: PlayerShip; shipLevel: number },
  result: BattleResult,
): ReplayTimeline;
```

The builder **derives** display state by replaying the log's arithmetic (visual spec §A2.0) — it never re-decides outcomes. Log semantics (from `CombatEngine.ts`): `attack.value` = hull damage after absorption; shield absorb = `min(shield, attackerDamage)` on non-bypass attacks; `reflect.value` hits the reflect event's `targetId`; `overdrive_burst.value` hits the target and costs the actor `round(maxHp × 0.10)`; an `attack` immediately following a `phase_bypass` by the same actor in the same turn skips shields; `ability_block` cancels the preceding `phase_bypass` (no attack follows).

- [ ] **Step 1: Write failing tests** — `src/ui/battle/timeline.test.ts`:

```ts
import { buildTimeline } from './timeline';
import { resolveBattle } from '@/src/game/ships/CombatEngine';
import { SeededRNG } from '@/src/game/rng';
import { COMPONENT_STAT_MULTIPLIERS } from '@/src/constants/game';
import type { PlayerShip, ComponentTier, ComponentSlot } from '@/src/game/ships/types';

function comp(slot: ComponentSlot, tier: ComponentTier): PlayerShip['hull'] {
  return { id: `${slot}-${tier}`, slot, tier, statMultiplier: COMPONENT_STAT_MULTIPLIERS[tier] };
}
function ship(id: string, tiers: Partial<Record<ComponentSlot, ComponentTier>> = {}): PlayerShip {
  return {
    playerId: id,
    hull: comp('hull', tiers.hull ?? 'common'),
    weapons: comp('weapons', tiers.weapons ?? 'common'),
    shields: comp('shields', tiers.shields ?? 'common'),
    engine: comp('engine', tiers.engine ?? 'common'),
  };
}

describe('buildTimeline', () => {
  const a = { ship: ship('me'), shipLevel: 1 };
  const b = { ship: ship('foe'), shipLevel: 1 };
  const result = resolveBattle(a.ship, b.ship, new SeededRNG(1));
  const tl = buildTimeline(a, b, result);

  it('produces one beat per log event with increasing startMs', () => {
    expect(tl.beats).toHaveLength(result.log.length);
    for (let i = 1; i < tl.beats.length; i++) {
      expect(tl.beats[i].startMs).toBeGreaterThan(tl.beats[i - 1].startMs);
    }
  });
  it('never lets shields or hp go below floor invariants', () => {
    for (const beat of tl.beats) {
      expect(beat.shield.me).toBeGreaterThanOrEqual(0);
      expect(beat.shield.foe).toBeGreaterThanOrEqual(0);
    }
  });
  it('ends with the winner at higher hp than the loser', () => {
    const last = tl.beats[tl.beats.length - 1];
    const loser = result.loserId;
    expect(last.hp[result.winnerId]).toBeGreaterThan(last.hp[loser]);
  });
  it('caps the total runtime at 28s', () => {
    expect(tl.totalMs).toBeLessThanOrEqual(28_000);
  });
  it('fully-absorbed hits reduce shields but not hp', () => {
    // legendary shields (1100) vs common damage (100): turn-1 hits absorb fully
    const tank = { ship: ship('tank', { shields: 'legendary' }), shipLevel: 1 };
    const glass = { ship: ship('glass'), shipLevel: 1 };
    const r = resolveBattle(glass.ship, tank.ship, new SeededRNG(2));
    const t = buildTimeline(glass, tank, r);
    const firstHitOnTank = t.beats.find(
      bt => bt.event.type === 'attack' && bt.event.targetId === 'tank',
    )!;
    expect(firstHitOnTank.hp.tank).toBe(t.maxHp.tank);
    expect(firstHitOnTank.shield.tank).toBe(t.maxShield.tank - 100);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/ui/battle/timeline.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `src/ui/battle/timeline.ts`:

```ts
import type { PlayerShip, BattleEvent, BattleResult } from '@/src/game/ships/types';
import { BASE_DAMAGE, BASE_SHIELD, buildCombatant } from '@/src/game/ships/CombatEngine';
import { shipLevelMultiplier } from '@/src/game/battle/leveling';
import { ULTRA_RARE_ABILITIES } from '@/src/constants/game';

export interface Beat {
  event: BattleEvent;
  startMs: number;
  durationMs: number;
  hp: Record<string, number>;
  shield: Record<string, number>;
  echoCharges: Record<string, number>;
  bypass: boolean;
}

export interface ReplayTimeline {
  beats: Beat[];
  totalMs: number;
  maxHp: Record<string, number>;
  maxShield: Record<string, number>;
  attackerId: string;
  defenderId: string;
  winnerId: string;
}

// Pacing per visual spec §A2.2: [turns 1–3, 4–8, 9+], inter-beat gap folded in.
const PACE: Record<BattleEvent['type'], [number, number, number]> = {
  attack:          [780, 620, 460],
  phase_bypass:    [650, 650, 500],
  ability_block:   [900, 900, 700],
  reflect:         [520, 520, 420],
  overdrive_burst: [1600, 1600, 1600],
};
const GAP: [number, number, number] = [120, 120, 80];
const CAP_MS = 28_000;
const MIN_BEAT_MS = 380;

function band(turn: number): 0 | 1 | 2 {
  return turn <= 3 ? 0 : turn <= 8 ? 1 : 2;
}

export function buildTimeline(
  player: { ship: PlayerShip; shipLevel: number },
  opponent: { ship: PlayerShip; shipLevel: number },
  result: BattleResult,
): ReplayTimeline {
  const sides = [player, opponent];
  const hp: Record<string, number> = {};
  const shield: Record<string, number> = {};
  const echoCharges: Record<string, number> = {};
  const damageOf: Record<string, number> = {};
  const maxHp: Record<string, number> = {};
  const maxShield: Record<string, number> = {};

  for (const side of sides) {
    const id = side.ship.playerId;
    const mult = shipLevelMultiplier(side.shipLevel);
    const combatant = buildCombatant(side.ship, side.shipLevel);
    hp[id] = combatant.maxHp;
    maxHp[id] = combatant.maxHp;
    shield[id] = Math.round(BASE_SHIELD * side.ship.shields.statMultiplier * mult);
    maxShield[id] = shield[id];
    damageOf[id] = Math.round(BASE_DAMAGE * side.ship.weapons.statMultiplier * mult);
    echoCharges[id] = side.ship.shields.ability === 'echo_shell'
      ? ULTRA_RARE_ABILITIES.ECHO_SHELL_MAX_CHARGES : 0;
  }

  const beats: Beat[] = [];
  const pendingBypass: Record<string, boolean> = {};
  let clock = 0;

  for (const event of result.log) {
    const b = band(event.turn);
    let bypass = false;

    switch (event.type) {
      case 'overdrive_burst': {
        hp[event.actorId] -= Math.round(
          maxHp[event.actorId] * ULTRA_RARE_ABILITIES.OVERDRIVE_HP_COST_PERCENT,
        );
        hp[event.targetId] -= event.value;
        break;
      }
      case 'phase_bypass': {
        pendingBypass[event.actorId] = true;
        break;
      }
      case 'ability_block': {
        // Iron Tomb: event.targetId is the attacker whose bypass got cancelled.
        pendingBypass[event.targetId] = false;
        break;
      }
      case 'attack': {
        if (pendingBypass[event.actorId]) {
          pendingBypass[event.actorId] = false;
          bypass = true;
          hp[event.targetId] -= event.value;
        } else {
          const absorbed = Math.min(shield[event.targetId], damageOf[event.actorId]);
          shield[event.targetId] -= absorbed;
          hp[event.targetId] -= event.value;
        }
        break;
      }
      case 'reflect': {
        hp[event.targetId] -= event.value;
        echoCharges[event.actorId] = Math.max(0, echoCharges[event.actorId] - 1);
        break;
      }
    }

    const durationMs = PACE[event.type][b] + GAP[b];
    beats.push({
      event, startMs: clock, durationMs,
      hp: { ...hp }, shield: { ...shield }, echoCharges: { ...echoCharges },
      bypass,
    });
    clock += durationMs;
  }

  // Global cap (visual spec §A2.2): long grinds accelerate, opening breathes.
  if (clock > CAP_MS) {
    const scale = CAP_MS / clock;
    let t = 0;
    for (const beat of beats) {
      beat.durationMs = Math.max(MIN_BEAT_MS, Math.round(beat.durationMs * scale));
      beat.startMs = t;
      t += beat.durationMs;
    }
    clock = t;
  }

  return {
    beats,
    totalMs: Math.min(clock, Math.max(clock, 0)),
    maxHp,
    maxShield,
    attackerId: player.ship.playerId,
    defenderId: opponent.ship.playerId,
    winnerId: result.winnerId,
  };
}
```

Note: after MIN_BEAT_MS flooring, `totalMs` can exceed 28s only for absurdly long logs (>73 beats — impossible under `MAX_TURNS = 50` producing ≤ ~110 events; if the cap test fails on an extreme seed, floor at 300 instead — spec allows flooring).

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/ui/battle/timeline.test.ts`
Expected: PASS. If the 28s-cap test fails due to the floor, adjust `MIN_BEAT_MS` down (280–380 range is acceptable per spec) and re-run.

- [ ] **Step 5: Commit**

```bash
git add src/ui/battle/timeline.ts src/ui/battle/timeline.test.ts
git commit -m "feat: replay timeline builder deriving per-beat hp/shield state from battle logs"
```

---

## Phase 4 — Battle UI

### Task 16: BattleScreen launcher + TierCard + RivalCard

**Files:**
- Create: `src/ui/battle/BattleScreen.tsx`, `src/ui/battle/TierCard.tsx`, `src/ui/battle/RivalCard.tsx`, `src/ui/battle/index.ts`

**Interfaces:**
- Consumes: `useBattleStore` (Task 14), `useEconomyStore.lumenBalance`/`fetchBalance` (existing), `SKIRMISH_TIERS`/`dailySeed`/`fleetName`/`highestUnlockedTier`/`skirmishReward` (`@/src/game/battle`), `SpaceBackground`, `GRADIENTS`.
- Produces: `<BattleScreen />` exported from `@/src/ui/battle` (route wiring happens in Task 19 — until then nothing renders it). Visual layout per visual spec §A1 (header, one featured card, tier list, rival list).

- [ ] **Step 1: Create `TierCard.tsx`** — full contents:

```tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, FONT, RADIUS, SPACING } from '@/src/constants/theme';
import { skirmishReward } from '@/src/game/battle';
import type { SkirmishTier } from '@/src/game/battle';

interface Props {
  tier: SkirmishTier;
  locked: boolean;
  cleared: boolean;   // full reward already claimed today
  featured: boolean;  // highest unlocked tier — exactly one card
  fleetName: string;  // today's generated opponent fleet
  onPress(): void;
}

export function TierCard({ tier, locked, cleared, featured, fleetName, onPress }: Props) {
  const rewards = skirmishReward(tier.id, true);
  return (
    <Pressable
      onPress={onPress}
      disabled={locked}
      style={({ pressed }) => [
        styles.card,
        featured && styles.featured,
        featured && { borderColor: tier.accent },
        locked && styles.locked,
        pressed && !locked && { transform: [{ scale: 0.98 }] },
      ]}
    >
      <View style={[
        styles.accentBar,
        { backgroundColor: locked ? COLORS.border : cleared ? `${tier.accent}80` : tier.accent },
      ]} />
      <View style={[styles.emblem, { backgroundColor: `${tier.accent}20` }, featured && styles.emblemBig]}>
        <Text style={featured ? styles.glyphBig : styles.glyph}>{locked ? '🔒' : tier.glyph}</Text>
      </View>
      <View style={styles.middle}>
        <Text style={[styles.name, featured && styles.nameBig]}>{tier.name}</Text>
        <Text style={styles.sub} numberOfLines={1}>
          {locked ? `Unlocks at Level ${tier.minLevel}` : `${fleetName} · Ship Lv ${tier.opponentShipLevel}`}
        </Text>
      </View>
      {cleared ? (
        <Text style={styles.clearedChip}>✓ CLEARED · 15% until reset</Text>
      ) : (
        <View style={styles.rewards}>
          <Text style={[styles.rewardChip, { color: COLORS.text }]}>+{rewards.xp} XP</Text>
          <Text style={[styles.rewardChip, { color: COLORS.accent }]}>+{rewards.lumens} ✦</Text>
          <Text style={[styles.rewardChip, { color: COLORS.primary }]}>+{rewards.salvage} ⚙</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 84, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#141A2EE8', borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden',
    paddingRight: SPACING.md,
  },
  featured: { height: 96, borderWidth: 1.5 },
  locked: { opacity: 0.45 },
  accentBar: { width: 3, alignSelf: 'stretch' },
  emblem: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center',
    justifyContent: 'center', marginHorizontal: SPACING.md,
  },
  emblemBig: { width: 48, height: 48, borderRadius: 24 },
  glyph: { fontSize: 20 },
  glyphBig: { fontSize: 24 },
  middle: { flex: 1 },
  name: { color: COLORS.text, fontSize: FONT.md, fontWeight: '700' },
  nameBig: { fontSize: FONT.lg },
  sub: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  rewards: { alignItems: 'flex-end', gap: 2 },
  rewardChip: { fontSize: 10, fontWeight: '700' },
  clearedChip: { fontSize: 11, fontWeight: '700', color: '#4CAF50' },
});
```

- [ ] **Step 2: Create `RivalCard.tsx`** — full contents:

```tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, FONT, RADIUS, SPACING } from '@/src/constants/theme';
import type { Rival } from '@/src/stores/useBattleStore';

interface Props {
  rival: Rival;
  isClosest: boolean;   // the rank directly above you — accent rank number
  isYou?: boolean;
  onPress?(): void;
}

export function RivalCard({ rival, isClosest, isYou = false, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={isYou}
      style={({ pressed }) => [
        styles.card,
        isYou && styles.you,
        pressed && !isYou && { transform: [{ scale: 0.98 }] },
      ]}
    >
      <Text style={[styles.rank, isClosest && { color: COLORS.accent }]}>#{rival.rank}</Text>
      <Text style={styles.name} numberOfLines={1}>{rival.displayName}</Text>
      {isYou ? (
        <Text style={styles.youBadge}>YOU</Text>
      ) : (
        <Text style={styles.chevron}>›</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 64, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#141A2EE8', borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md,
    gap: SPACING.sm,
  },
  you: { borderColor: COLORS.primary },
  rank: { width: 52, color: COLORS.muted, fontSize: FONT.lg, fontWeight: '800' },
  name: { flex: 1, color: COLORS.text, fontSize: 15, fontWeight: '600' },
  youBadge: { color: COLORS.primary, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  chevron: { color: COLORS.muted, fontSize: 18 },
});
```

- [ ] **Step 3: Create `BattleScreen.tsx`** — full contents:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { COLORS, FONT, RADIUS, SPACING } from '@/src/constants/theme';
import { SpaceBackground } from '@/src/ui/common/SpaceBackground';
import { useBattleStore } from '@/src/stores/useBattleStore';
import { useEconomyStore } from '@/src/stores/useEconomyStore';
import { supabase } from '@/src/services/supabase';
import { SKIRMISH_TIERS, dailySeed, fleetName, highestUnlockedTier } from '@/src/game/battle';
import { TierCard } from './TierCard';
import { RivalCard } from './RivalCard';

export function BattleScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    progress, rank, rivals, clearedTiers, isChallenging, error,
    fetchProgress, fetchRivals, challengeSkirmish, challengePvp,
  } = useBattleStore();
  const { lumenBalance, fetchBalance } = useEconomyStore();
  const [playerId, setPlayerId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setPlayerId(session.user.id);
    });
  }, []);

  useFocusEffect(useCallback(() => {
    fetchProgress().then(fetchRivals);
    fetchBalance();
  }, [fetchProgress, fetchRivals, fetchBalance]));

  // XP bar fill animates on focus/refresh (visual spec §A1.1)
  const xpFraction = progress && progress.toNext > 0 ? progress.intoLevel / progress.toNext : 1;
  const fill = useSharedValue(0);
  useEffect(() => {
    fill.value = withTiming(xpFraction, { duration: 600, easing: Easing.out(Easing.cubic) });
  }, [fill, xpFraction]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  const level = progress?.level ?? 1;
  const featured = highestUnlockedTier(level);
  const today = new Date().toISOString().slice(0, 10);

  async function fight(kind: 'skirmish' | 'pvp', arg: number | string) {
    if (isChallenging) return;
    Haptics.selectionAsync();
    if (kind === 'skirmish') await challengeSkirmish(arg as number);
    else await challengePvp(arg as string);
    if (useBattleStore.getState().pendingBattle) router.push('/battle-replay');
  }

  return (
    <View style={styles.root}>
      <SpaceBackground seed={2} />

      {/* Header — visual spec §A1.1 */}
      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
        <View style={styles.headerRow}>
          <View style={styles.levelBadge}>
            <Text style={styles.levelNum}>{level}</Text>
          </View>
          <View style={styles.xpBlock}>
            <View style={styles.xpCaptionRow}>
              <Text style={styles.xpCaption}>LEVEL {level}</Text>
              <Text style={styles.xpNumbers}>
                {progress ? `${progress.intoLevel.toLocaleString()} / ${progress.toNext.toLocaleString()} XP` : '—'}
              </Text>
            </View>
            <View style={styles.xpTrack}>
              <Animated.View style={[styles.xpFillClip, fillStyle]}>
                <LinearGradient
                  colors={['#5EC8FF', '#8FE8FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>
            </View>
          </View>
          <Pressable style={styles.gear} onPress={() => router.push('/settings')} hitSlop={8}>
            <Ionicons name="settings-sharp" size={22} color={COLORS.muted} />
          </Pressable>
        </View>
        <View style={styles.pillRow}>
          <View style={styles.pill}><Text style={styles.pillLumens}>✦ {lumenBalance.toLocaleString()}</Text></View>
          <View style={styles.pill}><Text style={styles.pillSalvage}>⚙ {(progress?.salvage ?? 0).toLocaleString()}</Text></View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {isChallenging ? <ActivityIndicator color={COLORS.primary} style={styles.spinner} /> : null}

        <Text style={styles.sectionLabel}>SKIRMISH</Text>
        <View style={styles.list}>
          {SKIRMISH_TIERS.map(tier => (
            <TierCard
              key={tier.id}
              tier={tier}
              locked={level < tier.minLevel}
              cleared={clearedTiers.includes(tier.id)}
              featured={tier.id === featured.id}
              fleetName={playerId ? fleetName(dailySeed(playerId, tier.id, today)) : '…'}
              onPress={() => fight('skirmish', tier.id)}
            />
          ))}
        </View>

        <View style={styles.pvpHeader}>
          <Text style={styles.sectionLabel}>PVP ARENA</Text>
          {rank != null && <Text style={styles.rankChip}>RANK {rank}</Text>}
        </View>
        <View style={styles.list}>
          {rivals.length === 0 && (
            <Text style={styles.emptyPvp}>No rivals above you — you hold the line.</Text>
          )}
          {rivals.map((r, i) => (
            <RivalCard
              key={r.playerId}
              rival={r}
              isClosest={i === rivals.length - 1}
              onPress={() => fight('pvp', r.playerId)}
            />
          ))}
          {rank != null && (
            <RivalCard
              rival={{ playerId: 'me', rank, displayName: 'You' }}
              isClosest={false} isYou
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: SPACING.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', height: 48 },
  levelBadge: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.surface,
    borderWidth: 2, borderColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
  },
  levelNum: { color: COLORS.text, fontSize: FONT.lg, fontWeight: '800' },
  xpBlock: { flex: 1, marginLeft: SPACING.sm + 4 },
  xpCaptionRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  xpCaption: { color: COLORS.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  xpNumbers: { color: COLORS.muted, fontSize: 11 },
  xpTrack: { height: 8, borderRadius: RADIUS.full, backgroundColor: COLORS.border, overflow: 'hidden' },
  xpFillClip: { height: 8, borderRadius: RADIUS.full, overflow: 'hidden' },
  gear: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  pillRow: {
    flexDirection: 'row', justifyContent: 'flex-end', gap: SPACING.sm,
    height: 28, marginTop: SPACING.xs, alignItems: 'center',
  },
  pill: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 4,
  },
  pillLumens: { color: COLORS.accent, fontSize: 13, fontWeight: '700' },
  pillSalvage: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },
  scroll: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.xl },
  sectionLabel: {
    color: COLORS.muted, fontSize: 13, fontWeight: '800', letterSpacing: 1.5,
    marginTop: SPACING.lg, marginBottom: SPACING.sm,
  },
  pvpHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  rankChip: { color: COLORS.primary, fontSize: 12, fontWeight: '800', marginBottom: SPACING.sm },
  list: { gap: SPACING.sm },
  emptyPvp: { color: COLORS.muted, fontSize: FONT.sm, textAlign: 'center', padding: SPACING.md },
  error: { color: COLORS.danger, fontSize: FONT.sm, textAlign: 'center', marginTop: SPACING.sm },
  spinner: { marginTop: SPACING.sm },
});
```

- [ ] **Step 4: Create `src/ui/battle/index.ts`:**

```ts
export { BattleScreen } from './BattleScreen';
export { buildTimeline } from './timeline';
export type { Beat, ReplayTimeline } from './timeline';
```

- [ ] **Step 5: Typecheck + lint + full suite**

Run: `npx tsc --noEmit; npm run lint; npm test`
Expected: all clean (screen is unrouted until Task 19, so no runtime check yet).

- [ ] **Step 6: Commit**

```bash
git add src/ui/battle/
git commit -m "feat: Battle Arena launcher screen with skirmish tiers and PvP rivals"
```

---

### Task 17: Battle replay — conductor, panels, attack beats, skip

**Files:**
- Create: `src/ui/battle/useReplayConductor.ts`, `src/ui/battle/HpBar.tsx`, `src/ui/battle/DamageNumberPool.tsx`, `src/ui/battle/ShipPanel.tsx`, `src/ui/battle/BattleReplayScreen.tsx`

**Interfaces:**
- Consumes: `buildTimeline`/`Beat`/`ReplayTimeline` (Task 15), `useBattleStore.pendingBattle` (Task 14), `SpaceBackground` battle variant (Task 13), `BATTLE_COLORS` (Task 13).
- Produces: `<BattleReplayScreen />` (exported from the barrel; routed in Task 19). Also `ShipPanelHandle { lunge(dir): void; shake(big: boolean): void; pulseBorder(color): void; setBars(hpFrac, shieldFrac, snap): void; setEchoCharges(n): void }`, `DamageNumberPoolHandle { spawn(text, color, size, x, y): void }`, and `useReplayConductor(timeline, onBeat, onFinished) → { skip(): void; skipped: boolean }`.
- Task 18 extends this same screen with ability beats, destruction, and the result card — leave the marked extension points (`handleBeat` switch default, `finish()` body) exactly as written here.

**Implementation note (deviation from visual spec §A2.3, deliberate):** projectiles/flashes are pre-mounted Reanimated `<Animated.View>`s rather than a Skia canvas — identical timings, UI-thread motion, far less code. All motion values, easings, and haptics below are the spec's. If the Task 24 device pass finds the effects too flat, upgrading to Skia primitives is a contained follow-up inside these files.

- [ ] **Step 1: Create `HpBar.tsx`** — full contents:

```tsx
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle, useDerivedValue, withDelay, withTiming, Easing, SharedValue,
  interpolateColor,
} from 'react-native-reanimated';
import { COLORS, RADIUS } from '@/src/constants/theme';
import { BATTLE_COLORS } from '@/src/constants/theme';

interface Props {
  /** 0..1 — drive with .value = frac (snap handled internally per spec §A2.4) */
  fraction: SharedValue<number>;
  hpText: string;
}

/** Three-layer HP bar: track → ghost trail → snapping front fill. */
export function HpBar({ fraction, hpText }: Props) {
  const front = useDerivedValue(() =>
    withTiming(fraction.value, { duration: 140, easing: Easing.out(Easing.quad) }));
  const ghost = useDerivedValue(() =>
    withDelay(300, withTiming(fraction.value, { duration: 450, easing: Easing.out(Easing.cubic) })));

  const frontStyle = useAnimatedStyle(() => ({
    width: `${Math.max(0, front.value) * 100}%`,
    backgroundColor: interpolateColor(
      front.value,
      [0, 0.2, 0.201, 0.5, 0.501, 1],
      [BATTLE_COLORS.hpLow, BATTLE_COLORS.hpLow, BATTLE_COLORS.hpMid,
       BATTLE_COLORS.hpMid, BATTLE_COLORS.hpHigh, BATTLE_COLORS.hpHigh],
    ),
  }));
  const ghostStyle = useAnimatedStyle(() => ({ width: `${Math.max(0, ghost.value) * 100}%` }));

  return (
    <View>
      <Text style={styles.hpText}>{hpText}</Text>
      <View style={styles.track}>
        <Animated.View style={[styles.ghost, ghostStyle]} />
        <Animated.View style={[styles.front, frontStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hpText: { color: COLORS.muted, fontSize: 11, textAlign: 'right', marginBottom: 2 },
  track: {
    height: 14, borderRadius: RADIUS.full, backgroundColor: COLORS.border, overflow: 'hidden',
  },
  ghost: { ...StyleSheet.absoluteFillObject, backgroundColor: BATTLE_COLORS.ghostDamage, borderRadius: RADIUS.full },
  front: { height: 14, borderRadius: RADIUS.full },
});
```

- [ ] **Step 2: Create `DamageNumberPool.tsx`** — full contents:

```tsx
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming,
} from 'react-native-reanimated';

export interface DamageNumberPoolHandle {
  spawn(text: string, color: string, fontSize: number, x: number, y: number): void;
}

const POOL_SIZE = 8;

interface SlotProps { registerFire(fire: (t: string, c: string, s: number, x: number, y: number) => void): void; }

function Slot({ registerFire }: SlotProps) {
  const [text, setText] = useState('');
  const [color, setColor] = useState('#FFF');
  const [size, setSize] = useState(20);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.7);
  const rise = useSharedValue(0);

  registerFire((t, c, s, px, py) => {
    setText(t); setColor(c); setSize(s);
    x.value = px; y.value = py;
    rise.value = 0; opacity.value = 1; scale.value = 0.7;
    // Motion per visual spec §A2.5
    scale.value = withTiming(1, { duration: 120, easing: Easing.out(Easing.quad) });
    rise.value = withTiming(-30, { duration: 620, easing: Easing.out(Easing.cubic) });
    opacity.value = withDelay(370, withTiming(0, { duration: 250 }));
  });

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: x.value }, { translateY: y.value + rise.value }, { scale: scale.value },
    ],
  }));

  return (
    <Animated.Text style={[styles.number, style, { color, fontSize: size }]} pointerEvents="none">
      {text}
    </Animated.Text>
  );
}

export const DamageNumberPool = forwardRef<DamageNumberPoolHandle>(function DamageNumberPool(_, ref) {
  const fires = useRef<Array<(t: string, c: string, s: number, x: number, y: number) => void>>([]);
  const next = useRef(0);

  useImperativeHandle(ref, () => ({
    spawn(text, color, fontSize, px, py) {
      const fire = fires.current[next.current % POOL_SIZE];
      next.current += 1;
      fire?.(text, color, fontSize, px, py);
    },
  }));

  return (
    <>
      {Array.from({ length: POOL_SIZE }, (_, i) => (
        <Slot key={i} registerFire={(f) => { fires.current[i] = f; }} />
      ))}
    </>
  );
});

const styles = StyleSheet.create({
  number: { position: 'absolute', top: 0, left: 0, fontWeight: '800' },
});
```

- [ ] **Step 3: Create `ShipPanel.tsx`** — full contents:

```tsx
import { forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming,
} from 'react-native-reanimated';
import { COLORS, FONT, RADIUS, SPACING } from '@/src/constants/theme';
import { HpBar } from './HpBar';

export interface ShipPanelHandle {
  /** dir: +1 = lunge downward (enemy/top panel), -1 = lunge upward (player/bottom). */
  lunge(dir: 1 | -1): void;
  shake(big: boolean): void;
  pulseBorder(color: string): void;
  /** Snap the bar targets (HpBar tweens internally per spec). */
  setBars(hpFraction: number, shieldFraction: number): void;
  setEchoCharges(n: number): void;
  setHpText(text: string): void;
  /** Loss state: flicker + settle (used by Task 18's destruction). */
  destroy(): void;
}

interface Props {
  name: string;
  shipLevel: number;
  maxEchoCharges: number;
  emblem: string;
}

export const ShipPanel = forwardRef<ShipPanelHandle, Props>(function ShipPanel(
  { name, shipLevel, maxEchoCharges, emblem }, ref,
) {
  const hp = useSharedValue(1);
  const shieldW = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const borderColor = useSharedValue(COLORS.border);
  const [hpText, setHpTextState] = [useSharedValue(''), null] as never; // replaced below

  // React state for text + pips (updates at beat rate, ~1-3Hz — cheap)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { useState } = require('react') as typeof import('react');
  const [text, setText] = useState('');
  const [charges, setCharges] = useState(maxEchoCharges);

  useImperativeHandle(ref, () => ({
    lunge(dir) {
      ty.value = withSequence(
        withTiming(8 * dir, { duration: 90, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 160, easing: Easing.inOut(Easing.quad) }),
      );
    },
    shake(big) {
      const amp = big ? 9 : 5;
      tx.value = withSequence(
        withTiming(-amp, { duration: 60 }), withTiming(amp * 0.8, { duration: 60 }),
        withTiming(-amp * 0.4, { duration: 60 }), withTiming(0, { duration: 60 }),
      );
    },
    pulseBorder(color) {
      borderColor.value = color;
      borderColor.value = withTiming(COLORS.border, { duration: 320 });
    },
    setBars(hpFraction, shieldFraction) {
      hp.value = hpFraction;
      shieldW.value = withTiming(shieldFraction, { duration: 140, easing: Easing.out(Easing.quad) });
    },
    setEchoCharges(n) { setCharges(n); },
    setHpText(t) { setText(t); },
    destroy() {
      opacity.value = withSequence(
        withTiming(0.4, { duration: 80 }), withTiming(0.9, { duration: 80 }),
        withTiming(0.2, { duration: 80 }),
        withTiming(0.3, { duration: 400, easing: Easing.inOut(Easing.quad) }),
      );
      scale.value = withTiming(0.97, { duration: 400, easing: Easing.inOut(Easing.quad) });
      ty.value = withTiming(10, { duration: 400, easing: Easing.inOut(Easing.quad) });
    },
  }));

  const panelStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    borderColor: borderColor.value,
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));
  const shieldStyle = useAnimatedStyle(() => ({ width: `${Math.max(0, shieldW.value) * 100}%` }));

  return (
    <Animated.View style={[styles.panel, panelStyle]}>
      <Text style={styles.emblem}>{emblem}</Text>
      <View style={styles.body}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <Text style={styles.level}>LV {shipLevel}</Text>
        </View>
        <View style={styles.shieldRow}>
          <View style={styles.shieldTrack}>
            <Animated.View style={[styles.shieldFill, shieldStyle]} />
          </View>
          {Array.from({ length: maxEchoCharges }, (_, i) => (
            <View key={i} style={[styles.pip, i >= charges && styles.pipSpent]} />
          ))}
        </View>
        <HpBar fraction={hp} hpText={text} />
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  panel: {
    height: 96, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#141A2EE8', borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.md, padding: SPACING.md, gap: SPACING.sm,
  },
  emblem: { fontSize: 44 },
  body: { flex: 1, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  name: { flex: 1, color: COLORS.text, fontSize: 15, fontWeight: '700' },
  level: { color: COLORS.muted, fontSize: 10, fontWeight: '700' },
  shieldRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  shieldTrack: {
    flex: 1, height: 4, borderRadius: RADIUS.full,
    backgroundColor: COLORS.border, overflow: 'hidden',
  },
  shieldFill: { height: 4, borderRadius: RADIUS.full, backgroundColor: COLORS.primary },
  pip: { width: 4, height: 4, borderRadius: 2, backgroundColor: COLORS.primary },
  pipSpent: { opacity: 0.25 },
});
```

Note the `require('react')` hack above is a smell — replace it with a normal top-of-component `useState` import/call when writing the real file (it is shown inline here only to keep the handle-methods story in one block). The real file imports `useState` from `'react'` normally.

- [ ] **Step 4: Create `useReplayConductor.ts`** — full contents:

```ts
import { useEffect, useRef, useState } from 'react';
import type { ReplayTimeline, Beat } from './timeline';

/**
 * Chained-timeout conductor (visual spec §A2.0): fires onBeat per beat at its
 * startMs, onFinished after the last beat. skip() cancels everything pending
 * and calls onFinished immediately — idempotent, <100ms response.
 */
export function useReplayConductor(
  timeline: ReplayTimeline | null,
  onBeat: (beat: Beat, index: number) => void,
  onFinished: (skipped: boolean) => void,
) {
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const done = useRef(false);
  const [skipped, setSkipped] = useState(false);

  // Keep latest callbacks without re-arming the timeline
  const beatRef = useRef(onBeat);
  const finRef = useRef(onFinished);
  beatRef.current = onBeat;
  finRef.current = onFinished;

  useEffect(() => {
    if (!timeline) return;
    done.current = false;
    timeline.beats.forEach((beat, i) => {
      timeouts.current.push(setTimeout(() => beatRef.current(beat, i), beat.startMs));
    });
    timeouts.current.push(setTimeout(() => {
      if (!done.current) { done.current = true; finRef.current(false); }
    }, timeline.totalMs + 350)); // 350ms hold per spec §A2.7
    return () => timeouts.current.forEach(clearTimeout);
  }, [timeline]);

  function skip() {
    if (done.current) return; // idempotent; no-op once finished
    done.current = true;
    setSkipped(true);
    timeouts.current.forEach(clearTimeout);
    finRef.current(true);
  }

  return { skip, skipped };
}
```

- [ ] **Step 5: Create `BattleReplayScreen.tsx`** — full contents (Task 18 fills the two marked extension points; write them exactly as shown):

```tsx
import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming,
} from 'react-native-reanimated';
import { COLORS, FONT, RADIUS, SPACING } from '@/src/constants/theme';
import { BATTLE_COLORS } from '@/src/constants/theme';
import { SpaceBackground } from '@/src/ui/common/SpaceBackground';
import { useBattleStore } from '@/src/stores/useBattleStore';
import { buildTimeline, type Beat } from './timeline';
import { useReplayConductor } from './useReplayConductor';
import { ShipPanel, type ShipPanelHandle } from './ShipPanel';
import { DamageNumberPool, type DamageNumberPoolHandle } from './DamageNumberPool';

export function BattleReplayScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const pending = useBattleStore(s => s.pendingBattle);

  const timeline = useMemo(
    () => (pending ? buildTimeline(pending.player, pending.opponent, pending.result) : null),
    [pending],
  );

  const playerRef = useRef<ShipPanelHandle>(null);
  const enemyRef = useRef<ShipPanelHandle>(null);
  const damageRef = useRef<DamageNumberPoolHandle>(null);
  const [turn, setTurn] = useState(0);
  const [finished, setFinished] = useState(false);

  // Single pre-mounted projectile (visual spec §A2.3 timings)
  const projY = useSharedValue(0);
  const projOpacity = useSharedValue(0);
  const projColor = useSharedValue(COLORS.primary as string);
  const arenaTop = insets.top + SPACING.sm + 96;
  const arenaBottom = height - (insets.bottom + SPACING.md + 96);

  function fireProjectile(fromPlayer: boolean, color: string) {
    projColor.value = color;
    projY.value = fromPlayer ? arenaBottom : arenaTop;
    projOpacity.value = withSequence(
      withTiming(0.95, { duration: 40 }),
      withTiming(0.95, { duration: 130 }),
      withTiming(0, { duration: 60 }),
    );
    projY.value = withTiming(fromPlayer ? arenaTop : arenaBottom,
      { duration: 170, easing: Easing.linear });
  }
  const projStyle = useAnimatedStyle(() => ({
    opacity: projOpacity.value,
    backgroundColor: projColor.value,
    transform: [{ translateY: projY.value }],
  }));

  if (!pending || !timeline) {
    // Opened without a battle — bounce back
    router.back();
    return null;
  }

  const meId = pending.player.ship.playerId;
  const isPlayer = (id: string) => id === meId;
  const panelOf = (id: string) => (isPlayer(id) ? playerRef : enemyRef);
  const damageY = (targetId: string) => (isPlayer(targetId) ? arenaBottom - 40 : arenaTop + 20);

  function applyBarsFrom(beat: Beat) {
    for (const [id, panel] of [[meId, playerRef], [pending!.opponent.ship.playerId, enemyRef]] as const) {
      panel.current?.setBars(
        Math.max(0, beat.hp[id] / timeline!.maxHp[id]),
        timeline!.maxShield[id] > 0 ? Math.max(0, beat.shield[id] / timeline!.maxShield[id]) : 0,
      );
      panel.current?.setHpText(
        `${Math.max(0, beat.hp[id]).toLocaleString()} / ${timeline!.maxHp[id].toLocaleString()}`,
      );
      panel.current?.setEchoCharges(beat.echoCharges[id]);
    }
  }

  function handleBeat(beat: Beat) {
    setTurn(beat.event.turn);
    const { event } = beat;
    switch (event.type) {
      case 'attack': {
        const fromPlayer = isPlayer(event.actorId);
        const color = beat.bypass
          ? BATTLE_COLORS.abilityPhase
          : fromPlayer ? COLORS.primary : COLORS.danger;
        panelOf(event.actorId).current?.lunge(fromPlayer ? -1 : 1);
        setTimeout(() => fireProjectile(fromPlayer, color), 60);
        setTimeout(() => {
          const target = panelOf(event.targetId);
          const big = event.value > timeline!.maxHp[event.targetId] * 0.3;
          target.current?.shake(big);
          target.current?.pulseBorder(color);
          applyBarsFrom(beat);
          if (event.value > 0) {
            damageRef.current?.spawn(
              `-${event.value}`, beat.bypass ? BATTLE_COLORS.abilityPhase : COLORS.text,
              beat.bypass ? 28 : 20, width / 2 - 30, damageY(event.targetId),
            );
            Haptics.impactAsync(
              big ? Haptics.ImpactFeedbackStyle.Heavy
                : event.value > timeline!.maxHp[event.targetId] * 0.15
                  ? Haptics.ImpactFeedbackStyle.Medium
                  : Haptics.ImpactFeedbackStyle.Light,
            );
          } else {
            damageRef.current?.spawn('ABSORBED', COLORS.primary, 12, width / 2 - 34, damageY(event.targetId));
          }
        }, 230);
        break;
      }
      // TASK-18-EXTENSION-POINT: ability beats (phase_bypass, ability_block,
      // reflect, overdrive_burst) are handled here in Task 18.
      default: {
        applyBarsFrom(beat);
        break;
      }
    }
  }

  function finish(skipped: boolean) {
    if (skipped && timeline) {
      // Snap to final precomputed state (spec §A2.10)
      applyBarsFrom(timeline.beats[timeline.beats.length - 1]);
    }
    const loserIsPlayer = timeline!.winnerId !== meId;
    (loserIsPlayer ? playerRef : enemyRef).current?.destroy();
    Haptics.notificationAsync(
      loserIsPlayer ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Success,
    );
    // TASK-18-EXTENSION-POINT: destruction pulses + result card mount here.
    setTimeout(() => setFinished(true), 600);
  }

  const { skip } = useReplayConductor(timeline, handleBeat, finish);

  return (
    <View style={styles.root}>
      <SpaceBackground variant="battle" seed={7} />

      <View style={{ paddingTop: insets.top + SPACING.sm, paddingHorizontal: SPACING.md }}>
        <ShipPanel
          ref={enemyRef}
          name={pending.opponent.name}
          shipLevel={pending.opponent.shipLevel}
          maxEchoCharges={pending.opponent.ship.shields.ability === 'echo_shell' ? 2 : 0}
          emblem="👾"
        />
      </View>

      <View style={styles.arena}>
        <Text style={styles.turn}>{turn > 0 ? `TURN ${turn}` : ' '}</Text>
        <Animated.View style={[styles.projectile, projStyle]} />
        <DamageNumberPool ref={damageRef} />
        {/* TASK-18-EXTENSION-POINT: AbilityCallout + BattleResultCard render here. */}
        {finished && (
          <Pressable style={styles.continueBtn} onPress={() => {
            useBattleStore.getState().clearPendingBattle();
            router.back();
          }}>
            <Text style={styles.continueText}>CONTINUE</Text>
          </Pressable>
        )}
      </View>

      <View style={{ paddingBottom: insets.bottom + SPACING.md, paddingHorizontal: SPACING.md }}>
        <ShipPanel
          ref={playerRef}
          name="Your Fleet"
          shipLevel={pending.player.shipLevel}
          maxEchoCharges={pending.player.ship.shields.ability === 'echo_shell' ? 2 : 0}
          emblem="🚀"
        />
      </View>

      {!finished && (
        <Pressable
          style={[styles.skip, { top: insets.top + SPACING.sm + 4 }]}
          onPress={skip} hitSlop={10}
        >
          <Text style={styles.skipText}>SKIP ▸▸</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  arena: { flex: 1, paddingHorizontal: SPACING.md, justifyContent: 'flex-start' },
  turn: {
    color: COLORS.muted, fontSize: 11, letterSpacing: 2,
    textAlign: 'center', marginTop: SPACING.sm,
  },
  projectile: {
    position: 'absolute', left: '50%', marginLeft: -13,
    width: 26, height: 3, borderRadius: 2,
  },
  skip: {
    position: 'absolute', right: SPACING.md, minWidth: 44, minHeight: 32,
    backgroundColor: '#141A2ECC', borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.full, paddingHorizontal: 12, justifyContent: 'center',
  },
  skipText: { color: COLORS.muted, fontSize: 12, fontWeight: '800' },
  continueBtn: {
    alignSelf: 'center', marginTop: 'auto', marginBottom: SPACING.lg,
    backgroundColor: COLORS.primary, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md,
  },
  continueText: { color: COLORS.background, fontSize: FONT.md, fontWeight: '800' },
});
```

Fix the `ShipPanel` `require('react')` smell now (per the Step 3 note) and add `BattleReplayScreen` to `src/ui/battle/index.ts`:

```ts
export { BattleReplayScreen } from './BattleReplayScreen';
```

- [ ] **Step 6: Typecheck + lint + full suite**

Run: `npx tsc --noEmit; npm run lint; npm test`
Expected: clean. (Runtime verification comes with routing in Task 19 + the Task 24 device pass.)

- [ ] **Step 7: Commit**

```bash
git add src/ui/battle/
git commit -m "feat: battle replay core — conductor, ship panels, attack beats, skip"
```

---

### Task 18: Battle replay — ability beats, destruction, result card, level-up

**Files:**
- Create: `src/ui/battle/AbilityCallout.tsx`, `src/ui/battle/resultCopy.ts`, `src/ui/battle/BattleResultCard.tsx`
- Modify: `src/ui/battle/BattleReplayScreen.tsx` (fill the three `TASK-18-EXTENSION-POINT` markers from Task 17)

**Interfaces:**
- Consumes: Task 17's screen + handles, `PendingBattle` (Task 14), `levelFromXp` (Task 2), `SKIRMISH_TIERS` (Task 4), `BATTLE_COLORS`.
- Produces: `AbilityCalloutHandle { show(title: string, sub: string, color: string): void }`; `<BattleResultCard pending onContinue onRetry? />`; copy tables in `resultCopy.ts` (`WIN_LINES`, `LOSS_LINES`, `CONTEXT_LINES`, `ABILITY_COPY`).

- [ ] **Step 1: Create `resultCopy.ts`** — full contents (copy verbatim from visual spec §A3.3/§A3.4):

```ts
/** Result-card + callout copy (visual spec §A3). Sub-lines picked by seed for stable replays. */

export const WIN_LINES = [
  'Enemy fleet neutralized.',
  'Not even close.',
  'The void keeps what you break.',
  'Another one for the log.',
];

export const LOSS_LINES = [
  'Your fleet limps home. Nothing lost but pride.',
  'They were ready. Next time, so are you.',
  'Refit. Rethink. Return.',
  'Every ace has a first defeat. This was yours.',
];

export const CONTEXT_LINES = {
  pvpWin: 'Ranks exchanged. The climb continues.',
  pvpLoss: 'No rank lost. The ladder forgives — once.',
  defenseWin: 'The planet yields its secret.',
  defenseLoss: 'The defenders keep their prize.',
} as const;

export const ABILITY_COPY = {
  phase_cannon: { title: 'PHASE CANNON', sub: 'Shields mean nothing.' },
  iron_tomb:    { title: 'IRON TOMB',    sub: 'The hull endures.' },
  overdrive:    { title: 'OVERDRIVE',    sub: 'Burn everything.' },
  echo_shell:   { title: 'ECHO SHELL',   sub: 'Returned to sender.' },
} as const;

export function pickLine(pool: readonly string[], seed: number): string {
  return pool[Math.abs(seed) % pool.length];
}
```

- [ ] **Step 2: Create `AbilityCallout.tsx`** — full contents:

```tsx
import { forwardRef, useImperativeHandle, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming,
} from 'react-native-reanimated';
import { COLORS, RADIUS } from '@/src/constants/theme';

export interface AbilityCalloutHandle {
  show(title: string, sub: string, color: string): void;
}

/** Pre-mounted centered banner (visual spec §A2.6): 160ms in, 450ms hold, 180ms out. */
export const AbilityCallout = forwardRef<AbilityCalloutHandle>(function AbilityCallout(_, ref) {
  const [content, setContent] = useState({ title: '', sub: '', color: COLORS.primary });
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.8);

  useImperativeHandle(ref, () => ({
    show(title, sub, color) {
      setContent({ title, sub, color });
      scale.value = 0.8;
      opacity.value = withSequence(
        withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) }),
        withDelay(450, withTiming(0, { duration: 180 })),
      );
      scale.value = withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) });
    },
  }));

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.pill, { borderColor: content.color }, style]} pointerEvents="none">
      <Text style={[styles.title, { color: content.color }]}>{content.title}</Text>
      <Text style={styles.sub}>{content.sub}</Text>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  pill: {
    position: 'absolute', alignSelf: 'center', top: '38%',
    backgroundColor: '#0B0E1AE6', borderWidth: 1.5, borderRadius: RADIUS.full,
    paddingHorizontal: 18, paddingVertical: 8, alignItems: 'center',
  },
  title: { fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  sub: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
});
```

- [ ] **Step 3: Create `BattleResultCard.tsx`** — full contents:

```tsx
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { COLORS, FONT, RADIUS, SPACING } from '@/src/constants/theme';
import { useBattleStore, type PendingBattle } from '@/src/stores/useBattleStore';
import { levelFromXp } from '@/src/game/battle/xp';
import { SKIRMISH_TIERS } from '@/src/game/battle/ladder';
import { TIER_STYLES } from '@/src/ui/spin/tierStyles';
import { WIN_LINES, LOSS_LINES, CONTEXT_LINES, pickLine } from './resultCopy';

interface Props {
  pending: PendingBattle;
  onContinue(): void;
  onRetry?(): void;   // skirmish/pvp only — never defense
}

function Ring({ color, delay }: { color: string; delay: number }) {
  const scale = useSharedValue(0.4);
  const opacity = useSharedValue(0.8);
  useEffect(() => {
    scale.value = withDelay(delay, withTiming(2, { duration: 700, easing: Easing.out(Easing.quad) }));
    opacity.value = withDelay(delay, withTiming(0, { duration: 700 }));
  }, [scale, opacity, delay]);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value, transform: [{ scale: scale.value }],
  }));
  return <Animated.View style={[styles.ring, { borderColor: color }, style]} pointerEvents="none" />;
}

function RewardChip({ label, color, index }: { label: string; color: string; index: number }) {
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0);
  useEffect(() => {
    scale.value = withDelay(index * 90, withSpring(1, { damping: 12 }));
    opacity.value = withDelay(index * 90, withTiming(1, { duration: 120 }));
  }, [scale, opacity, index]);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value, transform: [{ scale: scale.value }],
  }));
  return (
    <Animated.View style={[styles.chip, style]}>
      <Text style={[styles.chipText, { color }]}>{label}</Text>
    </Animated.View>
  );
}

export function BattleResultCard({ pending, onContinue, onRetry }: Props) {
  const progress = useBattleStore(s => s.progress);
  const { won, rewards, source } = pending;
  const seed = pending.result.log.length * 31 + pending.result.turns;

  // Entrance: translateY 40→0 spring (visual spec §A2.8)
  const ty = useSharedValue(40);
  const opacity = useSharedValue(0);
  useEffect(() => {
    ty.value = withSpring(0, { damping: 16, stiffness: 180 });
    opacity.value = withTiming(1, { duration: 200 });
  }, [ty, opacity]);
  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value, transform: [{ translateY: ty.value }],
  }));

  // Level-up detection: rewind the xp grant to find the pre-battle level.
  const leveledUp = won && rewards && progress
    ? levelFromXp(progress.xp - rewards.xp).level < progress.level
    : false;
  const unlocked = leveledUp && progress
    ? SKIRMISH_TIERS.find(t => t.minLevel === progress.level)
    : undefined;

  const subLine =
    source === 'pvp' ? (won ? CONTEXT_LINES.pvpWin : CONTEXT_LINES.pvpLoss)
    : source === 'defense' ? (won ? CONTEXT_LINES.defenseWin : CONTEXT_LINES.defenseLoss)
    : pickLine(won ? WIN_LINES : LOSS_LINES, seed);

  return (
    <Animated.View style={[styles.card, won ? styles.cardWin : styles.cardLoss, cardStyle]}>
      {won && (
        <View style={styles.ringAnchor}>
          <Ring color={COLORS.accent} delay={0} />
          <Ring color={COLORS.accent} delay={150} />
        </View>
      )}
      <Text style={[styles.title, { color: won ? COLORS.accent : COLORS.danger }]}>
        {won ? 'VICTORY' : 'DEFEAT'}
      </Text>
      <Text style={styles.subLine}>{subLine}</Text>

      {won && rewards && (
        <View style={styles.chipRow}>
          <RewardChip label={`+${rewards.xp} XP`} color={COLORS.text} index={0} />
          <RewardChip label={`+${rewards.lumens} ✦`} color={COLORS.accent} index={1} />
          <RewardChip label={`+${rewards.salvage} ⚙`} color={COLORS.primary} index={2} />
        </View>
      )}
      {won && rewards?.consolation && (
        <Text style={styles.consolation}>DAILY BONUS CLAIMED · 15%</Text>
      )}

      {source === 'pvp' && won && pending.oldRank != null && (
        <Text style={styles.rankRow}>
          <Text style={styles.rankOld}>RANK {pending.oldRank}</Text>
          <Text style={styles.rankArrow}>  →  </Text>
          <Text style={styles.rankNew}>{pending.newRank}</Text>
        </Text>
      )}

      {source === 'defense' && won && pending.fragment && (
        <View style={[styles.fragmentChip, { borderColor: TIER_STYLES[pending.fragment.tier].border }]}>
          <Text style={[styles.fragmentText, { color: TIER_STYLES[pending.fragment.tier].border }]}>
            {TIER_STYLES[pending.fragment.tier].label} {pending.fragment.slot} fragment recovered
          </Text>
        </View>
      )}

      {leveledUp && progress && (
        <View style={styles.levelUp}>
          <Text style={styles.levelUpText}>LEVEL {progress.level}</Text>
          {unlocked && (
            <Text style={[styles.unlockText, { color: unlocked.accent }]}>
              SKIRMISH UNLOCKED: {unlocked.name.toUpperCase()}
            </Text>
          )}
        </View>
      )}

      <View style={styles.buttons}>
        {!won && onRetry && (
          <Pressable style={styles.retryBtn} onPress={onRetry}>
            <Text style={styles.retryText}>RETRY</Text>
          </Pressable>
        )}
        <Pressable style={styles.continueBtn} onPress={onContinue}>
          <Text style={styles.continueText}>CONTINUE</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'center', width: '92%', backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg, padding: SPACING.lg, alignItems: 'center',
    gap: SPACING.sm,
  },
  cardWin: { borderWidth: 1.5, borderColor: COLORS.accent },
  cardLoss: { borderWidth: 1, borderColor: COLORS.border },
  ringAnchor: { position: 'absolute', top: SPACING.lg + 18, alignSelf: 'center' },
  ring: {
    position: 'absolute', width: 90, height: 90, borderRadius: 45,
    borderWidth: 2, alignSelf: 'center', marginLeft: -45, marginTop: -30,
  },
  title: { fontSize: FONT.xl, fontWeight: '900', letterSpacing: 3 },
  subLine: { color: COLORS.muted, fontSize: 13, textAlign: 'center' },
  chipRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  chip: {
    backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 6,
  },
  chipText: { fontSize: 13, fontWeight: '700' },
  consolation: { color: COLORS.muted, fontSize: 11 },
  rankRow: { marginTop: SPACING.xs },
  rankOld: { color: COLORS.muted, fontSize: 14, textDecorationLine: 'line-through' },
  rankArrow: { color: COLORS.muted, fontSize: 14 },
  rankNew: { color: COLORS.accent, fontSize: 16, fontWeight: '800' },
  fragmentChip: {
    borderWidth: 1, borderRadius: RADIUS.full,
    paddingHorizontal: 12, paddingVertical: 6, marginTop: SPACING.xs,
  },
  fragmentText: { fontSize: 13, fontWeight: '700' },
  levelUp: { alignItems: 'center', marginTop: SPACING.sm },
  levelUpText: { color: COLORS.primary, fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  unlockText: { fontSize: 12, fontWeight: '800', letterSpacing: 1, marginTop: 4 },
  buttons: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  retryBtn: {
    borderWidth: 1, borderColor: COLORS.borderBright, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md - 4,
  },
  retryText: { color: COLORS.text, fontSize: FONT.sm, fontWeight: '800' },
  continueBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md - 4,
  },
  continueText: { color: COLORS.background, fontSize: FONT.sm, fontWeight: '800' },
});
```

- [ ] **Step 4: Fill the three extension points in `BattleReplayScreen.tsx`:**

**(a)** Add imports + refs + a dim overlay shared value:

```tsx
import { AbilityCallout, type AbilityCalloutHandle } from './AbilityCallout';
import { BattleResultCard } from './BattleResultCard';
import { ABILITY_COPY } from './resultCopy';
// inside the component:
const calloutRef = useRef<AbilityCalloutHandle>(null);
const dim = useSharedValue(0);
const dimStyle = useAnimatedStyle(() => ({ opacity: dim.value }));
```

**(b)** Replace the `handleBeat` `default:` case with the four ability cases (timings per visual spec §A2.6):

```tsx
      case 'phase_bypass': {
        const c = ABILITY_COPY.phase_cannon;
        calloutRef.current?.show(c.title, c.sub, BATTLE_COLORS.abilityPhase);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
      }
      case 'ability_block': {
        const c = ABILITY_COPY.iron_tomb;
        calloutRef.current?.show(c.title, c.sub, BATTLE_COLORS.abilityTomb);
        panelOf(event.actorId).current?.pulseBorder(BATTLE_COLORS.abilityTomb);
        damageRef.current?.spawn('BLOCKED', BATTLE_COLORS.abilityTomb, 14,
          width / 2 - 32, damageY(event.actorId));
        applyBarsFrom(beat);
        break;
      }
      case 'reflect': {
        const c = ABILITY_COPY.echo_shell;
        calloutRef.current?.show(c.title, c.sub, BATTLE_COLORS.abilityEcho);
        fireProjectile(isPlayer(event.actorId), BATTLE_COLORS.abilityEcho);
        setTimeout(() => {
          damageRef.current?.spawn(`-${event.value}`, BATTLE_COLORS.abilityEcho, 16,
            width / 2 + 10, damageY(event.targetId));
          applyBarsFrom(beat);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }, 220);
        break;
      }
      case 'overdrive_burst': {
        dim.value = withTiming(0.35, { duration: 250 });
        const c = ABILITY_COPY.overdrive;
        setTimeout(() => calloutRef.current?.show(c.title, c.sub, BATTLE_COLORS.abilityOverdrive), 200);
        setTimeout(() => {
          const hpCost = Math.round(timeline!.maxHp[event.actorId] * 0.10);
          damageRef.current?.spawn(`-${hpCost}`, BATTLE_COLORS.abilityOverdrive, 20,
            width / 2 - 30, damageY(event.actorId));
        }, 500);
        setTimeout(() => fireProjectile(isPlayer(event.actorId), BATTLE_COLORS.abilityOverdrive), 800);
        setTimeout(() => {
          panelOf(event.targetId).current?.shake(true);
          damageRef.current?.spawn(`-${event.value}`, BATTLE_COLORS.abilityOverdrive, 28,
            width / 2 - 34, damageY(event.targetId));
          applyBarsFrom(beat);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        }, 1000);
        setTimeout(() => { dim.value = withTiming(0, { duration: 300 }); }, 1300);
        break;
      }
      default: {
        applyBarsFrom(beat);
        break;
      }
```

**(c)** In the JSX arena block: render the dim overlay + callout, and replace Task 17's temporary CONTINUE button with the result card:

```tsx
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, dimStyle]}
          pointerEvents="none"
        />
        <AbilityCallout ref={calloutRef} />
        {finished && (
          <View style={styles.resultWrap}>
            <BattleResultCard
              pending={pending}
              onContinue={() => {
                useBattleStore.getState().clearPendingBattle();
                router.back();
              }}
              onRetry={pending.source === 'defense' ? undefined : async () => {
                const store = useBattleStore.getState();
                store.clearPendingBattle();
                if (pending.source === 'skirmish' && pending.tierId) {
                  await store.challengeSkirmish(pending.tierId);
                } else if (pending.source === 'pvp') {
                  await store.challengePvp(pending.opponent.ship.playerId);
                }
                if (useBattleStore.getState().pendingBattle) {
                  router.replace('/battle-replay'); // remount for a fresh conductor
                } else {
                  router.back();
                }
              }}
            />
          </View>
        )}
```

with the style addition:

```tsx
  resultWrap: { ...StyleSheet.absoluteFillObject, justifyContent: 'center' },
```

- [ ] **Step 5: Update the barrel** — `src/ui/battle/index.ts` gains:

```ts
export { BattleResultCard } from './BattleResultCard';
```

- [ ] **Step 6: Typecheck + lint + full suite**

Run: `npx tsc --noEmit; npm run lint; npm test`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/ui/battle/
git commit -m "feat: replay ability beats, result card with rewards/rank/fragment, level-up moment"
```

---

## Phase 5 — Routes, integration & app-wide polish

### Task 19: Navigation — Battle tab, initial route, settings modal, replay route

**Files:**
- Modify: `app/(tabs)/_layout.tsx` (full rewrite below)
- Create: `app/(tabs)/battle.tsx`
- Delete: `app/(tabs)/settings.tsx`
- Create: `app/settings.tsx`
- Create: `app/battle-replay.tsx`
- Modify: `app/_layout.tsx:40-44` (Stack children)

**Interfaces:**
- Consumes: `BattleScreen`, `BattleReplayScreen` from `@/src/ui/battle` (Tasks 16–18); `Screen` from `@/src/ui/Screen`.
- Produces: routes `/battle-replay` (fullScreenModal, swipe-back disabled) and `/settings` (modal) — already referenced by `router.push('/battle-replay')` in BattleScreen's `fight()` and `BattleReplayScreen`'s retry (`router.replace('/battle-replay')`), and `router.push('/settings')` from the gear icon. Tab order becomes Fleet, Star Map, **Battle (initial)**, Tech, Spin (design spec §2).

- [ ] **Step 1: Rewrite `app/(tabs)/_layout.tsx`** — full contents (tab order changes, settings tab removed, Battle added with the `flash` icon):

```tsx
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { COLORS } from '@/src/constants/theme';

// Battle is the middle tab and the game's opening screen (design spec §2).
export const unstable_settings = { initialRouteName: 'battle' };

export default function TabLayout() {
  return (
    <Tabs
      initialRouteName="battle"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.muted,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="fleet"
        options={{
          title: 'Ship Fleet',
          tabBarIcon: ({ color, size }) => <Ionicons name="rocket" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Star Map',
          tabBarIcon: ({ color, size }) => <Ionicons name="planet" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="battle"
        options={{
          title: 'Battle',
          tabBarIcon: ({ color, size }) => <Ionicons name="flash" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="tech"
        options={{
          title: 'Tech',
          tabBarIcon: ({ color, size }) => <Ionicons name="git-branch" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="spin"
        options={{
          title: 'Spin',
          tabBarIcon: ({ color, size }) => <Ionicons name="gift" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
```

- [ ] **Step 2: Create `app/(tabs)/battle.tsx`** — thin route per project convention:

```tsx
import { BattleScreen } from '@/src/ui/battle';

export default function BattleTab() {
  return <BattleScreen />;
}
```

- [ ] **Step 3: Move settings out of the tabs.** Delete the old tab route and recreate it as a root-level route with identical content:

```bash
git rm "app/(tabs)/settings.tsx"
```

Create `app/settings.tsx`:

```tsx
import { SafeAreaView } from 'react-native-safe-area-context';

import { Screen } from '@/src/ui/Screen';

export default function SettingsScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <Screen title="Settings" subtitle="Audio, haptics, cloud save, and account." />
    </SafeAreaView>
  );
}
```

- [ ] **Step 4: Create `app/battle-replay.tsx`:**

```tsx
import { BattleReplayScreen } from '@/src/ui/battle';

export default function BattleReplayRoute() {
  return <BattleReplayScreen />;
}
```

- [ ] **Step 5: Register the two new routes in `app/_layout.tsx`.** Replace the `<Stack>` block (lines 40–44) with:

```tsx
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
        <Stack.Screen
          name="battle-replay"
          options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
        />
        <Stack.Screen name="+not-found" />
      </Stack>
```

`gestureEnabled: false` kills the iOS swipe-down dismiss — the replay is exited only via SKIP/CONTINUE, so `clearPendingBattle` bookkeeping always runs (Android hardware back still pops; rewards are already applied server-side before the replay opens, so that loses nothing).

- [ ] **Step 6: Typecheck + lint + full suite**

Run: `npx tsc --noEmit; npm run lint; npm test`
Expected: all clean / baseline pass count.

- [ ] **Step 7: Emulator smoke (if the Pixel_9 AVD is running — otherwise defer to Task 24's device pass):** launch via the dev server, confirm the app opens on the **Battle** tab, tab order reads Fleet / Star Map / Battle / Tech / Spin, and the gear icon opens Settings as a modal.

- [ ] **Step 8: Commit**

```bash
git add app/_layout.tsx "app/(tabs)/_layout.tsx" "app/(tabs)/battle.tsx" app/settings.tsx app/battle-replay.tsx
git commit -m "feat: Battle tab as initial route, settings modal, battle-replay fullscreen route"
```

---

### Task 20: LoadoutScreen Ship Level panel

**Files:**
- Create: `src/ui/fleet/ShipLevelPanel.tsx`
- Modify: `src/ui/fleet/LoadoutScreen.tsx:70-90` (insert panel below the stats row)

**Interfaces:**
- Consumes: `useBattleStore` (`progress.shipLevel`/`progress.salvage`, `fetchProgress`, `levelUpShip`, `error` — Task 14), `shipLevelCost` from `@/src/game/battle` (Task 2, returns `{ lumens, salvage } | null`), `SHIP_LEVELING` (Task 1), `useEconomyStore.lumenBalance`/`fetchBalance` (existing).
- Produces: `<ShipLevelPanel />` — self-contained, no props (design spec §7: current level, stat bonus, next cost, upgrade button).

- [ ] **Step 1: Create `src/ui/fleet/ShipLevelPanel.tsx`** — full contents:

```tsx
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, FONT, RADIUS, SPACING } from '@/src/constants/theme';
import { SHIP_LEVELING } from '@/src/constants/game';
import { shipLevelCost } from '@/src/game/battle';
import { useBattleStore } from '@/src/stores/useBattleStore';
import { useEconomyStore } from '@/src/stores/useEconomyStore';

/** Ship Level upgrade panel (design spec §7) — sits under the Loadout stats row. */
export function ShipLevelPanel() {
  const { progress, error, fetchProgress, levelUpShip } = useBattleStore();
  const { lumenBalance, fetchBalance } = useEconomyStore();

  useEffect(() => {
    fetchProgress();
    fetchBalance();
  }, [fetchProgress, fetchBalance]);

  const level = progress?.shipLevel ?? 1;
  const salvage = progress?.salvage ?? 0;
  const cost = shipLevelCost(level);
  const bonusPct = Math.round((level - 1) * SHIP_LEVELING.STAT_BONUS_PER_LEVEL * 100);
  const affordable = cost != null && lumenBalance >= cost.lumens && salvage >= cost.salvage;

  async function handleUpgrade() {
    await levelUpShip();
    // upgrade_ship debits Lumens server-side — refresh the local balance too
    await fetchBalance();
  }

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View>
          <Text style={styles.levelLabel}>SHIP LEVEL</Text>
          <Text style={styles.levelValue}>{level}</Text>
          <Text style={styles.bonus}>+{bonusPct}% HP · damage · shields</Text>
        </View>
        <View style={styles.right}>
          {cost ? (
            <>
              <View style={styles.costRow}>
                <Text
                  style={[
                    styles.costChip,
                    { color: COLORS.accent },
                    lumenBalance < cost.lumens && styles.costShort,
                  ]}
                >
                  ✦ {cost.lumens.toLocaleString()}
                </Text>
                <Text
                  style={[
                    styles.costChip,
                    { color: COLORS.primary },
                    salvage < cost.salvage && styles.costShort,
                  ]}
                >
                  ⚙ {cost.salvage.toLocaleString()}
                </Text>
              </View>
              <Pressable
                style={[styles.upgradeBtn, !affordable && styles.upgradeBtnDisabled]}
                onPress={handleUpgrade}
                disabled={!affordable}
              >
                <Text style={[styles.upgradeText, !affordable && styles.upgradeTextDisabled]}>
                  UPGRADE → {level + 1}
                </Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.maxed}>MAX LEVEL</Text>
          )}
        </View>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, gap: SPACING.sm,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  levelLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  levelValue: { color: COLORS.text, fontSize: FONT.lg, fontWeight: '800' },
  bonus: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  right: { alignItems: 'flex-end', gap: SPACING.sm },
  costRow: { flexDirection: 'row', gap: SPACING.sm },
  costChip: { fontSize: 13, fontWeight: '700' },
  costShort: { opacity: 0.45 },
  upgradeBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
  },
  upgradeBtnDisabled: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  upgradeText: { color: COLORS.background, fontSize: FONT.sm - 1, fontWeight: '800' },
  upgradeTextDisabled: { color: COLORS.muted },
  maxed: { color: COLORS.accent, fontSize: FONT.sm, fontWeight: '800', letterSpacing: 1 },
  error: { color: COLORS.danger, fontSize: 12 },
});
```

- [ ] **Step 2: Insert the panel in `src/ui/fleet/LoadoutScreen.tsx`.** Add the import:

```tsx
import { ShipLevelPanel } from './ShipLevelPanel';
```

and in the JSX, directly after the `statsRow` view:

```tsx
        <View style={styles.statsRow}>
          <RadarChart equipped={equippedComponents} />
          <PowerScore score={powerScore} />
        </View>

        <ShipLevelPanel />
```

- [ ] **Step 3: Typecheck + lint + full suite**

Run: `npx tsc --noEmit; npm run lint; npm test`
Expected: clean. (`levelUpShip`'s success/error paths are already unit-tested in Task 14; this panel is thin wiring.)

- [ ] **Step 4: Commit**

```bash
git add src/ui/fleet/ShipLevelPanel.tsx src/ui/fleet/LoadoutScreen.tsx
git commit -m "feat: ship level upgrade panel on Loadout screen"
```

---

### Task 21: Exploration integration — Planetary Defense contest + Wormhole use

The collect flow forks when a mission rolled a fragment: instead of silently showing an
un-credited badge (the phantom-fragment bug, design spec §8.3), the player is prompted to
fight the defenders. Win → the Edge Function credits a real fragment. Lose/forfeit → base
resources only. Wormholes (from the spin pool, Task 7) let an in-transit fleet arrive
instantly, consumed server-side via `use-item` (Task 12).

**Files:**
- Modify: `src/stores/useExplorationStore.ts` (add `applyWormhole`)
- Modify: `src/stores/useExplorationStore.test.ts` (new describe block)
- Modify: `src/stores/useEconomyStore.ts` (add `consumeItem`)
- Modify: `src/ui/exploration/SystemSheet.tsx` (full rewrite below — `onContest` prop + wormhole button)
- Create: `src/ui/exploration/ContestPrompt.tsx`
- Modify: `src/ui/exploration/DiscoveryCard.tsx` (`fragmentOutcome` prop replaces the fragmentDrop display)
- Modify: `src/ui/exploration/StarMapScreen.tsx` (contest flow wiring)
- Modify: `src/ui/battle/BattleReplayScreen.tsx` (amendment to Task 18's `onContinue`)

**Interfaces:**
- Consumes: `useBattleStore.challengeDefense(missionId, systemId)` / `pendingBattle` / `clearPendingBattle` / `isChallenging` / `error` (Task 14), `use-item` Edge Fn `POST { itemType: 'wormhole' } → { ok, remaining }` (Task 12), `cancelNotification` (existing), `InventoryItem.itemType === 'wormhole'` (Task 1).
- Produces:
  - `useExplorationStore.applyWormhole(missionId: UUID): void` — in-transit mission → arrived now.
  - `useEconomyStore.consumeItem(itemType: ItemType): Promise<{ error?: string }>` — calls the `use-item` Edge Fn, refreshes inventory. (Named `consumeItem`, NOT `useItem` — a destructured function starting with `use` trips `react-hooks/rules-of-hooks` when called inside a handler.)
  - `SystemSheet` prop `onContest(result: DiscoveryResult, systemName: string): void` (called instead of `onCollect` when `result.fragmentDrop` is set).
  - `<ContestPrompt systemName tier busy error onEngage onForfeit />`.
  - `DiscoveryCard` prop `fragmentOutcome?: FragmentOutcome` where `export interface FragmentOutcome { won: boolean; fragment: { slot: ComponentSlot; tier: ComponentTier } | null }` (exported from `DiscoveryCard.tsx`).

- [ ] **Step 1: Write the failing store test.** Append to `src/stores/useExplorationStore.test.ts` (the file already mocks AsyncStorage and the notifications service — reuse its style):

```ts
describe('applyWormhole', () => {
  it('makes an in_transit mission arrive instantly and cancels its notification', () => {
    useExplorationStore.setState({
      activeMissions: [{
        id: 'm7', systemId: 'sys-0', departedAt: Date.now(),
        arrivesAt: Date.now() + 999_999, fuelCost: 3,
        status: 'in_transit', notificationId: 'notif-w1',
      }],
    });
    act(() => { useExplorationStore.getState().applyWormhole('m7'); });
    const m = useExplorationStore.getState().activeMissions[0]!;
    expect(m.status).toBe('arrived');
    expect(m.arrivesAt).toBeLessThanOrEqual(Date.now());
    expect(cancelNotification).toHaveBeenCalledWith('notif-w1');
  });

  it('does nothing for missions that are not in transit', () => {
    useExplorationStore.setState({
      activeMissions: [{
        id: 'm8', systemId: 'sys-0', departedAt: 0, arrivesAt: 0,
        fuelCost: 3, status: 'collected',
      }],
    });
    act(() => { useExplorationStore.getState().applyWormhole('m8'); });
    expect(useExplorationStore.getState().activeMissions[0]!.status).toBe('collected');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/stores/useExplorationStore.test.ts`
Expected: FAIL — `applyWormhole is not a function`.

- [ ] **Step 3: Implement `applyWormhole`.** In `src/stores/useExplorationStore.ts`, add to the `ExplorationState` interface:

```ts
  applyWormhole(missionId: UUID): void;
```

and to the store body (after `checkArrivals`):

```ts
      applyWormhole(missionId) {
        const mission = get().activeMissions.find(m => m.id === missionId);
        if (!mission || mission.status !== 'in_transit') return;
        if (mission.notificationId) cancelNotification(mission.notificationId);
        set(s => ({
          activeMissions: s.activeMissions.map(m =>
            m.id === missionId
              ? { ...m, arrivesAt: Date.now(), status: 'arrived' as MissionStatus, notificationId: undefined }
              : m
          ),
        }));
      },
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/stores/useExplorationStore.test.ts`
Expected: PASS (all pre-existing tests too).

- [ ] **Step 5: Add `consumeItem` to `src/stores/useEconomyStore.ts`.** In the `EconomyStore` interface:

```ts
  consumeItem: (itemType: ItemType) => Promise<{ error?: string }>;
```

and in the store body (mirrors `buyListing`'s fetch pattern):

```ts
  consumeItem: async (itemType: ItemType) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { error: 'Not authenticated' };
    const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/use-item`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ itemType }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { error: (body as { error?: string }).error ?? 'Item use failed' };
    }
    await get().fetchInventory();
    return {};
  },
```

- [ ] **Step 6: Rewrite `src/ui/exploration/SystemSheet.tsx`** — full contents (adds `onContest`, the wormhole button, and fixes the inline `import()` type from the old Props):

```tsx
import React, { useEffect, useState } from 'react';
import {
  Modal, Pressable, ScrollView, StyleSheet, Text,
  TouchableWithoutFeedback, View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useExplorationStore } from '@/src/stores/useExplorationStore';
import { useEconomyStore } from '@/src/stores/useEconomyStore';
import { calculateFuelCost, calculateTravelTime } from '@/src/game/exploration';
import { COLORS, FONT, RADIUS, SPACING } from '@/src/constants/theme';
import type { StarSystem } from '@/src/types';
import type { DiscoveryResult, FleetMission } from '@/src/types/exploration';

interface Props {
  system: StarSystem;
  onClose(): void;
  onCollect(result: DiscoveryResult, systemName: string): void;
  /** Collected mission rolled a fragment — hand off to the contest flow (design spec §8.1). */
  onContest(result: DiscoveryResult, systemName: string): void;
}

function formatDuration(ms: number): string {
  const mins = Math.round(ms / 60_000);
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function formatEta(arrivesAt: number): string {
  const remaining = Math.max(0, arrivesAt - Date.now());
  return `Returns in ${formatDuration(remaining)}`;
}

export function SystemSheet({ system, onClose, onCollect, onContest }: Props) {
  const {
    starSystems, activeMissions, fuel, dispatchFleet, collectMission, applyWormhole,
  } = useExplorationStore();
  const { inventory, fetchInventory, consumeItem } = useEconomyStore();
  const [wormholeBusy, setWormholeBusy] = useState(false);
  const [wormholeError, setWormholeError] = useState<string | null>(null);
  const home = starSystems.find(s => s.id === 'sol-home');

  useEffect(() => {
    fetchInventory().catch(() => {}); // count is display-only; use-item revalidates
  }, [fetchInventory]);

  const wormholeCount = inventory
    .filter(i => i.itemType === 'wormhole')
    .reduce((n, i) => n + i.quantity, 0);

  const fuelCost = home ? calculateFuelCost(home.position, system.position) : 0;
  const travelMs = home ? calculateTravelTime(home.position, system.position) : 0;

  const activeMission: FleetMission | undefined = activeMissions.find(
    m => m.systemId === system.id && (m.status === 'in_transit' || m.status === 'arrived')
  );

  const arrivedMission = activeMissions.find(
    m => m.systemId === system.id && m.status === 'arrived'
  );

  const handleDispatch = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    dispatchFleet(system.id);
    onClose();
  };

  const handleCollect = () => {
    collectMission(arrivedMission!.id);
    const updated = useExplorationStore.getState().discoveries;
    const result = updated.find(d => d.missionId === arrivedMission!.id);
    if (result) {
      // Fragment eligibility → the prize must be won, not granted (design spec §8.1)
      if (result.fragmentDrop) onContest(result, system.name);
      else onCollect(result, system.name);
    }
    onClose();
  };

  const handleWormhole = async () => {
    if (!activeMission || wormholeBusy) return;
    setWormholeBusy(true);
    setWormholeError(null);
    const { error } = await consumeItem('wormhole'); // server decrements inventory first
    if (error) {
      setWormholeError(error); // mission timer untouched on failure (design spec §11)
      setWormholeBusy(false);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    applyWormhole(activeMission.id);
    setWormholeBusy(false);
  };

  let buttonLabel = `Send Fleet  (${fuelCost} fuel)`;
  let buttonDisabled = false;
  if (activeMission?.status === 'in_transit') {
    buttonLabel = formatEta(activeMission.arrivesAt);
    buttonDisabled = true;
  } else if (activeMission?.status === 'arrived') {
    buttonLabel = 'Fleet Returned — Collect Below';
    buttonDisabled = true;
  } else if (fuel < fuelCost) {
    buttonLabel = 'Not enough fuel';
    buttonDisabled = true;
  }

  const dangerStars = '★'.repeat(system.dangerLevel) + '☆'.repeat(5 - system.dangerLevel);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <View style={styles.sheet}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* System name + danger */}
          <View style={styles.headerRow}>
            <Text style={styles.systemName}>{system.name}</Text>
            <Text style={styles.danger}>{dangerStars}</Text>
          </View>

          {/* Travel info */}
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Travel time</Text>
            <Text style={styles.infoValue}>{formatDuration(travelMs)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Fuel cost</Text>
            <Text style={styles.infoValue}>{fuelCost} / {fuel} available</Text>
          </View>

          {/* Planet list */}
          <Text style={styles.sectionLabel}>
            {system.planets.length} planet{system.planets.length !== 1 ? 's' : ''}
          </Text>
          <ScrollView style={styles.planetList} nestedScrollEnabled>
            {system.planets.map(p => (
              <View key={p.id} style={styles.planetRow}>
                <Text style={styles.planetName}>{p.discovered ? p.name : '???'}</Text>
                {p.discovered && (
                  <Text style={styles.richness}>
                    {'▰'.repeat(Math.round(p.resourceRichness * 5))}
                    {'▱'.repeat(5 - Math.round(p.resourceRichness * 5))}
                  </Text>
                )}
              </View>
            ))}
          </ScrollView>

          {/* Action button */}
          {arrivedMission ? (
            <Pressable style={styles.dispatchBtn} onPress={handleCollect}>
              <Text style={styles.dispatchBtnText}>Collect Fleet →</Text>
            </Pressable>
          ) : (
            <Pressable
              style={[styles.dispatchBtn, buttonDisabled && styles.dispatchBtnDisabled]}
              onPress={handleDispatch}
              disabled={buttonDisabled}
            >
              <Text style={styles.dispatchBtnText}>{buttonLabel}</Text>
            </Pressable>
          )}

          {/* Wormhole shortcut — only while the fleet is in transit (design spec §8.2) */}
          {activeMission?.status === 'in_transit' && wormholeCount > 0 && (
            <Pressable
              style={[styles.wormholeBtn, wormholeBusy && styles.wormholeBtnBusy]}
              onPress={handleWormhole}
              disabled={wormholeBusy}
            >
              <Text style={styles.wormholeBtnText}>
                🌀 Use Wormhole ({wormholeCount}) — arrive now
              </Text>
            </Pressable>
          )}
          {wormholeError ? <Text style={styles.wormholeError}>{wormholeError}</Text> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay:             { flex: 1, justifyContent: 'flex-end' },
  backdrop:            { flex: 1, backgroundColor: '#00000080' },
  sheet:               { backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.lg,
                         borderTopRightRadius: RADIUS.lg, padding: SPACING.lg,
                         gap: SPACING.md, maxHeight: '65%' },
  handle:              { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border,
                         alignSelf: 'center', marginBottom: SPACING.sm },
  headerRow:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  systemName:          { color: COLORS.text, fontSize: FONT.lg, fontWeight: '700' },
  danger:              { color: COLORS.accent, fontSize: FONT.sm },
  infoRow:             { flexDirection: 'row', justifyContent: 'space-between' },
  infoLabel:           { color: COLORS.muted, fontSize: FONT.sm },
  infoValue:           { color: COLORS.text, fontSize: FONT.sm },
  sectionLabel:        { color: COLORS.muted, fontSize: FONT.sm, fontWeight: '600' },
  planetList:          { maxHeight: 120 },
  planetRow:           { flexDirection: 'row', justifyContent: 'space-between',
                         paddingVertical: SPACING.xs },
  planetName:          { color: COLORS.text, fontSize: FONT.sm },
  richness:            { color: COLORS.primary, fontSize: FONT.sm },
  dispatchBtn:         { backgroundColor: COLORS.primary, borderRadius: RADIUS.md,
                         padding: SPACING.md, alignItems: 'center' },
  dispatchBtnDisabled: { opacity: 0.4 },
  dispatchBtnText:     { color: COLORS.background, fontSize: FONT.sm, fontWeight: '700' },
  wormholeBtn:         { borderWidth: 1, borderColor: COLORS.primary, borderRadius: RADIUS.md,
                         padding: SPACING.md, alignItems: 'center' },
  wormholeBtnBusy:     { opacity: 0.5 },
  wormholeBtnText:     { color: COLORS.primary, fontSize: FONT.sm, fontWeight: '700' },
  wormholeError:       { color: COLORS.danger, fontSize: 12, textAlign: 'center' },
});
```

(The `dispatchBtn` gradient/disabled restyle is deliberately NOT done here — Task 23 owns the visual pass; this task keeps the sheet's existing look and only adds behavior.)

- [ ] **Step 7: Create `src/ui/exploration/ContestPrompt.tsx`** — full contents:

```tsx
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, FONT, RADIUS, SPACING } from '@/src/constants/theme';
import { TIER_STYLES } from '@/src/ui/spin/tierStyles';
import type { ComponentTier } from '@/src/game/ships/types';

interface Props {
  systemName: string;
  tier: ComponentTier;   // the contested fragment's rolled tier
  busy: boolean;         // challengeDefense in flight
  error: string | null;  // store error — shown inline so the player can retry Engage
  onEngage(): void;
  onForfeit(): void;
}

/** Defender encounter (design spec §8.1): fight for the fragment or forfeit it.
 *  Dismissing (Android back) forfeits — same as declining. */
export function ContestPrompt({ systemName, tier, busy, error, onEngage, onForfeit }: Props) {
  const tierStyle = TIER_STYLES[tier];
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onForfeit}>
      <View style={styles.overlay}>
        <View style={[styles.card, { borderColor: tierStyle.border }]}>
          <Text style={styles.title}>HOSTILE DEFENDERS</Text>
          <Text style={styles.body}>
            A defender fleet guards a{' '}
            <Text style={{ color: tierStyle.border, fontWeight: '700' }}>{tierStyle.label}</Text>
            {' '}fragment at {systemName}.
          </Text>
          <Text style={styles.warning}>One attempt. Forfeit and the fragment is lost.</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable
            style={[styles.engageBtn, busy && styles.btnBusy]}
            onPress={onEngage}
            disabled={busy}
          >
            <Text style={styles.engageText}>{busy ? 'ENGAGING…' : '⚔️ ENGAGE'}</Text>
          </Pressable>
          <Pressable style={styles.forfeitBtn} onPress={onForfeit} disabled={busy}>
            <Text style={styles.forfeitText}>Forfeit the fragment</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: '#000000CC', justifyContent: 'center',
                 alignItems: 'center', padding: SPACING.lg },
  card:        { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1.5,
                 padding: SPACING.lg, width: '100%', gap: SPACING.md, alignItems: 'center' },
  title:       { color: COLORS.danger, fontSize: FONT.lg, fontWeight: '900', letterSpacing: 2 },
  body:        { color: COLORS.text, fontSize: FONT.sm, textAlign: 'center' },
  warning:     { color: COLORS.muted, fontSize: 12, textAlign: 'center' },
  error:       { color: COLORS.danger, fontSize: 12, textAlign: 'center' },
  engageBtn:   { backgroundColor: COLORS.danger, borderRadius: RADIUS.md, alignSelf: 'stretch',
                 padding: SPACING.md, alignItems: 'center' },
  btnBusy:     { opacity: 0.6 },
  engageText:  { color: COLORS.text, fontSize: FONT.md, fontWeight: '800', letterSpacing: 1 },
  forfeitBtn:  { padding: SPACING.sm },
  forfeitText: { color: COLORS.muted, fontSize: FONT.sm },
});
```

- [ ] **Step 8: Rework the fragment display in `src/ui/exploration/DiscoveryCard.tsx`.** Add `ComponentSlot` to the ships-types import, export the outcome type, and extend Props:

```tsx
import type { ComponentSlot, ComponentTier } from '@/src/game/ships/types';

export interface FragmentOutcome {
  won: boolean;
  fragment: { slot: ComponentSlot; tier: ComponentTier } | null;
}

interface Props {
  result: DiscoveryResult;
  systemName: string;
  /** Present when a defense fight (or forfeit) decided the fragment. */
  fragmentOutcome?: FragmentOutcome;
  onClose(): void;
}
```

Add a local helper above the component:

```tsx
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
```

then **delete** the old `{result.fragmentDrop && (...)}` block entirely and render this in its
place (un-won `fragmentDrop` must never display again — that was the phantom-fragment bug,
design spec §8.3):

```tsx
          {/* Fragment contest outcome — only a won defense fight yields a fragment */}
          {fragmentOutcome && (
            <>
              <Text style={styles.section}>Fragment Contest</Text>
              {fragmentOutcome.won && fragmentOutcome.fragment ? (
                <View style={styles.lootRow}>
                  <Text style={styles.resource}>
                    {capitalize(fragmentOutcome.fragment.slot)} Fragment recovered
                  </Text>
                  <TierBadge tier={fragmentOutcome.fragment.tier} />
                </View>
              ) : (
                <Text style={styles.forfeited}>The defenders keep their prize.</Text>
              )}
            </>
          )}
```

(destructure `fragmentOutcome` in the component signature) and add the style:

```ts
  forfeited:     { color: COLORS.muted, fontSize: FONT.sm, fontStyle: 'italic' },
```

- [ ] **Step 9: Wire the contest flow in `src/ui/exploration/StarMapScreen.tsx`.** Add imports:

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { useBattleStore } from '@/src/stores/useBattleStore';
import { ContestPrompt } from './ContestPrompt';
import type { FragmentOutcome } from './DiscoveryCard';
```

Replace the `pendingResult` state and add contest state + store hooks:

```tsx
  const [pendingResult, setPendingResult] = useState<
    { result: DiscoveryResult; systemName: string; fragmentOutcome?: FragmentOutcome } | null
  >(null);
  const [contest, setContest] = useState<
    { result: DiscoveryResult; systemName: string } | null
  >(null);
  const router = useRouter();
  const { challengeDefense, isChallenging, error: battleError } = useBattleStore();
  const pendingBattle = useBattleStore(s => s.pendingBattle);
```

Add the handlers inside the component (below the gesture setup):

```tsx
  const handleEngage = useCallback(async () => {
    if (!contest) return;
    await challengeDefense(contest.result.missionId, contest.result.systemId);
    // pendingBattle being set hides the ContestPrompt modal (see JSX condition) —
    // an RN Modal would otherwise float above the pushed route.
    if (useBattleStore.getState().pendingBattle) {
      router.push('/battle-replay');
    }
    // On error the prompt stays open showing store.error — retry or forfeit.
  }, [contest, challengeDefense, router]);

  const handleForfeit = useCallback(() => {
    if (!contest) return;
    setPendingResult({
      result: contest.result,
      systemName: contest.systemName,
      fragmentOutcome: { won: false, fragment: null },
    });
    setContest(null);
  }, [contest]);

  // Returning from /battle-replay: the replay leaves defense pendingBattle in the
  // store (this task's BattleReplayScreen amendment) — convert it into the
  // DiscoveryCard outcome, then clear it.
  useFocusEffect(useCallback(() => {
    const pending = useBattleStore.getState().pendingBattle;
    if (!contest || !pending || pending.source !== 'defense') return;
    setPendingResult({
      result: contest.result,
      systemName: contest.systemName,
      fragmentOutcome: { won: pending.won, fragment: pending.fragment ?? null },
    });
    setContest(null);
    useBattleStore.getState().clearPendingBattle();
  }, [contest]));
```

Update the JSX at the bottom of the component:

```tsx
      {selected && (
        <SystemSheet
          system={selected}
          onClose={() => setSelected(null)}
          onCollect={(result, systemName) => {
            setSelected(null);
            setPendingResult({ result, systemName });
          }}
          onContest={(result, systemName) => {
            setSelected(null);
            setContest({ result, systemName });
          }}
        />
      )}

      {contest && !pendingBattle && (
        <ContestPrompt
          systemName={contest.systemName}
          tier={contest.result.fragmentDrop!}
          busy={isChallenging}
          error={battleError}
          onEngage={handleEngage}
          onForfeit={handleForfeit}
        />
      )}

      {pendingResult && (
        <DiscoveryCard
          result={pendingResult.result}
          systemName={pendingResult.systemName}
          fragmentOutcome={pendingResult.fragmentOutcome}
          onClose={() => setPendingResult(null)}
        />
      )}
```

(`contest.result.fragmentDrop!` is safe: the contest state is only ever set from the
`onContest` path, which requires `fragmentDrop`.)

- [ ] **Step 10: Amend `src/ui/battle/BattleReplayScreen.tsx` (Task 18's result card).** In the `BattleResultCard` `onContinue` written in Task 18 Step 4(c), replace:

```tsx
              onContinue={() => {
                useBattleStore.getState().clearPendingBattle();
                router.back();
              }}
```

with:

```tsx
              onContinue={() => {
                // Defense: StarMapScreen consumes pendingBattle on refocus to show
                // the fragment outcome, then clears it. Skirmish/PvP clear here.
                if (pending.source !== 'defense') {
                  useBattleStore.getState().clearPendingBattle();
                }
                router.back();
              }}
```

- [ ] **Step 11: Typecheck + lint + full suite**

Run: `npx tsc --noEmit; npm run lint; npm test`
Expected: clean; exploration + battle store suites green.

- [ ] **Step 12: Commit**

```bash
git add src/stores/useExplorationStore.ts src/stores/useExplorationStore.test.ts src/stores/useEconomyStore.ts src/ui/exploration/SystemSheet.tsx src/ui/exploration/ContestPrompt.tsx src/ui/exploration/DiscoveryCard.tsx src/ui/exploration/StarMapScreen.tsx src/ui/battle/BattleReplayScreen.tsx
git commit -m "feat: planetary defense contest flow + wormhole instant arrival"
```

---

### Task 22: Spin overhaul — randomized overshoot landing + reel prettying

Replaces the fixed `WINNER_INDEX` + timed pause/lurch with a per-spin randomized landing
position and an overshoot-and-settle spring (visual spec §B2.4), and dresses the screen per
§B2.1–B2.3. All randomness here is **presentation-only** — the prize is always the server's
result; only *where in the strip* it lands and *how the reel settles* varies. The fixed
`REEL_CONTAINER_WIDTH = 740` (which silently overflowed a 412dp screen) is replaced by a
full-bleed framed window.

**Files:**
- Modify: `src/ui/spin/constants.ts` (full rewrite below)
- Modify: `src/ui/spin/reelData.ts` (`buildReelData` signature) + `src/ui/spin/reelData.test.ts`
- Modify: `src/ui/spin/SpinReel.tsx` (full rewrite — Reanimated)
- Modify: `src/ui/spin/SpinScreen.tsx` (full rewrite — frame, landing zone, backdrop)
- Modify: `src/ui/spin/SpinButtons.tsx` (full rewrite — gradient buttons)

**Interfaces:**
- Consumes: `GRADIENTS`, `COLORS.primaryGlow` (Task 13), `SpaceBackground` (Task 13), `TIER_STYLES` (existing), `useSpinStore` (existing, unchanged).
- Produces:
  - `buildReelData(result: SpinResult, winnerIndex: number): ReelItem[]` (breaking change from 1-arg).
  - `SpinReel` handle: `start(plan: LandingPlan, onDone: () => void): void` with `export interface LandingPlan { winnerIndex: number; overshootPx: number; spring: { damping: number; stiffness: number; mass: number } }` (replaces `start(isFakeout, onDone)`).
  - Constants: `WINNER_INDEX_MIN/MAX`, `LANDING`, `STANDARD_LANDING_PROB(_RARE_PLUS)`, `SPRING_REST`; **deleted:** `WINNER_INDEX`, `VISIBLE_CARDS`, `REEL_CONTAINER_WIDTH`, `ANIM.PAUSE_MS`, `ANIM.LURCH_MS`.
- `formatCountdown` keeps its export (SpinButtons.test.ts depends on it).

- [ ] **Step 1: Rewrite `src/ui/spin/constants.ts`** — full contents:

```ts
export const REEL_TOTAL = 40;
// Winner lands at a randomized index each spin (presentation-only, visual spec §B2.4).
// REEL_TOTAL − WINNER_INDEX_MAX ≥ 3 cards remain past the winner for overshoot travel.
export const WINNER_INDEX_MIN = 30;
export const WINNER_INDEX_MAX = 36;

export const CARD_WIDTH = 136;
export const CARD_HEIGHT = 168;
export const CARD_MARGIN = 12;
export const CARD_STEP = CARD_WIDTH + CARD_MARGIN; // px per card slot

export const ANIM = {
  FAST_MS: 500,
  DECEL_MS: 1400,
} as const;

/** Overshoot-and-settle landing configs (visual spec §B2.4 table). */
export interface LandingConfig {
  overshootMin: number; // × CARD_WIDTH
  overshootMax: number; // × CARD_WIDTH
  spring: { damping: number; stiffness: number; mass: number };
}

export const LANDING: Record<'standard' | 'nearMiss', LandingConfig> = {
  // ζ≈0.64 — one small counter-bounce, "chunk-settle"
  standard: {
    overshootMin: 0.15, overshootMax: 0.40,
    spring: { damping: 14, stiffness: 120, mass: 1 },
  },
  // ζ≈1.06 — zero bounce; pointer visibly crosses onto the neighbor, crawls back
  nearMiss: {
    overshootMin: 0.50, overshootMax: 0.62,
    spring: { damping: 18, stiffness: 60, mass: 1.2 },
  },
};

/** P(standard landing); near-miss otherwise. Rarer prizes tease more often. */
export const STANDARD_LANDING_PROB = 0.82;
export const STANDARD_LANDING_PROB_RARE_PLUS = 0.65;

/** Tight rest thresholds so the spring's onDone fires promptly. */
export const SPRING_REST = {
  restDisplacementThreshold: 0.5,
  restSpeedThreshold: 0.5,
} as const;
```

- [ ] **Step 2: Update the reelData tests for the new signature** — in `src/ui/spin/reelData.test.ts`, replace the `WINNER_INDEX` import with `WINNER_INDEX_MAX, WINNER_INDEX_MIN` and rewrite the `buildReelData` describe block (the `spinResultToReelItem` block is untouched):

```ts
import { buildReelData, spinResultToReelItem } from './reelData';
import { REEL_TOTAL, WINNER_INDEX_MAX, WINNER_INDEX_MIN } from './constants';
```

```ts
const WINNER = 33;

describe('buildReelData', () => {
  it('returns exactly REEL_TOTAL items', () => {
    expect(buildReelData(shipResult, WINNER)).toHaveLength(REEL_TOTAL);
  });

  it('places winner at any index in the randomized range', () => {
    for (const idx of [WINNER_INDEX_MIN, WINNER, WINNER_INDEX_MAX]) {
      const items = buildReelData(shipResult, idx);
      expect(items[idx].id).toBe('winner');
      expect(items[idx].tier).toBe('rare');
    }
  });

  it('does not place winner at any other index', () => {
    const items = buildReelData(shipResult, WINNER);
    items.forEach((item, i) => {
      if (i !== WINNER) expect(item.id).not.toBe('winner');
    });
  });

  it('all filler items have non-empty labels', () => {
    const items = buildReelData(resourceResult, WINNER);
    items.forEach((item, i) => {
      if (i !== WINNER) expect(item.label.length).toBeGreaterThan(0);
    });
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm test -- src/ui/spin/reelData.test.ts`
Expected: FAIL — `WINNER_INDEX_MIN` not exported yet if Step 1 wasn't applied, or winner not at the passed index (old `buildReelData` ignores the second argument).

- [ ] **Step 4: Update `src/ui/spin/reelData.ts`.** Change the import to `import { REEL_TOTAL } from './constants';` and the builder to take the index:

```ts
export function buildReelData(result: SpinResult, winnerIndex: number): ReelItem[] {
  const rand = makeLCG(Date.now());
  const items: ReelItem[] = [];

  for (let i = 0; i < REEL_TOTAL; i++) {
    if (i === winnerIndex) {
      items.push(spinResultToReelItem(result));
      continue;
    }
    const tier = pickTier(rand());
    const pool = TIER_POOL[tier];
    const template = pool[Math.floor(rand() * pool.length)];
    items.push({ ...template, tier, id: `filler-${i}` });
  }

  return items;
}
```

Run: `npm test -- src/ui/spin/reelData.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewrite `src/ui/spin/SpinReel.tsx`** — full contents (RN `Animated` → Reanimated; the frame/pointer move to SpinScreen, the reel keeps only the clipped track):

```tsx
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing, cancelAnimation, runOnJS, useAnimatedReaction, useAnimatedStyle,
  useSharedValue, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { SPACING } from '@/src/constants/theme';
import { ANIM, CARD_STEP, CARD_WIDTH, SPRING_REST } from './constants';
import { ReelCard } from './ReelCard';
import type { ReelItem } from './reelData';

/** One spin's landing choreography — built per spin by SpinScreen (presentation-only). */
export interface LandingPlan {
  winnerIndex: number;
  overshootPx: number;
  spring: { damping: number; stiffness: number; mass: number };
}

export interface SpinReelHandle {
  start(plan: LandingPlan, onDone: () => void): void;
}

type Props = {
  items: ReelItem[];
  centerIndex: number; // -1 = no highlight (during the run)
};

const START_INDEX = 2; // card visually centered before the first spin

export const SpinReel = forwardRef<SpinReelHandle, Props>(function SpinReel(
  { items, centerIndex },
  ref,
) {
  const { width } = useWindowDimensions();
  // Frame = screen minus screen padding (visual spec §B2.2) — replaces CENTER_SLOT math.
  const frameInnerWidth = width - 2 * SPACING.md;
  const toOffset = (i: number) => frameInnerWidth / 2 - CARD_WIDTH / 2 - i * CARD_STEP;

  const translateX = useSharedValue(toOffset(START_INDEX));
  const lastTickAt = useRef(0);
  const crossings = useRef(0);

  // Haptic tick per card crossing, rate-gated by real elapsed time so Android
  // never queues and mushes them (visual spec §B2.4 haptics table).
  function tick() {
    const now = Date.now();
    const interval = now - lastTickAt.current;
    lastTickAt.current = now;
    crossings.current += 1;
    if (interval < 70) return;
    if (interval < 140) {
      if (crossings.current % 2 === 0) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
    } else if (interval < 280) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }

  useAnimatedReaction(
    () => Math.floor(-translateX.value / CARD_STEP),
    (slot, prevSlot) => {
      if (prevSlot !== null && slot !== prevSlot) runOnJS(tick)();
    },
  );

  useImperativeHandle(ref, () => ({
    start(plan, onDone) {
      cancelAnimation(translateX);
      translateX.value = toOffset(START_INDEX);
      lastTickAt.current = Date.now();
      crossings.current = 0;

      const final = toOffset(plan.winnerIndex);
      // fast linear → long ease-out PAST the winner → spring-settle back onto it
      translateX.value = withSequence(
        withTiming(toOffset(15), { duration: ANIM.FAST_MS, easing: Easing.linear }),
        withTiming(final - plan.overshootPx, {
          duration: ANIM.DECEL_MS,
          easing: Easing.out(Easing.cubic),
        }),
        withSpring(final, { ...plan.spring, ...SPRING_REST }, finished => {
          if (finished) runOnJS(onDone)();
        }),
      );
      // Overshoot apex = spring takeover (velocity sign flip): one Heavy tick.
      setTimeout(
        () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
        ANIM.FAST_MS + ANIM.DECEL_MS,
      );
    },
  }));

  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View style={[styles.clip, { width: frameInnerWidth }]}>
      <Animated.View style={[styles.track, trackStyle]}>
        {items.map((item, i) => (
          <ReelCard key={item.id} item={item} isCenter={i === centerIndex} />
        ))}
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  track: { flexDirection: 'row' },
});
```

- [ ] **Step 6: Rewrite `src/ui/spin/SpinScreen.tsx`** — full contents (backdrop, overline, framed reel window, landing zone, edge fades, accent pointer, per-spin landing plan):

```tsx
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  interpolateColor, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming,
} from 'react-native-reanimated';
import { COLORS, FONT, GRADIENTS, RADIUS, SPACING } from '@/src/constants/theme';
import { SpaceBackground } from '@/src/ui/common/SpaceBackground';
import { useSpinStore } from '@/src/stores/useSpinStore';
import { TIER_STYLES } from './tierStyles';
import { buildReelData, spinResultToReelItem } from './reelData';
import { SpinReel, SpinReelHandle, LandingPlan } from './SpinReel';
import { SpinResult } from './SpinResult';
import { SpinButtons } from './SpinButtons';
import {
  CARD_HEIGHT, CARD_WIDTH, LANDING, REEL_TOTAL,
  STANDARD_LANDING_PROB, STANDARD_LANDING_PROB_RARE_PLUS,
  WINNER_INDEX_MAX, WINNER_INDEX_MIN,
} from './constants';
import type { ReelItem } from './reelData';
import type { LootTier, SpinType } from '@/src/game/spin/types';

const PLACEHOLDER_ITEMS: ReelItem[] = Array.from({ length: REEL_TOTAL }, (_, i) => ({
  id: `placeholder-${i}`,
  tier: 'common',
  label: '?',
  sublabel: '',
  icon: '❓',
}));

// Presentation-only randomness (Math.random is fine here, not SeededRNG): the
// prize is always the server's result — only where the reel stops within the
// strip and how it settles varies per spin (visual spec §B2.4).
function buildLandingPlan(tier: LootTier): LandingPlan {
  const winnerIndex =
    WINNER_INDEX_MIN + Math.floor(Math.random() * (WINNER_INDEX_MAX - WINNER_INDEX_MIN + 1));
  const rarePlus = tier === 'rare' || tier === 'legendary' || tier === 'ultra_rare';
  const pStandard = rarePlus ? STANDARD_LANDING_PROB_RARE_PLUS : STANDARD_LANDING_PROB;
  const cfg = Math.random() < pStandard ? LANDING.standard : LANDING.nearMiss;
  const overshootPx =
    (cfg.overshootMin + Math.random() * (cfg.overshootMax - cfg.overshootMin)) * CARD_WIDTH;
  return { winnerIndex, overshootPx, spring: cfg.spring };
}

export function SpinScreen() {
  const { freeSpinAvailableAt, isSpinning, fetchSpinState, spin } = useSpinStore();
  const reelRef = useRef<SpinReelHandle>(null);
  const isMountedRef = useRef(true);
  const [reelItems, setReelItems] = useState<ReelItem[]>(PLACEHOLDER_ITEMS);
  const [resultItem, setResultItem] = useState<ReelItem | null>(null);
  const [centerIndex, setCenterIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);

  // Landing-zone outline: idle cyan → tier-color pulse on reveal (visual spec §B2.2)
  const zone = useSharedValue(0);
  const [zoneColors, setZoneColors] = useState({ border: COLORS.primary, glow: '#00000000' });
  const zoneStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(zone.value, [0, 1], ['#5EC8FF55', zoneColors.border]),
    backgroundColor: interpolateColor(zone.value, [0, 1], ['#00000000', zoneColors.glow]),
  }));

  useEffect(() => {
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    fetchSpinState();
  }, [fetchSpinState]);

  async function handleSpin(spinType: SpinType) {
    setError(null);
    setResultItem(null);
    setCenterIndex(-1);
    try {
      const result = await spin(spinType);
      const plan = buildLandingPlan(result.tier);
      setReelItems(buildReelData(result, plan.winnerIndex));

      reelRef.current?.start(plan, async () => {
        if (!isMountedRef.current) return;
        setCenterIndex(plan.winnerIndex);
        setResultItem(spinResultToReelItem(result));
        const t = TIER_STYLES[result.tier];
        setZoneColors({ border: t.border, glow: t.glow });
        zone.value = withSequence(
          withTiming(1, { duration: 250 }),
          withDelay(400, withTiming(0, { duration: 250 })),
        );
        await Haptics.notificationAsync(
          result.tier === 'ultra_rare' || result.tier === 'legendary'
            ? Haptics.NotificationFeedbackType.Success
            : Haptics.NotificationFeedbackType.Warning,
        );
        await fetchSpinState();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Spin failed — try again');
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <SpaceBackground seed={5} focalGlow={{ cx: 0.5, cy: 0.42, r: 0.55, color: '#5EC8FF12' }} />
      <View style={styles.container}>
        <Text style={styles.overline}>DAILY SPIN</Text>

        <View style={styles.content}>
          <View style={styles.reelSection}>
            <View style={styles.pointer} />
            <View style={styles.frameWrap}>
              <View style={styles.halo} pointerEvents="none" />
              <LinearGradient colors={[...GRADIENTS.reelBackdrop]} style={styles.frame}>
                <SpinReel ref={reelRef} items={reelItems} centerIndex={centerIndex} />
                <Animated.View style={[styles.zone, zoneStyle]} pointerEvents="none" />
                <LinearGradient
                  colors={['#0B0E1A', '#0B0E1A00']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={[styles.fade, { left: 0 }]} pointerEvents="none"
                />
                <LinearGradient
                  colors={['#0B0E1A00', '#0B0E1A']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={[styles.fade, { right: 0 }]} pointerEvents="none"
                />
              </LinearGradient>
            </View>
          </View>

          <View style={styles.resultSection}>
            <SpinResult item={resultItem} />
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        </View>

        <View style={styles.buttonsSection}>
          <SpinButtons
            freeSpinAvailableAt={freeSpinAvailableAt}
            ticketCount={0} // TODO: wire to inventory store when built
            isSpinning={isSpinning}
            onFreeSpin={() => handleSpin('free')}
            onTicketSpin={() => handleSpin('ticket')}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  // No horizontal padding here — the reel frame is full-bleed minus SPACING.md;
  // result/buttons sections pad themselves.
  container: { flex: 1, paddingTop: SPACING.lg, gap: SPACING.xl },
  overline: {
    color: COLORS.muted, fontSize: FONT.sm, fontWeight: '700',
    letterSpacing: 4, textAlign: 'center',
  },
  content: { flex: 1, justifyContent: 'center', gap: SPACING.xl },
  reelSection: { alignItems: 'center' },
  pointer: {
    width: 0, height: 0,
    borderLeftWidth: 12, borderRightWidth: 12, borderTopWidth: 18,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderTopColor: COLORS.accent, // prize marker = accent (visual spec §B2.2)
    marginBottom: 20,
  },
  frameWrap: { marginHorizontal: SPACING.md, alignSelf: 'stretch' },
  halo: {
    position: 'absolute', top: -6, bottom: -6, left: -6, right: -6,
    borderRadius: 28, borderWidth: 1, borderColor: COLORS.primaryGlow,
  },
  frame: {
    borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border,
    paddingVertical: SPACING.md, overflow: 'hidden',
  },
  zone: {
    position: 'absolute', top: SPACING.md - 6, left: '50%',
    marginLeft: -(CARD_WIDTH + 12) / 2,
    width: CARD_WIDTH + 12, height: CARD_HEIGHT + 12,
    borderRadius: 18, borderWidth: 2,
  },
  fade: { position: 'absolute', top: 0, bottom: 0, width: 56 },
  resultSection: { minHeight: 160, paddingHorizontal: SPACING.lg },
  buttonsSection: { paddingBottom: SPACING.lg, paddingHorizontal: SPACING.lg },
  error: { color: COLORS.danger, fontSize: FONT.sm, marginTop: SPACING.sm, textAlign: 'center' },
});
```

- [ ] **Step 7: Rewrite `src/ui/spin/SpinButtons.tsx`** — full contents (gradient CTAs; disabled = flat surface + muted text, never an opacity fade — visual spec §B0/§B2.3; `formatCountdown` unchanged so its test stays green):

```tsx
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONT, GRADIENTS, RADIUS, SPACING } from '@/src/constants/theme';

type Props = {
  freeSpinAvailableAt: Date | null;
  ticketCount: number;
  isSpinning: boolean;
  onFreeSpin: () => void;
  onTicketSpin: () => void;
};

export function formatCountdown(availableAt: Date): string {
  const diff = Math.max(0, availableAt.getTime() - Date.now());
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1_000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface SpinButtonProps {
  gradient: readonly string[];
  borderColor: string;
  disabled: boolean;
  onPress: () => void;
  children: React.ReactNode;
}

function SpinButton({ gradient, borderColor, disabled, onPress, children }: SpinButtonProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.btnWrap,
        pressed && !disabled && { transform: [{ scale: 0.97 }] },
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      {disabled ? (
        <View style={[styles.btn, styles.btnDisabled]}>{children}</View>
      ) : (
        <LinearGradient colors={[...gradient]} style={[styles.btn, { borderColor }]}>
          {children}
        </LinearGradient>
      )}
    </Pressable>
  );
}

export function SpinButtons({
  freeSpinAvailableAt,
  ticketCount,
  isSpinning,
  onFreeSpin,
  onTicketSpin,
}: Props) {
  const [countdown, setCountdown] = useState('');
  // eslint-disable-next-line react-hooks/purity -- Date.now() is needed to check if cooldown has passed
  const freeReady = !freeSpinAvailableAt || freeSpinAvailableAt.getTime() <= Date.now();

  useEffect(() => {
    if (freeReady || !freeSpinAvailableAt) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial tick so countdown is visible immediately
    setCountdown(formatCountdown(freeSpinAvailableAt));
    const id = setInterval(() => {
      setCountdown(formatCountdown(freeSpinAvailableAt));
    }, 1000);
    return () => clearInterval(id);
  }, [freeReady, freeSpinAvailableAt]);

  const freeDisabled = isSpinning || !freeReady;
  const ticketDisabled = isSpinning || ticketCount < 1;

  return (
    <View style={styles.row}>
      <SpinButton
        gradient={GRADIENTS.primaryBtn}
        borderColor="#8FDBFF55"
        disabled={freeDisabled}
        onPress={onFreeSpin}
      >
        {isSpinning ? (
          <ActivityIndicator color={COLORS.muted} size="small" />
        ) : (
          <>
            <Text style={[styles.btnLabel, freeDisabled && styles.labelDisabled]}>
              🎯 Free Spin
            </Text>
            {!freeReady && <Text style={styles.timer}>{countdown}</Text>}
          </>
        )}
      </SpinButton>

      <SpinButton
        gradient={GRADIENTS.accentBtn}
        borderColor="#FFD9A055"
        disabled={ticketDisabled}
        onPress={onTicketSpin}
      >
        {isSpinning ? (
          <ActivityIndicator color={COLORS.muted} size="small" />
        ) : (
          <>
            <Text style={[styles.btnLabel, ticketDisabled && styles.labelDisabled]}>
              🎫 Use Ticket
            </Text>
            <Text style={[styles.ticketCount, ticketDisabled && styles.labelDisabled]}>
              {ticketCount > 0 ? `${ticketCount} left` : 'No tickets'}
            </Text>
          </>
        )}
      </SpinButton>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: SPACING.md },
  btnWrap: { flex: 1 },
  btn: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 64,
  },
  btnDisabled: { backgroundColor: COLORS.surface, borderColor: COLORS.border },
  btnLabel: { color: COLORS.background, fontSize: FONT.md, fontWeight: '700' },
  labelDisabled: { color: COLORS.muted },
  timer: { color: COLORS.muted, fontSize: FONT.sm - 2, marginTop: 2 },
  ticketCount: { color: COLORS.background, fontSize: FONT.sm - 2, marginTop: 2, opacity: 0.8 },
});
```

- [ ] **Step 8: Typecheck + lint + full suite**

Run: `npx tsc --noEmit; npm run lint; npm test`
Expected: clean — the compiler will catch any straggler imports of the deleted constants (`WINNER_INDEX`, `REEL_CONTAINER_WIDTH`, `VISIBLE_CARDS`, `ANIM.PAUSE_MS`, `ANIM.LURCH_MS`); fix those by using the new API rather than re-adding constants.

- [ ] **Step 9: Emulator spot-check (if AVD running; otherwise Task 24):** two spins — landing position and settle must differ between them; reel never clips at the screen edge; disabled Free Spin shows a readable countdown on a flat surface button.

- [ ] **Step 10: Commit**

```bash
git add src/ui/spin/
git commit -m "feat: spin overshoot-and-settle landing, randomized winner index, framed reel"
```

---

### Task 23: App-wide visual polish pass (visual spec §B3)

Apply the §B3 checklist screen by screen. **Read each file before editing** — Tasks 20–22
already touched some of them, so line numbers here are approximate but the anchors
(style names, JSX blocks) are exact. **Skip StarMapScreen entirely** — it renders its own
star field; adding `SpaceBackground` there double-paints (visual spec §B1 adoption note).
The optional `expo-blur` sheet treatment in §B3 is deliberately skipped (YAGNI; modals
already read fine on the gradient).

**Files:**
- Modify: `src/ui/fleet/FleetScreen.tsx`, `src/ui/fleet/ShipCard.tsx`
- Modify: `src/ui/fleet/LoadoutScreen.tsx`, `src/ui/fleet/PowerScore.tsx`, `src/ui/fleet/LoadoutSlot.tsx`
- Modify: `src/ui/fleet/MarketScreen.tsx`
- Modify: `src/ui/exploration/SystemSheet.tsx`
- Modify: `src/ui/exploration/MissionTracker.tsx`
- Modify: `src/ui/Screen.tsx`, `app/(tabs)/tech.tsx`, `app/settings.tsx`

**Interfaces:**
- Consumes: `SpaceBackground`, `GRADIENTS`, `COLORS.borderBright/success/successGlow/accentGlow/primaryGlow` (Task 13).
- Produces: no API changes — `Screen` gains optional `glyph?: string` and `comingSoon?: boolean` props.

- [ ] **Step 1: FleetScreen + ShipCard.** In `FleetScreen.tsx`: add `import { SpaceBackground } from '@/src/ui/common/SpaceBackground';`, insert `<SpaceBackground seed={3} />` as the first child of the `SafeAreaView` (root keeps `COLORS.background` so nothing flashes on mount), and restyle the Auction House button to the secondary recipe:

```ts
  marketBtn: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderBright,
    padding: SPACING.md,
    alignItems: 'center',
  },
```

In `ShipCard.tsx`: apply the card rule (`GRADIENTS.card` + 1px border + `RADIUS.lg`) —

```tsx
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONT, GRADIENTS, RADIUS, SPACING } from '@/src/constants/theme';
```

```tsx
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <LinearGradient colors={[...GRADIENTS.card]} style={styles.card}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>🚀</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </LinearGradient>
    </TouchableOpacity>
```

with `card`'s `backgroundColor` removed and `borderRadius: RADIUS.lg` (border width/color stay).

- [ ] **Step 2: LoadoutScreen + PowerScore + LoadoutSlot.** In `LoadoutScreen.tsx`: add `<SpaceBackground seed={4} />` first child of the `SafeAreaView` (all three return branches share it — put it before the conditional returns' content, i.e. in each `SafeAreaView`), and wrap the stats row in a card:

```tsx
        <LinearGradient colors={[...GRADIENTS.card]} style={styles.statsCard}>
          <View style={styles.statsRow}>
            <RadarChart equipped={equippedComponents} />
            <PowerScore score={powerScore} />
          </View>
        </LinearGradient>
```

```ts
  statsCard: {
    borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.md,
  },
```

(imports: `LinearGradient` from `expo-linear-gradient`, `GRADIENTS`, `RADIUS` from theme.)

In `PowerScore.tsx`: find the score-number `Text` style and add a text-glow (text-shadow
works on both platforms, unlike view shadows):

```ts
    textShadowColor: '#5EC8FF66',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
```

In `LoadoutSlot.tsx`: tier color becomes scannable — on the container `View` (line ~57), add the equipped tier's left accent:

```tsx
    <View
      style={[
        styles.container,
        isExpanded && { borderColor: slotStyle.accent },
        equippedTier && { borderLeftWidth: 3, borderLeftColor: equippedTier.border },
      ]}
    >
```

- [ ] **Step 3: MarketScreen.** Add `<SpaceBackground seed={6} />` as first child of the `SafeAreaView`; import `LinearGradient`, `GRADIENTS`, `SpaceBackground`. Then:

(a) `balanceChip` gains a currency-token border:

```ts
  balanceChip: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.accentGlow,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
```

(b) active segment becomes a gradient — replace the segment `Pressable` body:

```tsx
          <Pressable
            key={t}
            style={styles.segment}
            onPress={() => setTab(t)}
          >
            {tab === t && (
              <LinearGradient
                colors={[...GRADIENTS.primaryBtn]}
                style={[StyleSheet.absoluteFill, { borderRadius: RADIUS.sm }]}
              />
            )}
            <Text style={[styles.segmentText, tab === t && styles.segmentTextActive]}>
              {t === 'browse' ? 'Browse' : 'My Listings'}
            </Text>
          </Pressable>
```

delete the `segmentActive` style and add `overflow: 'hidden'` to `segment`.

(c) FAB gradient + halo — replace the FAB block:

```tsx
      {/* FAB */}
      <View style={styles.fabHalo} pointerEvents="none" />
      <Pressable style={styles.fab} onPress={() => setModalVisible(true)}>
        <LinearGradient colors={[...GRADIENTS.primaryBtn]} style={styles.fabGradient}>
          <Text style={styles.fabText}>+</Text>
        </LinearGradient>
      </Pressable>
```

```ts
  fabHalo: {
    position: 'absolute',
    bottom: SPACING.xl - 8,
    right: SPACING.xl - 8,
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primaryGlow,
  },
  fab: {
    position: 'absolute',
    bottom: SPACING.xl,
    right: SPACING.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
  },
  fabGradient: { flex: 1, justifyContent: 'center', alignItems: 'center' },
```

(`fab`'s `backgroundColor`/centering move into `fabGradient`.)

- [ ] **Step 4: SystemSheet (visual only — behavior was Task 21).** Import `LinearGradient` + `GRADIENTS`. Convert the sheet `View` to a gradient with a bright top edge:

```tsx
        <LinearGradient colors={[...GRADIENTS.card]} style={styles.sheet}>
          ...existing children unchanged...
        </LinearGradient>
```

```ts
  sheet: {
    borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg,
    borderTopWidth: 1, borderTopColor: COLORS.borderBright,
    padding: SPACING.lg, gap: SPACING.md, maxHeight: '65%', overflow: 'hidden',
  },
```

Danger stars color-code (≥4 reads as a real threat):

```tsx
          <Text style={[styles.danger, system.dangerLevel >= 4 && { color: COLORS.danger }]}>
            {dangerStars}
          </Text>
```

Dispatch button → gradient CTA with a flat disabled state (replaces `opacity: 0.4`):

```tsx
          {arrivedMission ? (
            <Pressable onPress={handleCollect}>
              <LinearGradient colors={[...GRADIENTS.primaryBtn]} style={styles.dispatchBtn}>
                <Text style={styles.dispatchBtnText}>Collect Fleet →</Text>
              </LinearGradient>
            </Pressable>
          ) : buttonDisabled ? (
            <View style={[styles.dispatchBtn, styles.dispatchBtnDisabled]}>
              <Text style={[styles.dispatchBtnText, styles.dispatchBtnTextDisabled]}>
                {buttonLabel}
              </Text>
            </View>
          ) : (
            <Pressable onPress={handleDispatch}>
              <LinearGradient colors={[...GRADIENTS.primaryBtn]} style={styles.dispatchBtn}>
                <Text style={styles.dispatchBtnText}>{buttonLabel}</Text>
              </LinearGradient>
            </Pressable>
          )}
```

```ts
  dispatchBtn:             { borderRadius: RADIUS.md, padding: SPACING.md, alignItems: 'center' },
  dispatchBtnDisabled:     { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  dispatchBtnTextDisabled: { color: COLORS.muted },
```

(`dispatchBtn` loses `backgroundColor`; delete the old `opacity: 0.4` from `dispatchBtnDisabled`.)

- [ ] **Step 5: MissionTracker.** Tokenize the green and make "Collect!" visible peripherally:

```ts
  container:       { backgroundColor: COLORS.surface, borderTopWidth: 1,
                     borderTopColor: COLORS.borderBright },
  chip:            { backgroundColor: COLORS.background, borderRadius: RADIUS.sm,
                     borderWidth: 1, borderColor: COLORS.border,
                     padding: SPACING.sm, minWidth: 100, gap: 4 },
  chipArrived:     { borderColor: COLORS.success, backgroundColor: COLORS.successGlow },
  progressArrived: { backgroundColor: COLORS.success },
```

and apply the arrived style on the chip:

```tsx
            <Pressable
              key={mission.id}
              style={[styles.chip, arrived && styles.chipArrived]}
              onPress={() => onSelectSystem(sys)}
            >
```

- [ ] **Step 6: Placeholder screens (Screen + tech + settings).** Rewrite `src/ui/Screen.tsx` — full contents:

```tsx
import { StyleSheet, Text, View } from 'react-native';

import { COLORS, FONT, RADIUS, SPACING } from '@/src/constants/theme';
import { SpaceBackground } from '@/src/ui/common/SpaceBackground';

type ScreenProps = {
  title: string;
  subtitle?: string;
  /** Large dimmed emblem above the title (visual spec §B3 placeholders). */
  glyph?: string;
  comingSoon?: boolean;
  children?: React.ReactNode;
};

/** Simple placeholder screen scaffold. Replace with real system UI as it's built. */
export function Screen({ title, subtitle, glyph, comingSoon, children }: ScreenProps) {
  return (
    <View style={styles.container}>
      <SpaceBackground seed={8} />
      {glyph ? <Text style={styles.glyph}>{glyph}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {comingSoon ? (
        <View style={styles.pill}>
          <Text style={styles.pillText}>COMING SOON</Text>
        </View>
      ) : null}
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
  },
  glyph: { fontSize: 64, opacity: 0.5 },
  title: { color: COLORS.text, fontSize: FONT.xl, fontWeight: '700' },
  subtitle: { color: COLORS.muted, fontSize: FONT.md, marginTop: SPACING.sm },
  pill: {
    alignSelf: 'flex-start', marginTop: SPACING.md,
    borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs,
  },
  pillText: { color: COLORS.muted, fontSize: FONT.sm, letterSpacing: 2, fontWeight: '700' },
  body: { flex: 1, marginTop: SPACING.lg },
});
```

Then pass the new props from the routes — `app/(tabs)/tech.tsx`:

```tsx
      <Screen
        title="Tech Tree"
        subtitle="Spend research to unlock new ships and weapons."
        glyph="🛰"
        comingSoon
      />
```

and `app/settings.tsx`:

```tsx
      <Screen
        title="Settings"
        subtitle="Audio, haptics, cloud save, and account."
        glyph="⚙️"
        comingSoon
      />
```

- [ ] **Step 7: Typecheck + lint + full suite**

Run: `npx tsc --noEmit; npm run lint; npm test`
Expected: clean / baseline pass count.

- [ ] **Step 8: Commit**

```bash
git add src/ui/fleet/ src/ui/exploration/ src/ui/Screen.tsx "app/(tabs)/tech.tsx" app/settings.tsx
git commit -m "style: app-wide visual pass — space backgrounds, card gradients, token cleanup"
```

---

### Task 24: Docs + full verification (device pass)

**Files:**
- Modify: `CLAUDE.md` (system table + Session Sync)
- Modify: `docs/overview.md`

**Interfaces:** none — documentation and end-to-end verification only.

- [ ] **Step 1: Update the CLAUDE.md system table.** Replace the Combat Engine row and add two rows:

```markdown
| Combat Engine | 🟢 Complete (logic + replay UI) | `src/game/ships/CombatEngine.ts`, `src/ui/battle/` |
| Battle Arena (Skirmish / PvP / Defense) | 🟢 Complete | `src/game/battle/`, `src/ui/battle/`, `supabase/functions/battle-*/` |
| Player Level / Ship Leveling / Salvage | 🟢 Complete | `src/game/battle/xp.ts`, `leveling.ts`, `player_progress` table |
```

- [ ] **Step 2: Rewrite the CLAUDE.md Session Sync block** to reflect: Battle Arena + progression + defense contest + wormhole + spin overhaul + visual pass shipped; next candidates = Resource System / Tech Tree (both still 🔴). **Keep these standing reminders verbatim:**
  - Revert the TEMP 10s free-spin interval in `src/constants/game.ts` AND `supabase/functions/spin/index.ts` to 4 hours, then redeploy the spin function, before any real release.
  - `marketStyles.test.ts` has a known DST flake — re-run in isolation before assuming regression.

- [ ] **Step 3: Update `docs/overview.md`** (read it first; it is the ground-truth file map). Add/amend, matching its existing format:
  - **File tree:** `src/game/battle/` (`xp.ts`, `leveling.ts`, `ladder.ts`, `rewards.ts`, `index.ts`), `src/game/exploration/defender.ts`, `src/stores/useBattleStore.ts`, `src/ui/battle/` (all files incl. `timeline.ts`), `src/ui/common/SpaceBackground.tsx`, `src/ui/fleet/ShipLevelPanel.tsx`, `src/ui/exploration/ContestPrompt.tsx`, `supabase/functions/_shared/battle.ts`, `battle-skirmish/`, `battle-pvp/`, `battle-defense/`, `use-item/`, the new migration file.
  - **Routes:** tab order + `battle` initial tab, `/settings` modal, `/battle-replay` fullScreenModal.
  - **Data flow:** "Battle" flow (challenge → Edge Fn resolves with SeededRNG → returns `BattleEvent[]` log + rewards → client builds `Beat[]` timeline → replay animates → store progress updated) and the amended "Collect" flow (arrived → collect → `fragmentDrop` ⇒ ContestPrompt → `battle-defense` ⇒ fragment credited server-side on win — phantom-fragment bug closed).
  - **Backend:** tables `player_progress`, `skirmish_clears`, `pvp_ladder`, `claimed_missions`; RPCs `join_pvp_ladder`, `upgrade_ship`, `increment_fragment`, `grant_battle_rewards` (use the exact names from the Task 8 migration when writing this); `use-item` function; spin loot table now 40/40/20 with wormhole.

- [ ] **Step 4: Full local verification**

Run: `npm run lint; npx tsc --noEmit; npm test`
Expected: lint clean, tsc clean, Jest = old baseline (85 passing / 1 known DST flake) **plus** every new suite from Tasks 1–22 green.

- [ ] **Step 5: Device pass on the Pixel_9 AVD** (adb + `uiautomator dump` for tap coordinates — screen pixels ≠ touch coordinates on this emulator; grep the dump for `bounds=`):

1. Cold start → app opens on **Battle** tab; tab order Fleet / Star Map / Battle / Tech / Spin; header shows Level 1, 0/100 XP, Lumens + Salvage pills.
2. **Skirmish e2e ×2:** fight Recruit twice. First win: full replay (lunge/projectile/shake/damage numbers), VICTORY card with +50 XP / +25 ✦ / +10 ⚙, header pills pulse on return, tier card flips to `✓ CLEARED`. Second win: consolation caption `DAILY BONUS CLAIMED · 15%` and ceil(15%) rewards.
3. **Skip:** start a fight, tap SKIP immediately → result card within ~1s, correct final HP states, rewards identical.
4. **Settings:** gear → modal slides over Battle; dismiss returns intact.
5. **Spin ×4:** landing index/settle visibly differ between spins; at least one near-miss crawl typically appears within ~5 spins (0.18 each); reel stays inside the frame; haptic ticks decelerate with the reel; landing zone pulses the tier color; disabled Free Spin = flat surface + readable countdown.
6. **Wormhole:** ensure the test account has one (spin until a rare→wormhole drops, or insert a `player_inventory` row `item_type='wormhole', quantity=1` via a service-role PATCH as in prior sessions). Dispatch a fleet ≥5 min away → SystemSheet shows `🌀 Use Wormhole (1) — arrive now` → tap → mission flips to arrived instantly, wormhole count drops, MissionTracker shows Collect!.
7. **Defense e2e:** collect missions until one triggers the contest (~8–14% per mission; danger 4–5 systems roll higher). ContestPrompt → ENGAGE → replay vs defenders → on win, DiscoveryCard shows the fragment AND the fragment exists in `player_inventory` (query it — this closes the phantom-fragment bug §8.3). Also verify: forfeit path shows "The defenders keep their prize." with no inventory row.
8. **Overdrive set piece:** equip an ultra-rare engine (or fight Sovereign-tier once unlocked via a test account with level ≥20) and watch the 1600ms opening for dropped frames — the dim + shake + mega projectile is the worst case (visual spec §A2.11). If janky, the contained Skia upgrade noted in Task 17 is the fix path.
9. Star Map still pans/pinches at 60fps with the new modals mounted.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md docs/overview.md
git commit -m "docs: battle arena + progression shipped — system table, session sync, overview"
```

---

## Deferred / follow-ups (explicitly out of scope — do not build)

- **Skia arena upgrade** for replay projectiles/explosions — only if the Task 24 device pass shows the Reanimated-view effects as flat/janky (Task 17 note).
- **PvP RETRY rank drift:** RETRY re-challenges the same `defenderId`; after a won swap or a moved ladder the server's rank-proximity check may reject it — the error surfaces via the store and the player just picks a rival again. Accepted for v1.
- **Defense interrupted mid-replay:** the server already resolved and credited; the client shows no stored-result recovery UI. A re-attempt returns `409 Mission already claimed` in the ContestPrompt. Design spec §11's "show the stored result" recovery is deferred (needs a read endpoint on `claimed_missions`).
- **`expo-blur` behind SystemSheet** (visual spec §B3, marked optional) — skipped.
- **Offline Battle tab (design spec §11):** `useBattleStore` is not persisted, so offline the tab shows empty progress and a failed challenge surfaces as an inline error rather than pre-disabled buttons. Cached-progress rendering is deferred (needs zustand persist + a connectivity check).
- **Android hardware back = skip** inside the replay (visual spec §A2.1): back currently pops the route; rewards are already granted server-side, and defense outcomes are still consumed via `pendingBattle` on Star Map refocus, so nothing is lost. Add a `BackHandler` → `skip()` if it bothers in playtesting.
- Pre-existing deferred list (SystemSheet duplicate `.find()`s, AsyncStorage persist versioning, `TRAVEL_LANE_MAX_DIST` dispatch enforcement, O(n²) lane memo) — unchanged.
- **Before any real release:** revert the TEMP 10s free-spin interval (client + Edge Fn) and redeploy `spin`.
