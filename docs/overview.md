# Codebase Overview

> Read this before starting any task. It maps every file, how data flows, and how systems connect.

---

## Directory Tree

```
mobile-game/
├── app/                              # Expo Router — route = file
│   ├── _layout.tsx                  # Root: auth gate (session → tabs, else login)
│   ├── +not-found.tsx
│   ├── (auth)/
│   │   ├── _layout.tsx              # Auth stack navigator
│   │   ├── login.tsx
│   │   └── register.tsx
│   └── (tabs)/
│       ├── _layout.tsx              # 5-tab bar: Star Map, Fleet, Spin, Tech, Settings
│       ├── index.tsx                # Star Map tab (placeholder — see note below)
│       ├── spin.tsx                 # → SpinScreen
│       ├── tech.tsx                 # Tech Tree (placeholder)
│       ├── settings.tsx             # Settings (placeholder)
│       └── fleet/
│           ├── _layout.tsx
│           ├── index.tsx            # → FleetScreen
│           ├── [shipId].tsx         # → LoadoutScreen (dynamic route)
│           ├── market.tsx           # → MarketScreen
│           └── explore.tsx          # NOT YET CREATED — Task 10, wires StarMapScreen in
│
├── src/
│   ├── constants/
│   │   ├── theme.ts                 # COLORS, SPACING, RADIUS, FONT
│   │   └── game.ts                  # MAX_FLEET_SIZE, SPIN_LOOT_WEIGHTS, PITY_THRESHOLD,
│   │                                #   COMPONENT_STAT_MULTIPLIERS, MARKETPLACE limits,
│   │                                #   EXPLORATION (map size, system count, fuel/travel tuning)
│   │
│   ├── types/
│   │   ├── index.ts                 # UUID, Vec2, Planet, StarSystem (+ dangerLevel), Ship, Fleet, Resources
│   │   ├── inventory.ts             # ResourceType, ItemType (8 variants), InventoryItem
│   │   └── exploration.ts           # MissionStatus, FleetMission, DiscoveryResult
│   │
│   ├── services/
│   │   ├── index.ts                 # barrel: supabase + notifications
│   │   ├── supabase.ts              # Supabase client (AsyncStorage-backed auth)
│   │   └── notifications.ts         # expo-notifications wrapper — request/schedule/cancel arrival push
│   │
│   ├── stores/                      # Zustand
│   │   ├── useShipStore.ts          # equippedComponents, ownedComponents, fragmentCounts
│   │   │                            #   fetchShip(), equipComponent(), combineFragmentsForSlot()
│   │   ├── useSpinStore.ts          # freeSpinAvailableAt, premiumSpinUsedToday, lastResult
│   │   │                            #   fetchSpinState(), spin(spinType)
│   │   ├── useEconomyStore.ts       # lumenBalance, activeListings, marketplaceListings, inventory
│   │   │                            #   fetchBalance(), fetchMyListings(), fetchMarketplace(),
│   │   │                            #   listItem(), buyListing()
│   │   └── useExplorationStore.ts   # starSystems, activeMissions, discoveries, fuel — AsyncStorage
│   │                                #   persisted (zustand/middleware), no Supabase involved.
│   │                                #   initMap(playerUUID), dispatchFleet(systemId),
│   │                                #   checkArrivals(), collectMission(missionId)
│   │
│   ├── game/                        # Pure TypeScript — no JSX, no Supabase calls
│   │   ├── rng.ts                   # SeededRNG (mulberry32) — .next() → [0,1), .int(min,max)
│   │   ├── ships/
│   │   │   ├── types.ts             # ComponentSlot, ComponentTier, ShipComponent, PlayerShip,
│   │   │   │                        #   Combatant, BattleEvent, BattleResult
│   │   │   ├── CombatEngine.ts      # buildCombatant(), resolveBattle(attacker, defender, rng)
│   │   │   └── FragmentCombiner.ts  # canCombine(count), combineFragments(slot, count)
│   │   ├── spin/
│   │   │   ├── types.ts             # LootTier, SpinType, LootItem, SpinResult, SpinState
│   │   │   ├── SpinEngine.ts        # resolveSpinResult(seed, pityCounter) — pure
│   │   │   └── lootTable.ts         # rollTier(rng, pityCounter), rollItemForTier(rng, tier)
│   │   ├── economy/
│   │   │   ├── types.ts             # MarketplaceListing, LumenLedgerEntry, LumenReason
│   │   │   └── AuctionHouse.ts      # validateListing(), calculateFee() (5%)
│   │   └── exploration/
│   │       ├── generator.ts         # generateStarSystems(seed, count?) — seeded, Sol fixed at map center
│   │       ├── mission.ts           # hashUUID(), calculateFuelCost(), calculateTravelTime(),
│   │       │                        #   resolveMission(mission, systems, rng)
│   │       └── index.ts             # barrel export
│   │
│   └── ui/
│       ├── Screen.tsx               # Generic placeholder scaffold
│       ├── spin/
│       │   ├── SpinScreen.tsx       # Container: reel + buttons + result
│       │   ├── SpinReel.tsx         # Animated reel (fake-out → snap to winner)
│       │   ├── SpinResult.tsx       # Result card (tier + item)
│       │   ├── SpinButtons.tsx      # Free / Ticket buttons with cooldown countdown
│       │   ├── ReelCard.tsx         # Single reel item
│       │   ├── reelData.ts          # spinResultToReelItem(), buildReelData()
│       │   ├── tierStyles.ts        # Tier → color/style mappings
│       │   └── constants.ts         # WINNER_INDEX=2, REEL_TOTAL
│       └── fleet/
│           ├── FleetScreen.tsx      # Fleet overview — ship list, nav to loadout & market
│           ├── LoadoutScreen.tsx    # 4 component slots, power score, radar chart
│           ├── MarketScreen.tsx     # Browse / My Listings tabs; buy, sell, cancel
│           ├── ShipCard.tsx         # Ship row card
│           ├── ListingCard.tsx      # Marketplace listing row (buyer/seller mode)
│           ├── ListItemModal.tsx    # Bottom sheet: pick inventory item + set price
│           ├── ComponentCard.tsx    # Component display (tier, slot, ability)
│           ├── LoadoutSlot.tsx      # Slot UI — equipped component or fragment count
│           ├── PowerScore.tsx       # Numeric power score display
│           ├── RadarChart.tsx       # 2D radar via @shopify/react-native-skia
│           ├── powerScore.ts        # calcPowerScore(equipped) → weighted sum
│           ├── radarChart.ts        # Hull/weapon/shield/engine stat arrays
│           ├── loadoutSlot.ts       # Slot color/border by tier
│           ├── marketStyles.ts      # Price/rarity card styles
│           ├── slotStyles.ts        # Per-slot colors (hull, weapons, shields, engine)
│           └── constants.ts         # SLOT_ORDER = ['hull','weapons','shields','engine']
│       └── exploration/
│           ├── StarMapScreen.tsx    # Skia canvas (lanes + system nodes) inside pan/zoom ScrollView
│           ├── SystemSheet.tsx      # Bottom sheet: danger/travel/fuel info, Send Fleet / Collect Fleet
│           ├── MissionTracker.tsx   # Horizontal strip of in-flight mission chips w/ live progress bar
│           ├── DiscoveryCard.tsx    # Full-screen reward reveal modal (planets, resources, fragment)
│           └── index.ts             # barrel export
│
├── supabase/
│   └── functions/
│       ├── spin/index.ts            # Edge Fn: validate → roll → write inventory + spin_state
│       ├── combine-fragments/index.ts  # Edge Fn: 3 frags → 1 uncommon component (optimistic lock)
│       └── marketplace-buy/index.ts  # Edge Fn: transfer lumens, move item, delete listing
│
└── docs/
    └── overview.md                  # ← this file
```

---

## Navigation Routes

Expo Router — file path = URL route:

| Route | Screen | Notes |
|-------|--------|-------|
| `/(auth)/login` | Login | Email/password |
| `/(auth)/register` | Register | |
| `/(tabs)` | Star Map (tab) | Placeholder — NOT the new exploration system, see below |
| `/(tabs)/fleet` | FleetScreen | Ship list, links to Auction House |
| `/(tabs)/fleet/[shipId]` | LoadoutScreen | Dynamic — shipId = "player-ship" |
| `/(tabs)/fleet/market` | MarketScreen | Auction House |
| `/(tabs)/fleet/explore` | StarMapScreen | **Not wired up yet** — Task 10 of the star-map plan creates this route + a "Star Map →" button on FleetScreen. Until then `src/ui/exploration/StarMapScreen.tsx` is unreachable in the running app even though it's fully built and tested. |
| `/(tabs)/spin` | SpinScreen | Gacha system |
| `/(tabs)/tech` | Tech Tree | Placeholder |
| `/(tabs)/settings` | Settings | Placeholder |

Auth gate lives in `app/_layout.tsx`: no session → redirect to login; session + auth screen → redirect to tabs.

**Two "Star Map" things exist and are easy to confuse:** the top-level `(tabs)` Star Map tab (`app/(tabs)/index.tsx`) is still an untouched placeholder from the original 5-tab scaffold. The real, fully-built star map / planet-discovery system lives under the Fleet stack (`src/ui/exploration/`) and is reached via `/fleet/explore`, not the tab. Whether the placeholder tab should eventually redirect into the Fleet-nested map, or the exploration system should move to be its own top-level tab, is an open decision — currently they're two unconnected things.

---

## Data Flow

```
Supabase Auth (persisted in AsyncStorage)
        │
        ▼
app/_layout.tsx  ──── auth state change ────►  /(auth)/login
        │ session exists
        ▼
/(tabs) — main game
        │
        ▼
Zustand Stores  ←──── fetch on screen mount ────►  Supabase DB (direct reads)
        │                                                    ▲
        │ mutations                                          │
        ▼                                                    │
Edge Functions  ──── server-side logic ────► write DB ───────┘
(/spin, /combine-fragments, /marketplace-buy)
        │
        │ use pure game logic
        ▼
src/game/ (SeededRNG, CombatEngine, lootTable, AuctionHouse)
        │ results flow back up
        ▼
Zustand stores update → React re-renders UI
```

**Exploration is a separate, local-only data flow** — `useExplorationStore` never talks to Supabase for game state. It self-persists to AsyncStorage via `zustand/middleware`'s `persist`, seeded once from the player's Supabase auth UUID (`initMap(uuid)` on first mount of `/fleet/explore`) so the same player always gets the same star map. Missions are plain UTC timestamps (`departedAt`/`arrivesAt`) checked against `Date.now()` in `checkArrivals()`, so travel resolves correctly even if the app was closed the whole time. This is intentionally different from every other store in the app — no server round-trip, no anti-cheat concern, because outcomes are cosmetic/exploration-flavored rather than economy-affecting.

---

## Key Flows

### Spin
1. User taps button → `SpinScreen` → `useSpinStore.spin(spinType)`
2. Store POSTs to `/spin` Edge Function
3. Edge Fn: checks cooldown/ticket/daily cap → `SeededRNG` + `rollTier()` + `rollItemForTier()` → writes `spin_state`, `player_inventory`, `spin_history` → returns `SpinResult`
4. Store updates `lastResult`; SpinScreen animates reel, shows result

### Fragment Combining
1. User taps "Combine" in `LoadoutSlot`
2. `useShipStore.combineFragmentsForSlot(slot)` → `/combine-fragments` Edge Fn
3. Edge Fn: checks ≥3 fragments (optimistic lock) → inserts uncommon component → returns it
4. Store updates `equippedComponents` / `fragmentCounts`

### Marketplace
- **Browse**: `fetchMarketplace()` → direct Supabase query, shows all non-expired listings
- **Sell**: `listItem(item, price)` → validate (not soul-bound, max 5 listings, price > 0) → insert listing
- **Buy**: `buyListing(listingId)` → `/marketplace-buy` Edge Fn → transfer lumens, delete listing, add item to buyer

### Loadout
1. `LoadoutScreen` mounts → `fetchShip()` → equipped components + owned inventory + fragment counts
2. Render `LoadoutSlot` × 4 + `PowerScore` + `RadarChart`
3. Equip: `equipComponent(slot, componentId)` → upsert on `player_ships`
4. Combine: see Fragment Combining flow above

### Exploration / Fleet Dispatch
1. `explore.tsx` route mounts → reads Supabase auth session for the player UUID → `useExplorationStore.initMap(uuid)` (no-ops if already generated) → `generateStarSystems(seed)` builds 20 deterministic systems, Sol fixed at map center
2. `StarMapScreen` renders systems/lanes on a Skia `Canvas` inside a pan/zoom `ScrollView`; tapping a node opens `SystemSheet`
3. `SystemSheet` shows fuel cost / travel time (`calculateFuelCost`, `calculateTravelTime`) for the tapped system; "Send Fleet" → `dispatchFleet(systemId)` deducts fuel, creates an `in_transit` `FleetMission`, and best-effort schedules a local push notification (`scheduleArrivalNotification` — degrades silently if permission is denied)
4. `MissionTracker` polls every 10s (`checkArrivals()`), flipping missions from `in_transit` → `arrived` once `Date.now() >= arrivesAt`; shows a live progress chip per active mission
5. Tapping an arrived system/chip → `SystemSheet` now shows "Collect Fleet →" → `collectMission(missionId)` runs `resolveMission()` (seeded off `hashUUID(missionId)`, so a given mission always resolves the same way) → marks planets discovered, credits resources/fuel, rolls an optional fragment drop scaled by system `dangerLevel`
6. The resolved `DiscoveryResult` is handed up through `SystemSheet.onCollect` to `StarMapScreen`, which opens `DiscoveryCard` — a full-screen reveal of planets found / resources / fragment tier

---

## Key Types

```typescript
// Ship component — the core equipable unit
ShipComponent {
  id: string
  slot: 'hull' | 'weapons' | 'shields' | 'engine'
  tier: 'common' | 'uncommon' | 'rare' | 'legendary' | 'ultra_rare'
  statMultiplier: number        // 1.0 / 1.3 / 1.7 / 2.2 / 2.5
  ability?: 'iron_tomb' | 'phase_cannon' | 'overdrive' | 'echo_shell'  // ultra_rare only
}

// Inventory item — generic container for all owned things
InventoryItem {
  id: string
  playerId: string
  itemType: 'resource_bundle' | 'boost_token' | 'blueprint' | 'ship_component'
           | 'component_fragment' | 'spin_ticket' | 'cosmetic_skin'
  itemData: Record<string, unknown>  // flexible payload per itemType
  quantity: number
  isSoulBound: boolean
  acquiredAt: string
}

// Marketplace listing
MarketplaceListing {
  id: string
  sellerId: string
  itemType: string
  itemData: Record<string, unknown>
  priceLumens: number
  listedAt: string
  expiresAt: string  // 7 days
}

// Combatant (built by CombatEngine from a PlayerShip)
Combatant {
  playerId: string
  hp: number
  maxHp: number                // base 1000 × hull.statMultiplier
  ship: PlayerShip
  ironTombUsed: boolean
  echoShellCharges: number     // max 2 reflects
}

// Star system — generated deterministically from a seed
StarSystem {
  id: UUID                     // 'sol-home' for the fixed center system, else 'sys-N'
  name: string
  position: Vec2                // within EXPLORATION.MAP_SIZE (2000×2000)
  planets: Planet[]             // 1–4, each starts undiscovered
  dangerLevel: 1 | 2 | 3 | 4 | 5 // scales with distance from Sol; raises fragment-drop odds
}

// Async fleet dispatch — one per system a fleet is sent to
FleetMission {
  id: UUID
  systemId: UUID
  departedAt: number            // ms UTC
  arrivesAt: number             // ms UTC
  fuelCost: number
  status: 'in_transit' | 'arrived' | 'collected'
  notificationId?: string       // expo-notifications id, for cancellation
}

// Result of resolving an arrived mission
DiscoveryResult {
  missionId: UUID
  systemId: UUID
  planetsFound: Planet[]        // all planets in the system, now discovered: true
  resourcesGained: Resources
  fragmentDrop?: ComponentTier  // odds = FRAGMENT_BASE_CHANCE + dangerLevel bonus
}
```

---

## Game Systems

### Gacha Spin
| Tier | Weight | Stat Multiplier |
|------|--------|-----------------|
| common | 60% | 1.0× |
| uncommon | 25% | 1.3× |
| rare | 12% | 1.7× |
| legendary | 2.5% | 2.2× |
| ultra_rare | 0.5% | 2.5× |

- **Pity**: guaranteed legendary+ at 50 non-legendary spins (`PITY_THRESHOLD`)
- **Free spin**: 1 per 4 hours
- **Premium**: 1 per day
- **Ticket**: consumed from inventory

### Combat Engine
Deterministic turn-based loop (`resolveBattle`):
- Stats derived from `statMultiplier` × base values
- Abilities proc by RNG:
  - **Phase Cannon** (weapons): 20% chance to bypass shields
  - **Iron Tomb** (hull): blocks first phase cannon bypass
  - **Overdrive** (engine): pre-battle burst — sacrifice 10% HP for 1.5× damage that turn
  - **Echo Shell** (shields): 15% chance to reflect damage, max 2 charges

### Economy
- **Currency**: Lumens
- **Listing fee**: 5% of sale price
- **Max listings**: 5 per player
- **Listing duration**: 7 days
- **Soul-bound items**: cannot be listed

### Exploration / Planet Discovery
- **Map**: 20 systems, seeded from the player's UUID, Sol fixed at the exact center — same player always sees the same map
- **Danger level**: 1–5, derived from a system's distance from Sol (`ceil(distanceFromCenter / 300)`, clamped)
- **Fuel cost**: `ceil(distance / FUEL_COST_DIVISOR)`, minimum 1
- **Travel time**: `distance × TRAVEL_TIME_SCALE`, clamped to 5–20 minutes
- **Fragment drop chance**: `FRAGMENT_BASE_CHANCE (8%) + max(0, dangerLevel - 2) × FRAGMENT_DANGER_BONUS (2%)` — higher-danger systems drop better tiers too (`TIERS_BY_DANGER` in `mission.ts`)
- **Multiple simultaneous fleets**: allowed — one active mission per system at a time, no global fleet-count cap
- **Status**: Tasks 1–9 of `docs/superpowers/plans/2026-06-29-star-map-planet-discovery.md` are complete and tested. Task 10 (wiring the `/fleet/explore` route + FleetScreen button, plus a manual device smoke test) is the only remaining piece — the system is currently unreachable in the running app.

---

## Architecture Principles

1. **`src/game/` is pure** — no JSX, no Supabase, fully testable. Game logic never touches React.
2. **Edge Functions own mutations** — spin results, fragment combining, and purchases are server-side to prevent cheating.
3. **Deterministic RNG** — `SeededRNG` (mulberry32) everywhere. No `Math.random()`. Battles are replayable.
4. **Zustand stores are thin** — they call Edge Functions or Supabase, then update local state. No business logic in stores.
5. **Route screens are thin** — `app/` files just render a component from `src/ui/`. All logic is in `src/`.
6. **Supabase never in the game loop** — buffer reads/writes outside real-time simulation.

---

## Dependencies (key packages)

| Package | Purpose |
|---------|---------|
| `expo@56` + `expo-router@56` | Framework + file-based navigation |
| `react-native-reanimated@4` | Animations (spin reel) |
| `zustand@5` | State management |
| `@supabase/supabase-js@2` | Backend (auth, DB, Edge Functions) |
| `@shopify/react-native-skia@2` | 2D graphics (RadarChart, StarMapScreen) |
| `@tanstack/react-query@5` | Server-state caching (partially integrated) |
| `expo-linear-gradient`, `expo-blur` | Visual effects |
| `@react-native-async-storage/async-storage@2` | Auth session persistence + `useExplorationStore` persist |
| `expo-notifications` | Local push notification on fleet arrival |
| `expo-haptics` | Haptic feedback (fleet dispatch) |

---

## Tests

Unit tests live alongside source files (`*.test.ts`):
- `CombatEngine.test.ts` — battle scenarios, ability interactions
- `FragmentCombiner.test.ts` — 3-fragment combining
- `lootTable.test.ts` — tier/item weighted rolls
- `generator.test.ts` — star system generation (determinism, seed variance, planet/danger bounds)
- `mission.test.ts` — fuel cost, travel time clamping, mission resolution determinism
- `useExplorationStore.test.ts` — initMap, dispatchFleet (fuel gating, duplicate-dispatch guard), checkArrivals, collectMission
- `marketStyles.test.ts` — note: `formatTimeLeft` tests call `Date.now()` twice (once to build the fixture, once inside the function) and can occasionally flake across an hour/day boundary; re-run in isolation before assuming a real regression
- `reelData.test.ts`, `powerScore.test.ts`, `radarChart.test.ts`, `loadoutSlot.test.ts`, etc.

Run: `npm test`
