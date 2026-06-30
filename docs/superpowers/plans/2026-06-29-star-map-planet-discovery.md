# Star Map & Planet Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an async fleet-dispatch exploration system with a Skia-rendered star map nested inside the Fleet tab stack, push notifications on arrival, and a discovery reward reveal modal.

**Architecture:** Pure-TS game logic in `src/game/exploration/` generates a deterministic star map seeded from the player UUID. A Zustand store with AsyncStorage persistence manages missions via UTC timestamps. Four UI components handle display. The star map is a new Fleet stack route — no new tab needed.

**Tech Stack:** TypeScript, React Native + Expo SDK 56, `@shopify/react-native-skia` v2.6.2 (already installed), `react-native-reanimated` (already installed), `expo-notifications` (new — install in Task 5), Zustand + persist middleware, AsyncStorage.

## Global Constraints

- Never use `Math.random()` — all randomness via `SeededRNG` from `src/game/rng.ts`
- All game logic is pure TypeScript in `src/game/` — no JSX
- Path alias `@/` resolves to repo root (configured in babel)
- Tests co-located with source (e.g. `generator.test.ts` beside `generator.ts`)
- Test command: `npx jest <path> --no-coverage`
- Run `npm run lint` after every task and fix errors before committing
- Install expo-notifications with: `npx expo install expo-notifications`
- Follow theme constants from `src/constants/theme.ts` (`COLORS`, `SPACING`, `RADIUS`, `FONT`)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/types/index.ts` | Modify | Add `dangerLevel` to `StarSystem` |
| `src/types/exploration.ts` | Create | `FleetMission`, `DiscoveryResult`, `MissionStatus` |
| `src/constants/game.ts` | Modify | Add `EXPLORATION` constants |
| `src/game/exploration/generator.ts` | Create | Procedural star system generation |
| `src/game/exploration/generator.test.ts` | Create | Generator unit tests |
| `src/game/exploration/mission.ts` | Create | Fuel cost, travel time, mission resolution |
| `src/game/exploration/mission.test.ts` | Create | Mission logic unit tests |
| `src/game/exploration/index.ts` | Modify | Export generator + mission |
| `src/stores/useExplorationStore.ts` | Create | Zustand store with AsyncStorage persist |
| `src/stores/useExplorationStore.test.ts` | Create | Store action tests |
| `src/services/notifications.ts` | Create | expo-notifications wrapper |
| `src/services/index.ts` | Modify | Export notifications service |
| `src/ui/exploration/StarMapScreen.tsx` | Create | Skia canvas + ScrollView star map |
| `src/ui/exploration/SystemSheet.tsx` | Create | Bottom sheet: system detail + dispatch |
| `src/ui/exploration/MissionTracker.tsx` | Create | Horizontal active-mission progress strip |
| `src/ui/exploration/DiscoveryCard.tsx` | Create | Full-screen reward reveal modal |
| `src/ui/exploration/index.ts` | Create | Barrel export |
| `app/(tabs)/fleet/explore.tsx` | Create | Route screen — renders StarMapScreen |
| `src/ui/fleet/FleetScreen.tsx` | Modify | Add Star Map button |

---

### Task 1: Types & Constants

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/types/exploration.ts`
- Modify: `src/constants/game.ts`

**Interfaces:**
- Produces: extended `StarSystem` (with `dangerLevel`), `FleetMission`, `DiscoveryResult`, `MissionStatus`, `EXPLORATION` — consumed by every subsequent task

- [ ] **Step 1: Add `dangerLevel` to `StarSystem` in `src/types/index.ts`**

Find the `StarSystem` interface and add the field:

```ts
export interface StarSystem {
  id: UUID;
  name: string;
  position: Vec2;
  planets: Planet[];
  dangerLevel: 1 | 2 | 3 | 4 | 5;
}
```

- [ ] **Step 2: Create `src/types/exploration.ts`**

```ts
import type { UUID, Planet, Resources } from '@/src/types';
import type { ComponentTier } from '@/src/game/ships/types';

export type MissionStatus = 'in_transit' | 'arrived' | 'collected';

export interface FleetMission {
  id: UUID;
  systemId: UUID;
  departedAt: number;      // ms UTC
  arrivesAt: number;       // ms UTC
  fuelCost: number;
  status: MissionStatus;
  notificationId?: string;
}

export interface DiscoveryResult {
  missionId: UUID;
  systemId: UUID;
  planetsFound: Planet[];
  resourcesGained: Resources;
  fragmentDrop?: ComponentTier;
}
```

- [ ] **Step 3: Add `EXPLORATION` constants to the bottom of `src/constants/game.ts`**

```ts
// --- Exploration ---
export const EXPLORATION = {
  MAP_SIZE:              2000,
  SYSTEM_COUNT:          20,
  MIN_SYSTEM_SPACING:    150,
  TRAVEL_LANE_MAX_DIST:  400,
  FUEL_COST_DIVISOR:     100,
  TRAVEL_TIME_SCALE:     300,      // ms per pt of distance
  TRAVEL_TIME_MIN_MS:    5  * 60_000,
  TRAVEL_TIME_MAX_MS:    20 * 60_000,
  FRAGMENT_BASE_CHANCE:  0.08,
  FRAGMENT_DANGER_BONUS: 0.02,
} as const;
```

- [ ] **Step 4: Run lint**

```
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/types/exploration.ts src/constants/game.ts
git commit -m "feat: add exploration types and constants"
```

---

### Task 2: Star System Generator

**Files:**
- Create: `src/game/exploration/generator.ts`
- Create: `src/game/exploration/generator.test.ts`
- Modify: `src/game/exploration/index.ts`

**Interfaces:**
- Consumes: `SeededRNG` from `@/src/game/rng`; `StarSystem`, `Planet`, `Vec2` from `@/src/types`; `EXPLORATION` from `@/src/constants/game`
- Produces: `generateStarSystems(seed: number, count?: number): StarSystem[]`

- [ ] **Step 1: Write failing tests — `src/game/exploration/generator.test.ts`**

```ts
import { generateStarSystems } from './generator';
import { EXPLORATION } from '@/src/constants/game';

describe('generateStarSystems', () => {
  it('returns the requested system count', () => {
    expect(generateStarSystems(42, 10)).toHaveLength(10);
  });

  it('places Sol at the map center', () => {
    const home = generateStarSystems(42).find(s => s.id === 'sol-home');
    expect(home).toBeDefined();
    expect(home!.position).toEqual({
      x: EXPLORATION.MAP_SIZE / 2,
      y: EXPLORATION.MAP_SIZE / 2,
    });
  });

  it('is deterministic — same seed, same map', () => {
    const a = generateStarSystems(99);
    const b = generateStarSystems(99);
    expect(a.map(s => s.position)).toEqual(b.map(s => s.position));
  });

  it('different seeds produce different positions', () => {
    const a = generateStarSystems(1).filter(s => s.id !== 'sol-home').map(s => s.position.x);
    const b = generateStarSystems(2).filter(s => s.id !== 'sol-home').map(s => s.position.x);
    expect(a).not.toEqual(b);
  });

  it('every system has 1–4 planets', () => {
    generateStarSystems(42).forEach(s => {
      expect(s.planets.length).toBeGreaterThanOrEqual(1);
      expect(s.planets.length).toBeLessThanOrEqual(4);
    });
  });

  it('every system has dangerLevel 1–5', () => {
    generateStarSystems(42).forEach(s => {
      expect(s.dangerLevel).toBeGreaterThanOrEqual(1);
      expect(s.dangerLevel).toBeLessThanOrEqual(5);
    });
  });

  it('all planets start undiscovered', () => {
    generateStarSystems(42).forEach(s =>
      s.planets.forEach(p => expect(p.discovered).toBe(false))
    );
  });
});
```

- [ ] **Step 2: Run — confirm all fail**

```
npx jest src/game/exploration/generator.test.ts --no-coverage
```

Expected: FAIL — "Cannot find module './generator'".

- [ ] **Step 3: Implement `src/game/exploration/generator.ts`**

```ts
import { SeededRNG } from '@/src/game/rng';
import type { StarSystem, Planet, Vec2 } from '@/src/types';
import { EXPLORATION } from '@/src/constants/game';

const SYSTEM_NAMES = [
  'Vega', 'Lyra', 'Cygni', 'Orion', 'Hydra', 'Draco', 'Perseus', 'Aquila',
  'Corvus', 'Lupus', 'Ara', 'Mensa', 'Pyxis', 'Norma', 'Pavo', 'Tucana',
  'Grus', 'Phoenix', 'Sculptor',
];

function placeSystem(existing: Vec2[], rng: SeededRNG): Vec2 {
  const margin = 50;
  const size = EXPLORATION.MAP_SIZE;
  let pos: Vec2 = { x: 0, y: 0 };
  for (let attempt = 0; attempt < 100; attempt++) {
    pos = { x: rng.int(margin, size - margin), y: rng.int(margin, size - margin) };
    if (!existing.some(p => Math.hypot(p.x - pos.x, p.y - pos.y) < EXPLORATION.MIN_SYSTEM_SPACING)) {
      break;
    }
  }
  return pos;
}

function makePlanets(rng: SeededRNG, count: number, systemId: string): Planet[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${systemId}-p${i}`,
    name: `Planet ${String.fromCharCode(65 + i)}`,
    position: { x: 0, y: 0 },
    discovered: false,
    resourceRichness: Math.round(rng.next() * 100) / 100,
  }));
}

export function generateStarSystems(seed: number, count = EXPLORATION.SYSTEM_COUNT): StarSystem[] {
  const rng = new SeededRNG(seed);
  const center = EXPLORATION.MAP_SIZE / 2;

  const home: StarSystem = {
    id: 'sol-home',
    name: 'Sol',
    position: { x: center, y: center },
    dangerLevel: 1,
    planets: makePlanets(rng, 3, 'sol-home'),
  };

  const systems: StarSystem[] = [home];
  const positions: Vec2[] = [home.position];

  for (let i = 0; i < count - 1; i++) {
    const pos = placeSystem(positions, rng);
    positions.push(pos);
    const dist = Math.hypot(pos.x - center, pos.y - center);
    const danger = Math.max(1, Math.min(5, Math.ceil(dist / 300))) as 1 | 2 | 3 | 4 | 5;
    const id = `sys-${i}`;
    systems.push({
      id,
      name: SYSTEM_NAMES[i] ?? `System ${i + 1}`,
      position: pos,
      dangerLevel: danger,
      planets: makePlanets(rng, rng.int(1, 4), id),
    });
  }
  return systems;
}
```

- [ ] **Step 4: Run — confirm all pass**

```
npx jest src/game/exploration/generator.test.ts --no-coverage
```

Expected: 7 tests pass.

- [ ] **Step 5: Update `src/game/exploration/index.ts`**

```ts
import type { StarSystem } from '@/src/types';

/** TODO: procedural star-system generation (seeded). */
export function generateStarSystems(): StarSystem[] {
  return [];
}
```

Replace the entire file with:

```ts
export { generateStarSystems } from './generator';
```

- [ ] **Step 6: Run lint**

```
npm run lint
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/game/exploration/generator.ts src/game/exploration/generator.test.ts src/game/exploration/index.ts
git commit -m "feat: add procedural star system generator"
```

---

### Task 3: Mission Logic

**Files:**
- Create: `src/game/exploration/mission.ts`
- Create: `src/game/exploration/mission.test.ts`
- Modify: `src/game/exploration/index.ts`

**Interfaces:**
- Consumes: `SeededRNG`; `FleetMission`, `DiscoveryResult` from `@/src/types/exploration`; `StarSystem`, `Vec2` from `@/src/types`; `ComponentTier` from `@/src/game/ships/types`; `EXPLORATION` from `@/src/constants/game`
- Produces:
  - `hashUUID(id: string): number`
  - `calculateFuelCost(from: Vec2, to: Vec2): number`
  - `calculateTravelTime(from: Vec2, to: Vec2): number` — returns ms
  - `resolveMission(mission: FleetMission, systems: StarSystem[], rng: SeededRNG): DiscoveryResult`

- [ ] **Step 1: Write failing tests — `src/game/exploration/mission.test.ts`**

```ts
import { calculateFuelCost, calculateTravelTime, resolveMission, hashUUID } from './mission';
import { SeededRNG } from '@/src/game/rng';
import type { FleetMission } from '@/src/types/exploration';
import type { StarSystem } from '@/src/types';
import { EXPLORATION } from '@/src/constants/game';

const home: StarSystem = {
  id: 'sol-home', name: 'Sol', position: { x: 1000, y: 1000 },
  dangerLevel: 1, planets: [],
};
const target: StarSystem = {
  id: 'sys-0', name: 'Vega', position: { x: 1300, y: 1000 },
  dangerLevel: 2,
  planets: [
    { id: 'p0', name: 'A', position: { x: 0, y: 0 }, discovered: false, resourceRichness: 0.5 },
    { id: 'p1', name: 'B', position: { x: 0, y: 0 }, discovered: false, resourceRichness: 0.8 },
  ],
};
const mission: FleetMission = {
  id: 'mission-sys-0-1234', systemId: 'sys-0',
  departedAt: 0, arrivesAt: 600_000, fuelCost: 3, status: 'arrived',
};

describe('calculateFuelCost', () => {
  it('returns at least 1', () => {
    expect(calculateFuelCost({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeGreaterThanOrEqual(1);
  });
  it('distance 300 → 3 fuel', () => {
    expect(calculateFuelCost({ x: 0, y: 0 }, { x: 300, y: 0 })).toBe(3);
  });
  it('increases with distance', () => {
    const near = calculateFuelCost({ x: 0, y: 0 }, { x: 100, y: 0 });
    const far  = calculateFuelCost({ x: 0, y: 0 }, { x: 500, y: 0 });
    expect(far).toBeGreaterThan(near);
  });
});

describe('calculateTravelTime', () => {
  it('clamps to 5-minute minimum', () => {
    expect(calculateTravelTime({ x: 0, y: 0 }, { x: 1, y: 0 }))
      .toBe(EXPLORATION.TRAVEL_TIME_MIN_MS);
  });
  it('clamps to 20-minute maximum', () => {
    expect(calculateTravelTime({ x: 0, y: 0 }, { x: 99999, y: 0 }))
      .toBe(EXPLORATION.TRAVEL_TIME_MAX_MS);
  });
  it('grows with distance within the clamped range', () => {
    const near = calculateTravelTime({ x: 0, y: 0 }, { x: 200, y: 0 });
    const mid  = calculateTravelTime({ x: 0, y: 0 }, { x: 1000, y: 0 });
    expect(mid).toBeGreaterThan(near);
  });
});

describe('resolveMission', () => {
  it('marks all planets discovered', () => {
    const result = resolveMission(mission, [home, target], new SeededRNG(1));
    expect(result.planetsFound).toHaveLength(2);
    result.planetsFound.forEach(p => expect(p.discovered).toBe(true));
  });
  it('awards credits and fuel', () => {
    const result = resolveMission(mission, [home, target], new SeededRNG(1));
    expect(result.resourcesGained.credits).toBeGreaterThan(0);
    expect(result.resourcesGained.fuel).toBeGreaterThan(0);
  });
  it('is deterministic for the same RNG state', () => {
    const r1 = resolveMission(mission, [home, target], new SeededRNG(42));
    const r2 = resolveMission(mission, [home, target], new SeededRNG(42));
    expect(r1.resourcesGained).toEqual(r2.resourcesGained);
    expect(r1.fragmentDrop).toEqual(r2.fragmentDrop);
  });
});

describe('hashUUID', () => {
  it('returns a number', () => {
    expect(typeof hashUUID('abc-123')).toBe('number');
  });
  it('returns different values for different inputs', () => {
    expect(hashUUID('abc')).not.toBe(hashUUID('xyz'));
  });
});
```

- [ ] **Step 2: Run — confirm all fail**

```
npx jest src/game/exploration/mission.test.ts --no-coverage
```

Expected: FAIL — "Cannot find module './mission'".

- [ ] **Step 3: Implement `src/game/exploration/mission.ts`**

```ts
import type { Vec2, StarSystem } from '@/src/types';
import type { FleetMission, DiscoveryResult } from '@/src/types/exploration';
import type { ComponentTier } from '@/src/game/ships/types';
import { SeededRNG } from '@/src/game/rng';
import { EXPLORATION } from '@/src/constants/game';

export function hashUUID(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function calculateFuelCost(from: Vec2, to: Vec2): number {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  return Math.max(1, Math.ceil(dist / EXPLORATION.FUEL_COST_DIVISOR));
}

export function calculateTravelTime(from: Vec2, to: Vec2): number {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const raw = Math.round(dist * EXPLORATION.TRAVEL_TIME_SCALE);
  return Math.max(EXPLORATION.TRAVEL_TIME_MIN_MS, Math.min(EXPLORATION.TRAVEL_TIME_MAX_MS, raw));
}

const TIERS_BY_DANGER: Record<number, ComponentTier[]> = {
  1: ['common', 'common', 'uncommon'],
  2: ['common', 'uncommon', 'uncommon'],
  3: ['uncommon', 'uncommon', 'rare'],
  4: ['uncommon', 'rare', 'rare'],
  5: ['rare', 'rare', 'legendary'],
};

export function resolveMission(
  mission: FleetMission,
  systems: StarSystem[],
  rng: SeededRNG,
): DiscoveryResult {
  const system = systems.find(s => s.id === mission.systemId)!;
  const avgRichness =
    system.planets.reduce((sum, p) => sum + p.resourceRichness, 0) /
    Math.max(1, system.planets.length);

  const credits = Math.round(50 + avgRichness * 450 * (0.5 + rng.next() * 0.5));
  const fuelRefund = Math.round(mission.fuelCost * (0.2 + rng.next() * 0.4));
  const research = Math.round(rng.next() * 50);

  const dropChance =
    EXPLORATION.FRAGMENT_BASE_CHANCE +
    Math.max(0, system.dangerLevel - 2) * EXPLORATION.FRAGMENT_DANGER_BONUS;

  let fragmentDrop: ComponentTier | undefined;
  if (rng.next() < dropChance) {
    const tiers = TIERS_BY_DANGER[system.dangerLevel] ?? (['common'] as ComponentTier[]);
    fragmentDrop = tiers[rng.int(0, tiers.length - 1)];
  }

  return {
    missionId: mission.id,
    systemId: mission.systemId,
    planetsFound: system.planets.map(p => ({ ...p, discovered: true })),
    resourcesGained: { credits, fuel: fuelRefund, research },
    fragmentDrop,
  };
}
```

- [ ] **Step 4: Run — confirm all pass**

```
npx jest src/game/exploration/mission.test.ts --no-coverage
```

Expected: all tests pass.

- [ ] **Step 5: Update `src/game/exploration/index.ts`**

```ts
export { generateStarSystems } from './generator';
export { calculateFuelCost, calculateTravelTime, resolveMission, hashUUID } from './mission';
```

- [ ] **Step 6: Run lint**

```
npm run lint
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/game/exploration/mission.ts src/game/exploration/mission.test.ts src/game/exploration/index.ts
git commit -m "feat: add mission logic (fuel cost, travel time, resolution)"
```

---

### Task 4: Exploration Store

**Files:**
- Create: `src/stores/useExplorationStore.ts`
- Create: `src/stores/useExplorationStore.test.ts`

**Interfaces:**
- Consumes: `generateStarSystems`, `calculateFuelCost`, `calculateTravelTime`, `resolveMission`, `hashUUID` from `@/src/game/exploration`; `FleetMission`, `DiscoveryResult`, `MissionStatus` from `@/src/types/exploration`; `StarSystem`, `UUID` from `@/src/types`; `SeededRNG` from `@/src/game/rng`; `STARTING_RESOURCES` from `@/src/constants/game`; `scheduleArrivalNotification` from `@/src/services/notifications`
- Produces: `useExplorationStore` hook with state `{ starSystems, activeMissions, discoveries, mapInitialized, fuel }` and actions `{ initMap, dispatchFleet, checkArrivals, collectMission }`

- [ ] **Step 1: Write failing tests — `src/stores/useExplorationStore.test.ts`**

```ts
import { act } from '@testing-library/react-native';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/src/services/notifications', () => ({
  scheduleArrivalNotification: jest.fn(() => Promise.resolve('notif-1')),
}));

import { useExplorationStore } from './useExplorationStore';
import type { StarSystem } from '@/src/types';

const PLAYER_UUID = 'a1b2c3d4-0000-0000-0000-000000000000';

const solHome: StarSystem = {
  id: 'sol-home', name: 'Sol', position: { x: 1000, y: 1000 },
  dangerLevel: 1, planets: [],
};
const vegaSys: StarSystem = {
  id: 'sys-0', name: 'Vega', position: { x: 1300, y: 1000 },
  dangerLevel: 2,
  planets: [{ id: 'p0', name: 'A', position: { x: 0, y: 0 }, discovered: false, resourceRichness: 0.5 }],
};

beforeEach(() => {
  useExplorationStore.setState({
    starSystems: [], activeMissions: [], discoveries: [],
    mapInitialized: false, fuel: 100,
  });
});

describe('initMap', () => {
  it('generates systems and marks initialized', () => {
    act(() => { useExplorationStore.getState().initMap(PLAYER_UUID); });
    const { starSystems, mapInitialized } = useExplorationStore.getState();
    expect(mapInitialized).toBe(true);
    expect(starSystems.length).toBeGreaterThan(0);
  });

  it('skips re-generation if already initialized', () => {
    act(() => { useExplorationStore.getState().initMap(PLAYER_UUID); });
    const first = useExplorationStore.getState().starSystems;
    act(() => { useExplorationStore.getState().initMap('different-uuid'); });
    expect(useExplorationStore.getState().starSystems).toBe(first);
  });
});

describe('dispatchFleet', () => {
  beforeEach(() => {
    useExplorationStore.setState({ starSystems: [solHome, vegaSys], mapInitialized: true, fuel: 100 });
  });

  it('creates an in_transit mission and deducts fuel', () => {
    act(() => { useExplorationStore.getState().dispatchFleet('sys-0'); });
    const { activeMissions, fuel } = useExplorationStore.getState();
    expect(activeMissions).toHaveLength(1);
    expect(activeMissions[0]!.status).toBe('in_transit');
    expect(fuel).toBeLessThan(100);
  });

  it('blocks dispatch when fuel is 0', () => {
    useExplorationStore.setState({ fuel: 0 });
    act(() => { useExplorationStore.getState().dispatchFleet('sys-0'); });
    expect(useExplorationStore.getState().activeMissions).toHaveLength(0);
  });

  it('blocks a second dispatch to the same in-transit system', () => {
    act(() => { useExplorationStore.getState().dispatchFleet('sys-0'); });
    act(() => { useExplorationStore.getState().dispatchFleet('sys-0'); });
    expect(useExplorationStore.getState().activeMissions).toHaveLength(1);
  });
});

describe('checkArrivals', () => {
  it('flips in_transit → arrived when arrivesAt has passed', () => {
    const past = Date.now() - 1000;
    useExplorationStore.setState({
      activeMissions: [{
        id: 'm1', systemId: 'sys-0', departedAt: past - 5000,
        arrivesAt: past, fuelCost: 3, status: 'in_transit',
      }],
    });
    act(() => { useExplorationStore.getState().checkArrivals(); });
    expect(useExplorationStore.getState().activeMissions[0]!.status).toBe('arrived');
  });

  it('leaves future missions as in_transit', () => {
    useExplorationStore.setState({
      activeMissions: [{
        id: 'm2', systemId: 'sys-1', departedAt: Date.now(),
        arrivesAt: Date.now() + 999_999, fuelCost: 3, status: 'in_transit',
      }],
    });
    act(() => { useExplorationStore.getState().checkArrivals(); });
    expect(useExplorationStore.getState().activeMissions[0]!.status).toBe('in_transit');
  });
});

describe('collectMission', () => {
  it('credits fuel, marks collected, and saves discovery', () => {
    useExplorationStore.setState({
      starSystems: [solHome, vegaSys],
      activeMissions: [{
        id: 'm3', systemId: 'sys-0', departedAt: 0, arrivesAt: 0, fuelCost: 3, status: 'arrived',
      }],
      fuel: 10,
    });
    act(() => { useExplorationStore.getState().collectMission('m3'); });
    const { activeMissions, discoveries, fuel } = useExplorationStore.getState();
    expect(activeMissions[0]!.status).toBe('collected');
    expect(discoveries).toHaveLength(1);
    expect(fuel).toBeGreaterThan(10);
  });

  it('does nothing if mission is not in arrived state', () => {
    useExplorationStore.setState({
      starSystems: [solHome, vegaSys],
      activeMissions: [{
        id: 'm4', systemId: 'sys-0', departedAt: 0, arrivesAt: 999_999, fuelCost: 3, status: 'in_transit',
      }],
    });
    act(() => { useExplorationStore.getState().collectMission('m4'); });
    expect(useExplorationStore.getState().discoveries).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run — confirm all fail**

```
npx jest src/stores/useExplorationStore.test.ts --no-coverage
```

Expected: FAIL — "Cannot find module './useExplorationStore'".

- [ ] **Step 3: Create `src/stores/useExplorationStore.ts`**

```ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateStarSystems, calculateFuelCost, calculateTravelTime, resolveMission, hashUUID } from '@/src/game/exploration';
import { SeededRNG } from '@/src/game/rng';
import type { StarSystem, UUID } from '@/src/types';
import type { FleetMission, DiscoveryResult, MissionStatus } from '@/src/types/exploration';
import { STARTING_RESOURCES } from '@/src/constants/game';
import { scheduleArrivalNotification } from '@/src/services/notifications';

function uuidToSeed(uuid: string): number {
  const hex = uuid.replace(/-/g, '').slice(0, 8);
  return parseInt(hex, 16) || 1;
}

interface ExplorationState {
  starSystems: StarSystem[];
  activeMissions: FleetMission[];
  discoveries: DiscoveryResult[];
  mapInitialized: boolean;
  fuel: number;
  initMap(playerUUID: string): void;
  dispatchFleet(systemId: UUID): void;
  checkArrivals(): void;
  collectMission(missionId: UUID): void;
}

export const useExplorationStore = create<ExplorationState>()(
  persist(
    (set, get) => ({
      starSystems: [],
      activeMissions: [],
      discoveries: [],
      mapInitialized: false,
      fuel: STARTING_RESOURCES.fuel,

      initMap(playerUUID) {
        if (get().mapInitialized) return;
        set({ starSystems: generateStarSystems(uuidToSeed(playerUUID)), mapInitialized: true });
      },

      dispatchFleet(systemId) {
        const { starSystems, activeMissions, fuel } = get();
        const target = starSystems.find(s => s.id === systemId);
        const home = starSystems.find(s => s.id === 'sol-home');
        if (!target || !home) return;

        const fuelCost = calculateFuelCost(home.position, target.position);
        if (fuel < fuelCost) return;
        if (activeMissions.some(m => m.systemId === systemId && m.status === 'in_transit')) return;

        const now = Date.now();
        const mission: FleetMission = {
          id: `mission-${systemId}-${now}`,
          systemId,
          departedAt: now,
          arrivesAt: now + calculateTravelTime(home.position, target.position),
          fuelCost,
          status: 'in_transit',
        };

        set(s => ({ fuel: s.fuel - fuelCost, activeMissions: [...s.activeMissions, mission] }));

        scheduleArrivalNotification(mission, target.name).then(notificationId => {
          if (!notificationId) return;
          set(s => ({
            activeMissions: s.activeMissions.map(m =>
              m.id === mission.id ? { ...m, notificationId } : m
            ),
          }));
        });
      },

      checkArrivals() {
        const now = Date.now();
        set(s => ({
          activeMissions: s.activeMissions.map(m =>
            m.status === 'in_transit' && now >= m.arrivesAt
              ? { ...m, status: 'arrived' as MissionStatus }
              : m
          ),
        }));
      },

      collectMission(missionId) {
        const { activeMissions, starSystems } = get();
        const mission = activeMissions.find(m => m.id === missionId);
        if (!mission || mission.status !== 'arrived') return;

        const result = resolveMission(mission, starSystems, new SeededRNG(hashUUID(missionId)));

        set(s => ({
          fuel: s.fuel + result.resourcesGained.fuel,
          starSystems: s.starSystems.map(sys =>
            sys.id === mission.systemId ? { ...sys, planets: result.planetsFound } : sys
          ),
          activeMissions: s.activeMissions.map(m =>
            m.id === missionId ? { ...m, status: 'collected' as MissionStatus } : m
          ),
          discoveries: [...s.discoveries, result],
        }));
      },
    }),
    { name: 'exploration-store', storage: createJSONStorage(() => AsyncStorage) }
  )
);
```

- [ ] **Step 4: Run — confirm all pass**

```
npx jest src/stores/useExplorationStore.test.ts --no-coverage
```

Expected: all tests pass.

- [ ] **Step 5: Run lint**

```
npm run lint
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/stores/useExplorationStore.ts src/stores/useExplorationStore.test.ts
git commit -m "feat: add exploration Zustand store with AsyncStorage persist"
```

---

### Task 5: Notifications Service

**Files:**
- `package.json` (modified by install command)
- Create: `src/services/notifications.ts`
- Modify: `src/services/index.ts`

**Interfaces:**
- Produces:
  - `requestNotificationPermission(): Promise<boolean>`
  - `scheduleArrivalNotification(mission: FleetMission, systemName: string): Promise<string>`
  - `cancelNotification(notificationId: string): Promise<void>`

- [ ] **Step 1: Install expo-notifications**

```
npx expo install expo-notifications
```

Verify it was added:
```
grep expo-notifications package.json
```

Expected: a line like `"expo-notifications": "~0.29.x"` in dependencies.

- [ ] **Step 2: Create `src/services/notifications.ts`**

```ts
import * as Notifications from 'expo-notifications';
import type { FleetMission } from '@/src/types/exploration';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleArrivalNotification(
  mission: FleetMission,
  systemName: string,
): Promise<string> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    const granted = status === 'granted' || (await requestNotificationPermission());
    if (!granted) return '';

    const secondsFromNow = Math.max(1, Math.round((mission.arrivesAt - Date.now()) / 1000));
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Fleet Returned',
        body: `Your fleet has returned from ${systemName} — tap to collect.`,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: secondsFromNow,
        repeats: false,
      },
    });
  } catch {
    return '';
  }
}

export async function cancelNotification(notificationId: string): Promise<void> {
  if (!notificationId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {
    // notification may have already fired
  }
}
```

- [ ] **Step 3: Add export to `src/services/index.ts`**

Append to the existing file:
```ts
export * from './notifications';
```

- [ ] **Step 4: Run lint**

```
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/services/notifications.ts src/services/index.ts package.json package-lock.json
git commit -m "feat: add fleet arrival push notifications via expo-notifications"
```

---

### Task 6: StarMapScreen

**Files:**
- Create: `src/ui/exploration/StarMapScreen.tsx`
- Create: `src/ui/exploration/index.ts`

**Interfaces:**
- Consumes: `useExplorationStore`; `StarSystem` from `@/src/types`; `EXPLORATION` from `@/src/constants/game`; `COLORS`, `SPACING`, `FONT` from `@/src/constants/theme`; `Canvas`, `Circle`, `Line`, `Path`, `Skia`, `vec` from `@shopify/react-native-skia`
- Produces: `<StarMapScreen />` — rendered by `app/(tabs)/fleet/explore.tsx` in Task 10.
  SystemSheet and MissionTracker are placeholder stubs here; replaced in Tasks 7 and 8.

- [ ] **Step 1: Create `src/ui/exploration/index.ts`**

```ts
export { StarMapScreen } from './StarMapScreen';
```

- [ ] **Step 2: Create `src/ui/exploration/StarMapScreen.tsx`**

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Canvas, Circle, Line, Path, Skia, vec } from '@shopify/react-native-skia';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useExplorationStore } from '@/src/stores/useExplorationStore';
import { EXPLORATION } from '@/src/constants/game';
import { COLORS, FONT, SPACING } from '@/src/constants/theme';
import type { StarSystem } from '@/src/types';
import type { FleetMission, DiscoveryResult } from '@/src/types/exploration';

const MAP = EXPLORATION.MAP_SIZE;
const LANE_MAX = EXPLORATION.TRAVEL_LANE_MAX_DIST;
const NODE_R = 12;

function nodeColor(
  systemId: string,
  missions: FleetMission[],
  discoveries: DiscoveryResult[],
): string {
  const m = missions.find(m => m.systemId === systemId);
  if (m?.status === 'in_transit') return '#F59E0B';
  if (m?.status === 'arrived')    return '#10B981';
  if (discoveries.some(d => d.systemId === systemId)) return '#3B82F6';
  return '#6B7280';
}

export function StarMapScreen() {
  const { starSystems, activeMissions, discoveries, checkArrivals } = useExplorationStore();
  const [selected, setSelected] = useState<StarSystem | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    checkArrivals();
    // Center the scroll view on Sol (1000, 1000) after first layout
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ x: 700, y: 700, animated: false });
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Build travel lanes between nearby systems
  const lanes: Array<[StarSystem, StarSystem]> = [];
  for (let i = 0; i < starSystems.length; i++) {
    for (let j = i + 1; j < starSystems.length; j++) {
      const a = starSystems[i]!, b = starSystems[j]!;
      if (Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y) <= LANE_MAX) {
        lanes.push([a, b]);
      }
    }
  }

  // Home system ring path
  const home = starSystems.find(s => s.id === 'sol-home');
  const ringPath = home
    ? (() => {
        const p = Skia.Path.Make();
        p.addCircle(home.position.x, home.position.y, NODE_R + 5);
        return p;
      })()
    : null;

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Star Map</Text>
        <Text style={styles.fuelLabel}>⛽ {useExplorationStore.getState().fuel} fuel</Text>
      </View>

      {/* Map */}
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.mapContainer}
        minimumZoomScale={0.3}
        maximumZoomScale={2}
        pinchGestureEnabled
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        {/* Skia canvas: lanes + nodes */}
        <Canvas style={StyleSheet.absoluteFill}>
          {lanes.map(([a, b], i) => (
            <Line
              key={`lane-${i}`}
              p1={vec(a.position.x, a.position.y)}
              p2={vec(b.position.x, b.position.y)}
              color="#374151"
              strokeWidth={1}
            />
          ))}
          {starSystems.map(sys => (
            <Circle
              key={sys.id}
              cx={sys.position.x}
              cy={sys.position.y}
              r={NODE_R}
              color={nodeColor(sys.id, activeMissions, discoveries)}
            />
          ))}
          {ringPath && (
            <Path path={ringPath} color="white" style="stroke" strokeWidth={2} />
          )}
        </Canvas>

        {/* Invisible tap targets over each node */}
        {starSystems.map(sys => (
          <Pressable
            key={`tap-${sys.id}`}
            style={[
              styles.nodeTap,
              { left: sys.position.x - NODE_R * 2, top: sys.position.y - NODE_R * 2 },
            ]}
            onPress={() => setSelected(sys)}
          />
        ))}
      </ScrollView>

      {/* Placeholder replaced by MissionTracker in Task 8 */}

      {/* Placeholder replaced by SystemSheet in Task 7 */}
      {selected && (
        <View style={styles.sheetPlaceholder}>
          <Text style={styles.sheetText}>{selected.name} (danger {selected.dangerLevel}★)</Text>
          <Pressable onPress={() => setSelected(null)} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>Close</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#000' },
  header:          { flexDirection: 'row', justifyContent: 'space-between',
                     alignItems: 'center', padding: SPACING.md,
                     backgroundColor: COLORS.surface },
  headerTitle:     { color: COLORS.text, fontSize: FONT.md, fontWeight: '700' },
  fuelLabel:       { color: COLORS.accent, fontSize: FONT.sm },
  scroll:          { flex: 1 },
  mapContainer:    { width: MAP, height: MAP },
  nodeTap:         { position: 'absolute', width: NODE_R * 4, height: NODE_R * 4 },
  sheetPlaceholder:{ position: 'absolute', bottom: 0, left: 0, right: 0,
                     backgroundColor: COLORS.surface, padding: SPACING.lg, gap: SPACING.sm },
  sheetText:       { color: COLORS.text, fontSize: FONT.sm },
  closeBtn:        { alignSelf: 'flex-start' },
  closeBtnText:    { color: COLORS.primary, fontSize: FONT.sm },
});
```

- [ ] **Step 3: Run lint**

```
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/ui/exploration/StarMapScreen.tsx src/ui/exploration/index.ts
git commit -m "feat: add StarMapScreen with Skia canvas and pan/zoom"
```

---

### Task 7: SystemSheet

**Files:**
- Create: `src/ui/exploration/SystemSheet.tsx`
- Modify: `src/ui/exploration/index.ts`
- Modify: `src/ui/exploration/StarMapScreen.tsx`

**Interfaces:**
- Consumes: `useExplorationStore`; `StarSystem` from `@/src/types`; `COLORS`, `SPACING`, `FONT`, `RADIUS` from `@/src/constants/theme`; `expo-haptics`
- Props: `{ system: StarSystem; onClose(): void }`
- Produces: `<SystemSheet />` — bottom sheet with system info and Send Fleet button

- [ ] **Step 1: Create `src/ui/exploration/SystemSheet.tsx`**

```tsx
import React, { useEffect } from 'react';
import {
  Modal, Pressable, ScrollView, StyleSheet, Text,
  TouchableWithoutFeedback, View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useExplorationStore } from '@/src/stores/useExplorationStore';
import { calculateFuelCost, calculateTravelTime } from '@/src/game/exploration';
import { COLORS, FONT, RADIUS, SPACING } from '@/src/constants/theme';
import type { StarSystem } from '@/src/types';
import type { FleetMission } from '@/src/types/exploration';

interface Props {
  system: StarSystem;
  onClose(): void;
}

function formatDuration(ms: number): string {
  const mins = Math.round(ms / 60_000);
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function formatEta(arrivesAt: number): string {
  const remaining = Math.max(0, arrivesAt - Date.now());
  return `Returns in ${formatDuration(remaining)}`;
}

export function SystemSheet({ system, onClose }: Props) {
  const { starSystems, activeMissions, fuel, dispatchFleet } = useExplorationStore();
  const home = starSystems.find(s => s.id === 'sol-home');

  const fuelCost = home ? calculateFuelCost(home.position, system.position) : 0;
  const travelMs = home ? calculateTravelTime(home.position, system.position) : 0;

  const activeMission: FleetMission | undefined = activeMissions.find(
    m => m.systemId === system.id && (m.status === 'in_transit' || m.status === 'arrived')
  );

  const handleDispatch = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    dispatchFleet(system.id);
    onClose();
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
          <Pressable
            style={[styles.dispatchBtn, buttonDisabled && styles.dispatchBtnDisabled]}
            onPress={handleDispatch}
            disabled={buttonDisabled}
          >
            <Text style={styles.dispatchBtnText}>{buttonLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay:         { flex: 1, justifyContent: 'flex-end' },
  backdrop:        { flex: 1, backgroundColor: '#00000080' },
  sheet:           { backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.lg,
                     borderTopRightRadius: RADIUS.lg, padding: SPACING.lg,
                     gap: SPACING.md, maxHeight: '65%' },
  handle:          { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border,
                     alignSelf: 'center', marginBottom: SPACING.sm },
  headerRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  systemName:      { color: COLORS.text, fontSize: FONT.lg, fontWeight: '700' },
  danger:          { color: COLORS.accent, fontSize: FONT.sm },
  infoRow:         { flexDirection: 'row', justifyContent: 'space-between' },
  infoLabel:       { color: COLORS.muted, fontSize: FONT.sm },
  infoValue:       { color: COLORS.text, fontSize: FONT.sm },
  sectionLabel:    { color: COLORS.muted, fontSize: FONT.sm, fontWeight: '600' },
  planetList:      { maxHeight: 120 },
  planetRow:       { flexDirection: 'row', justifyContent: 'space-between',
                     paddingVertical: SPACING.xs },
  planetName:      { color: COLORS.text, fontSize: FONT.sm },
  richness:        { color: COLORS.primary, fontSize: FONT.sm },
  dispatchBtn:     { backgroundColor: COLORS.primary, borderRadius: RADIUS.md,
                     padding: SPACING.md, alignItems: 'center' },
  dispatchBtnDisabled: { opacity: 0.4 },
  dispatchBtnText: { color: COLORS.background, fontSize: FONT.sm, fontWeight: '700' },
});
```

- [ ] **Step 2: Add export to `src/ui/exploration/index.ts`**

```ts
export { StarMapScreen } from './StarMapScreen';
export { SystemSheet } from './SystemSheet';
```

- [ ] **Step 3: Replace the placeholder sheet in `src/ui/exploration/StarMapScreen.tsx`**

Find the placeholder comment and the `selected &&` block and replace with:

```tsx
      {selected && (
        <SystemSheet system={selected} onClose={() => setSelected(null)} />
      )}
```

Also add the import at the top of the file:
```tsx
import { SystemSheet } from './SystemSheet';
```

And remove the unused `sheetPlaceholder`, `sheetText`, `closeBtn`, `closeBtnText` styles.

- [ ] **Step 4: Run lint**

```
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/ui/exploration/SystemSheet.tsx src/ui/exploration/index.ts src/ui/exploration/StarMapScreen.tsx
git commit -m "feat: add SystemSheet bottom sheet for system detail and fleet dispatch"
```

---

### Task 8: MissionTracker

**Files:**
- Create: `src/ui/exploration/MissionTracker.tsx`
- Modify: `src/ui/exploration/index.ts`
- Modify: `src/ui/exploration/StarMapScreen.tsx`

**Interfaces:**
- Consumes: `useExplorationStore`; `COLORS`, `FONT`, `SPACING`, `RADIUS` from `@/src/constants/theme`; `StarSystem` from `@/src/types`
- Props: `{ onSelectSystem(sys: StarSystem): void }`
- Produces: `<MissionTracker />` — horizontal scroll of in-flight mission chips with live progress bars

- [ ] **Step 1: Create `src/ui/exploration/MissionTracker.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useExplorationStore } from '@/src/stores/useExplorationStore';
import { COLORS, FONT, RADIUS, SPACING } from '@/src/constants/theme';
import type { StarSystem } from '@/src/types';

interface Props {
  onSelectSystem(sys: StarSystem): void;
}

export function MissionTracker({ onSelectSystem }: Props) {
  const { activeMissions, starSystems, checkArrivals } = useExplorationStore();
  const [now, setNow] = useState(Date.now());

  // Refresh every 10 s so progress bars animate
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      checkArrivals();
    }, 10_000);
    return () => clearInterval(id);
  }, []);

  const active = activeMissions.filter(m => m.status === 'in_transit' || m.status === 'arrived');
  if (active.length === 0) return null;

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {active.map(mission => {
          const sys = starSystems.find(s => s.id === mission.systemId);
          if (!sys) return null;

          const progress = mission.status === 'arrived'
            ? 1
            : Math.min(1, (now - mission.departedAt) / (mission.arrivesAt - mission.departedAt));
          const arrived = mission.status === 'arrived';

          return (
            <Pressable key={mission.id} style={styles.chip} onPress={() => onSelectSystem(sys)}>
              <Text style={styles.chipName} numberOfLines={1}>{sys.name}</Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` },
                              arrived && styles.progressArrived]} />
              </View>
              <Text style={styles.chipStatus}>{arrived ? 'Collect!' : `${Math.round(progress * 100)}%`}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { backgroundColor: COLORS.surface, borderTopWidth: 1,
                     borderTopColor: COLORS.border },
  row:             { padding: SPACING.sm, gap: SPACING.sm },
  chip:            { backgroundColor: COLORS.background, borderRadius: RADIUS.sm,
                     padding: SPACING.sm, minWidth: 100, gap: 4 },
  chipName:        { color: COLORS.text, fontSize: 12, fontWeight: '600' },
  progressTrack:   { height: 4, backgroundColor: COLORS.border, borderRadius: 2, overflow: 'hidden' },
  progressFill:    { height: '100%', backgroundColor: COLORS.primary, borderRadius: 2 },
  progressArrived: { backgroundColor: '#10B981' },
  chipStatus:      { color: COLORS.muted, fontSize: 11 },
});
```

- [ ] **Step 2: Add export to `src/ui/exploration/index.ts`**

```ts
export { StarMapScreen } from './StarMapScreen';
export { SystemSheet } from './SystemSheet';
export { MissionTracker } from './MissionTracker';
```

- [ ] **Step 3: Wire MissionTracker into `StarMapScreen.tsx`**

Add import at the top:
```tsx
import { MissionTracker } from './MissionTracker';
```

Find the `{/* Placeholder replaced by MissionTracker in Task 8 */}` comment and replace with:
```tsx
      <MissionTracker onSelectSystem={sys => setSelected(sys)} />
```

- [ ] **Step 4: Run lint**

```
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/ui/exploration/MissionTracker.tsx src/ui/exploration/index.ts src/ui/exploration/StarMapScreen.tsx
git commit -m "feat: add MissionTracker mission progress strip"
```

---

### Task 9: DiscoveryCard

**Files:**
- Create: `src/ui/exploration/DiscoveryCard.tsx`
- Modify: `src/ui/exploration/index.ts`
- Modify: `src/ui/exploration/StarMapScreen.tsx`

**Interfaces:**
- Consumes: `useExplorationStore`; `TIER_STYLES` from `@/src/ui/spin/tierStyles`; `COLORS`, `FONT`, `RADIUS`, `SPACING` from `@/src/constants/theme`
- Produces: `<DiscoveryCard />` — full-screen modal that reveals what a fleet found; calls `collectMission` on confirm

- [ ] **Step 1: Create `src/ui/exploration/DiscoveryCard.tsx`**

```tsx
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useExplorationStore } from '@/src/stores/useExplorationStore';
import { TIER_STYLES } from '@/src/ui/spin/tierStyles';
import { COLORS, FONT, RADIUS, SPACING } from '@/src/constants/theme';
import type { DiscoveryResult } from '@/src/types/exploration';
import type { ComponentTier } from '@/src/game/ships/types';

interface Props {
  result: DiscoveryResult;
  systemName: string;
  onClose(): void;
}

function TierBadge({ tier }: { tier: ComponentTier }) {
  const s = TIER_STYLES[tier];
  return (
    <View style={[styles.tierBadge, { borderColor: s.border }]}>
      <Text style={[styles.tierLabel, { color: s.border }]}>{s.label}</Text>
    </View>
  );
}

export function DiscoveryCard({ result, systemName, onClose }: Props) {
  const { collectMission } = useExplorationStore();

  const handleCollect = () => {
    collectMission(result.missionId);
    onClose();
  };

  const { credits, fuel, research } = result.resourcesGained;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleCollect}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Fleet Returned</Text>
          <Text style={styles.subtitle}>from {systemName}</Text>

          {/* Planets discovered */}
          <Text style={styles.section}>Planets Discovered</Text>
          {result.planetsFound.map(p => (
            <Text key={p.id} style={styles.planetName}>· {p.name}</Text>
          ))}

          {/* Resources */}
          <Text style={styles.section}>Resources Gained</Text>
          <View style={styles.resources}>
            {credits > 0  && <Text style={styles.resource}>💰 {credits.toLocaleString()} credits</Text>}
            {fuel > 0     && <Text style={styles.resource}>⛽ {fuel} fuel</Text>}
            {research > 0 && <Text style={styles.resource}>🔬 {research} research</Text>}
          </View>

          {/* Fragment drop */}
          {result.fragmentDrop && (
            <>
              <Text style={styles.section}>Loot</Text>
              <View style={styles.lootRow}>
                <Text style={styles.resource}>Component Fragment</Text>
                <TierBadge tier={result.fragmentDrop} />
              </View>
            </>
          )}

          <Pressable style={styles.collectBtn} onPress={handleCollect}>
            <Text style={styles.collectBtnText}>Collect</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay:       { flex: 1, backgroundColor: '#000000CC', justifyContent: 'center',
                   alignItems: 'center', padding: SPACING.lg },
  card:          { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
                   padding: SPACING.lg, width: '100%', gap: SPACING.sm },
  title:         { color: COLORS.text, fontSize: FONT.lg, fontWeight: '700', textAlign: 'center' },
  subtitle:      { color: COLORS.muted, fontSize: FONT.sm, textAlign: 'center' },
  section:       { color: COLORS.muted, fontSize: 12, fontWeight: '600',
                   marginTop: SPACING.sm, textTransform: 'uppercase', letterSpacing: 1 },
  planetName:    { color: COLORS.text, fontSize: FONT.sm },
  resources:     { gap: 4 },
  resource:      { color: COLORS.text, fontSize: FONT.sm },
  lootRow:       { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  tierBadge:     { borderWidth: 1, borderRadius: RADIUS.sm,
                   paddingHorizontal: SPACING.xs, paddingVertical: 2 },
  tierLabel:     { fontSize: 11, fontWeight: '700' },
  collectBtn:    { backgroundColor: COLORS.primary, borderRadius: RADIUS.md,
                   padding: SPACING.md, alignItems: 'center', marginTop: SPACING.sm },
  collectBtnText:{ color: COLORS.background, fontSize: FONT.sm, fontWeight: '700' },
});
```

- [ ] **Step 2: Add export to `src/ui/exploration/index.ts`**

```ts
export { StarMapScreen } from './StarMapScreen';
export { SystemSheet } from './SystemSheet';
export { MissionTracker } from './MissionTracker';
export { DiscoveryCard } from './DiscoveryCard';
```

- [ ] **Step 3: Wire DiscoveryCard into `StarMapScreen.tsx`**

Add state and import at the top of StarMapScreen:

```tsx
import { DiscoveryCard } from './DiscoveryCard';
```

Add state for the pending collect:
```tsx
  const [pendingResult, setPendingResult] = useState<
    { result: import('@/src/types/exploration').DiscoveryResult; systemName: string } | null
  >(null);
```

In the `checkArrivals` `useEffect`, also check for arrived missions that need the card:
```tsx
  useEffect(() => {
    checkArrivals();
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ x: 700, y: 700, animated: false });
    }, 100);
    return () => clearTimeout(timer);
  }, []);
```

After the `<MissionTracker />` line, add:
```tsx
      {pendingResult && (
        <DiscoveryCard
          result={pendingResult.result}
          systemName={pendingResult.systemName}
          onClose={() => setPendingResult(null)}
        />
      )}
```

Update the `SystemSheet` `onClose` call in the node tap to also check for arrived missions and open DiscoveryCard. The simplest trigger: add a "Collect" button in SystemSheet that opens the DiscoveryCard by calling a callback.

Update SystemSheet to accept an optional `onCollect` prop:

In `src/ui/exploration/SystemSheet.tsx`, update the Props interface:
```tsx
interface Props {
  system: StarSystem;
  onClose(): void;
  onCollect?(result: import('@/src/types/exploration').DiscoveryResult): void;
}
```

Update the component signature:
```tsx
export function SystemSheet({ system, onClose, onCollect }: Props) {
```

After `dispatchFleet` and `onClose`, add a collect handler for arrived missions:
```tsx
  const { discoveries } = useExplorationStore();
  const arrivedMission = activeMissions.find(
    m => m.systemId === system.id && m.status === 'arrived'
  );
  const arrivedDiscovery = arrivedMission
    ? discoveries.find(d => d.missionId === arrivedMission.id)
    : undefined;
```

Wait — the discovery isn't in `discoveries` until after `collectMission` runs, so the DiscoveryCard needs to build the result from `resolveMission` before collecting. This changes the flow: the collect button in SystemSheet should call `onCollect` with a preview of the result, and DiscoveryCard's "Collect" button calls `collectMission`.

To keep this simple, change the flow: when `activeMission.status === 'arrived'`, the SystemSheet shows a "Collect Fleet" button. Pressing it calls `collectMission` immediately, then reads the newly added discovery from the store to pass to `DiscoveryCard`.

Update SystemSheet to accept `onCollect(result: DiscoveryResult, systemName: string): void`:

```tsx
interface Props {
  system: StarSystem;
  onClose(): void;
  onCollect(result: import('@/src/types/exploration').DiscoveryResult, systemName: string): void;
}
```

Add to SystemSheet body:
```tsx
  const handleCollect = () => {
    collectMission(arrivedMission!.id);
    // read the discovery that was just added
    const updated = useExplorationStore.getState().discoveries;
    const result = updated.find(d => d.missionId === arrivedMission!.id);
    if (result) onCollect(result, system.name);
    onClose();
  };
```

Add `collectMission` to the destructure:
```tsx
  const { starSystems, activeMissions, fuel, dispatchFleet, collectMission } = useExplorationStore();
```

Add arrived mission detection:
```tsx
  const arrivedMission = activeMissions.find(
    m => m.systemId === system.id && m.status === 'arrived'
  );
```

Replace the dispatch button block with:
```tsx
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
```

In StarMapScreen, update the SystemSheet usage:
```tsx
      {selected && (
        <SystemSheet
          system={selected}
          onClose={() => setSelected(null)}
          onCollect={(result, systemName) => {
            setSelected(null);
            setPendingResult({ result, systemName });
          }}
        />
      )}
```

- [ ] **Step 4: Run lint**

```
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/ui/exploration/DiscoveryCard.tsx src/ui/exploration/index.ts \
        src/ui/exploration/StarMapScreen.tsx src/ui/exploration/SystemSheet.tsx
git commit -m "feat: add DiscoveryCard reward reveal and wire collect flow"
```

---

### Task 10: Route + FleetScreen Button

**Files:**
- Create: `app/(tabs)/fleet/explore.tsx`
- Modify: `src/ui/fleet/FleetScreen.tsx`

**Interfaces:**
- Consumes: `StarMapScreen` from `@/src/ui/exploration`; `useExplorationStore` (for `initMap`); `useRouter` from `expo-router`; Supabase auth session for playerUUID
- Produces: working Star Map accessible from Fleet tab

- [ ] **Step 1: Create `app/(tabs)/fleet/explore.tsx`**

```tsx
import { useEffect } from 'react';
import { supabase } from '@/src/services/supabase';
import { useExplorationStore } from '@/src/stores/useExplorationStore';
import { StarMapScreen } from '@/src/ui/exploration';

export default function ExploreRoute() {
  const initMap = useExplorationStore(s => s.initMap);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uuid = data.session?.user.id;
      if (uuid) initMap(uuid);
    });
  }, []);

  return <StarMapScreen />;
}
```

- [ ] **Step 2: Add Star Map button to `src/ui/fleet/FleetScreen.tsx`**

Add after the existing Auction House `Pressable`:

```tsx
        <Pressable style={styles.marketBtn} onPress={() => router.push('/fleet/explore')}>
          <Text style={styles.marketBtnText}>Star Map →</Text>
        </Pressable>
```

No import changes needed — `router` and the style are already in place.

- [ ] **Step 3: Run lint**

```
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Smoke test — start the app and verify the full flow**

```
npm start
```

Walk through:
1. Open Fleet tab → "Star Map →" button is visible
2. Tap Star Map → star map renders with ~20 nodes, Sol has a white ring
3. Tap a node → SystemSheet slides up with system name, danger stars, travel time, fuel cost
4. Tap "Send Fleet" → sheet closes, node turns amber, MissionTracker chip appears at bottom
5. Tap a chip → SystemSheet opens for that system showing ETA
6. (For a quick test: temporarily set `TRAVEL_TIME_MIN_MS = 5_000` in game.ts, dispatch, wait 10 s, reopen the screen) → node turns green, "Collect Fleet →" appears
7. Tap Collect → DiscoveryCard shows planets, resources, optional fragment → tap Collect → card closes, fuel increases

- [ ] **Step 5: Commit**

```bash
git add app/(tabs)/fleet/explore.tsx src/ui/fleet/FleetScreen.tsx
git commit -m "feat: add Star Map route and Fleet tab entry point"
```

---

## Self-Review Notes

**Spec coverage check:**
- ✅ Seeded star map (20 systems, Sol at center) — Task 2
- ✅ Async fleet dispatch (fuel deduct, UTC timestamps) — Tasks 3, 4
- ✅ Multiple simultaneous fleets — store allows N missions (guarded per-system not globally)
- ✅ Push notifications on arrival — Task 5
- ✅ Mission persistence via AsyncStorage timestamps — Task 4 (Zustand persist)
- ✅ checkArrivals on resume — Task 6 (StarMapScreen useEffect)
- ✅ Skia canvas with node colors + travel lanes — Task 6
- ✅ SystemSheet with danger, travel time, fuel cost, planet list — Task 7
- ✅ MissionTracker progress strip — Task 8
- ✅ DiscoveryCard reward reveal — Task 9
- ✅ Nested under Fleet tab (no new tab) — Task 10
- ✅ expo-notifications graceful permission degradation — Task 5
- ✅ dangerLevel on StarSystem — Task 1
- ✅ Fragment drop in DiscoveryCard with tier badge — Task 9

**Known limitation:** ScrollView `pinchGestureEnabled` / `minimumZoomScale` / `maximumZoomScale` are iOS-only. Android users can pan but not pinch-to-zoom. This is acceptable for MVP.
