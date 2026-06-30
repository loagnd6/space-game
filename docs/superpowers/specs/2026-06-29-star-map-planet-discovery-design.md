# Star Map & Planet Discovery — Design Spec
**Date:** 2026-06-29
**Status:** Approved

---

## Overview

An async fleet-dispatch exploration system. Players view a procedurally generated star map, tap a system to see details, and dispatch one or more fleets to explore. Fleets return after a time-based delay carrying resources and occasional loot. Push notifications alert the player on arrival.

---

## Architecture

### Placement
Star Map is a new Stack screen nested inside the existing Fleet navigator — no new tab.
- Button on `FleetScreen` → navigates to `app/(tabs)/fleet/explore.tsx`
- Consistent with how the Auction House button navigates to `market.tsx`

### Layers
```
app/(tabs)/fleet/explore.tsx          ← thin route, renders StarMapScreen
src/ui/exploration/
  StarMapScreen.tsx                   ← SVG map + mission tracker strip
  SystemSheet.tsx                     ← bottom sheet: system detail + dispatch
  MissionTracker.tsx                  ← horizontal strip of active missions
  DiscoveryCard.tsx                   ← modal: animated reward reveal
  index.ts                            ← barrel export

src/game/exploration/
  generator.ts                        ← generateStarSystems(seed, count)
  mission.ts                          ← calculateFuelCost, calculateTravelTime, resolveMission
  index.ts                            ← barrel export

src/stores/useExplorationStore.ts     ← Zustand store, persisted to AsyncStorage
src/services/notifications.ts        ← scheduleArrivalNotification, cancelNotification
src/types/exploration.ts              ← FleetMission, DiscoveryResult, ExplorationState
```

---

## Data Types

```ts
// src/types/exploration.ts

export type MissionStatus = 'in_transit' | 'arrived' | 'collected';

export interface FleetMission {
  id: UUID;
  systemId: UUID;
  departedAt: number;   // ms UTC
  arrivesAt: number;    // ms UTC
  fuelCost: number;
  status: MissionStatus;
  notificationId?: string;
}

export interface DiscoveryResult {
  missionId: UUID;
  systemId: UUID;
  planetsFound: Planet[];       // subset of system's planets, now marked discovered
  resourcesGained: Resources;   // credits, fuel, research
  fragmentDrop?: ComponentTier; // optional loot
}
```

Extends existing `Planet`, `StarSystem`, `Resources`, `UUID` from `src/types/index.ts`. Adds `dangerLevel: 1 | 2 | 3 | 4 | 5` to `StarSystem`.

---

## Game Logic — `src/game/exploration/`

### `generator.ts`
```
generateStarSystems(seed: number, count = 20): StarSystem[]
```
- Uses `SeededRNG` (already in `src/game/rng.ts`)
- Lays out systems on a 2000×2000 pt virtual grid, minimum 150 pt spacing
- Each system: 1–4 planets, dangerLevel 1–5, planet resourceRichness 0..1
- Always places a "Sol" home system at position (1000, 1000) as the player's origin

### `mission.ts`
```
calculateFuelCost(from: Vec2, to: Vec2): number
  → Math.ceil(distance / 100)   // ~10–28 fuel units for typical distances

calculateTravelTime(from: Vec2, to: Vec2): number  // returns ms
  → clamp(distance * 300, 5 * 60_000, 20 * 60_000)  // 5–20 minutes

resolveMission(mission: FleetMission, systems: StarSystem[], rng: SeededRNG): DiscoveryResult
  → rolls credits (50–500 scaled by richness), fuel refund (20–60%), research (0–50)
  → 8% base fragment drop chance, +2% per danger level above 2
  → fragment tier weighted by danger level (low danger → common/uncommon, high → rare/legendary)
```

### Determinism
`resolveMission` seeds its RNG from `mission.id` hash so the same mission always resolves identically (replay-safe).

---

## State — `src/stores/useExplorationStore.ts`

```ts
interface ExplorationState {
  starSystems: StarSystem[];
  activeMissions: FleetMission[];
  discoveries: DiscoveryResult[];
  mapInitialized: boolean;
  fuel: number;   // no dedicated Resources store yet — fuel managed here for MVP
}

actions:
  initMap(playerSeed: number): void        // generates systems if not yet initialized
  dispatchFleet(systemId: UUID): void      // deducts fuel, creates mission, schedules notification
  checkArrivals(): void                    // flips in_transit → arrived for elapsed missions
  collectMission(missionId: UUID): void    // credits resources, marks collected, cancels notif
```

- Persisted to `AsyncStorage` via Zustand `persist` middleware
- `checkArrivals()` called on app foreground resume and on StarMapScreen mount
- `playerSeed` derived from Supabase user UUID (first 8 hex chars → integer)
- Fuel deducted from `resources` slice within `useExplorationStore` (no dedicated Resources store exists yet — fuel lives here for MVP, seeded with `STARTING_RESOURCES.fuel` from `src/constants/game.ts`); dispatch fails if insufficient

---

## Notifications — `src/services/notifications.ts`

Uses `expo-notifications` (new dependency, ~adds ~150 KB to bundle).

```ts
scheduleArrivalNotification(mission: FleetMission, systemName: string): Promise<string>
  // schedules local notification at mission.arrivesAt
  // body: "Your fleet has returned from [systemName] — tap to collect."
  // returns notificationId stored on the mission

cancelNotification(notificationId: string): Promise<void>

requestNotificationPermission(): Promise<boolean>
  // called on first dispatch; gracefully degrades if denied
```

Permission is requested once on first dispatch with user-facing copy:
> "Get notified when your fleets return home."

If denied, dispatch proceeds normally — notifications are additive, not required.

---

## UI Components

### `StarMapScreen`
- `ScrollView` with `minimumZoomScale={0.5}` `maximumZoomScale={2}`, `pinchGestureEnabled`
- Contains a **Skia `<Canvas>`** sized 2000×2000 pt (`@shopify/react-native-skia`, already installed)
- Travel lanes: faint Skia `<Line>` between adjacent systems (within 400 pt)
- System nodes: Skia `<Circle>` radius 12, color by status:
  - Grey `#6B7280` — undiscovered
  - Blue `#3B82F6` — discovered, no active mission
  - Amber `#F59E0B` — fleet in transit
  - Green `#10B981` — fleet arrived, uncollected
- Tap detection via `onTouch` handler on Canvas — hit-tests against node positions
- Home system (Sol) has a white ring indicator
- `MissionTracker` renders below the map, above safe area

### `SystemSheet`
- Bottom sheet (using existing `react-native-reanimated` pattern from `ListItemModal`)
- Header: system name + danger level (★ icons, 1–5)
- Planet list: name + richness bar per planet (hidden until discovered)
- Travel info row: estimated time + fuel cost
- **"Send Fleet"** primary button
  - Disabled states: "Not enough fuel", "Fleet already en route"
  - If fleet arrived uncollected: shows "Collect" button instead
- On dispatch: haptic feedback via existing `expo-haptics`

### `MissionTracker`
- Horizontal `ScrollView` of mission chips
- Each chip: system name + animated progress bar (`Animated.Value` driven by 10s interval)
- Tapping a chip opens `SystemSheet` for that system
- Hidden when `activeMissions` is empty

### `DiscoveryCard`
- Full-screen modal with dark overlay
- Animated sequential reveal: planet names → resources → fragment (if any)
- Fragment tier badge reuses existing tier badge styles from `src/ui/fleet/`
- "Collect" button calls `collectMission()` and dismisses

---

## Navigation

Add to `FleetScreen.tsx`:
```tsx
<Pressable onPress={() => router.push('/(tabs)/fleet/explore')}>
  Star Map
</Pressable>
```

New route file: `app/(tabs)/fleet/explore.tsx` — renders `<StarMapScreen />`.
No changes to `_layout.tsx` needed (Stack auto-discovers new routes).

---

## Constants to add to `src/constants/game.ts`

```ts
export const EXPLORATION = {
  MAP_SIZE:              2000,
  SYSTEM_COUNT:          20,
  MIN_SYSTEM_SPACING:    150,
  TRAVEL_LANE_MAX_DIST:  400,
  FUEL_COST_DIVISOR:     100,
  TRAVEL_TIME_SCALE:     300,   // ms per pt of distance
  TRAVEL_TIME_MIN_MS:    5  * 60_000,
  TRAVEL_TIME_MAX_MS:    20 * 60_000,
  FRAGMENT_BASE_CHANCE:  0.08,
  FRAGMENT_DANGER_BONUS: 0.02,
} as const;
```

---

## Error Handling

- Insufficient fuel: blocked at store action level, button disabled in UI with label
- Mission already active to system: button shows current ETA instead of dispatch option
- Notification permission denied: dispatch proceeds silently, no retry prompt
- App killed mid-mission: `checkArrivals()` on resume resolves correctly via timestamp comparison

---

## Out of Scope (MVP)

- Real-time fleet movement animation
- Mission cancellation
- PvP system interception
- Server-side mission validation
- Planet naming by player
- Supabase sync of exploration state (local-only for MVP)
