# 🚀 Space Exploration & Battle Game

## Project Overview
A React Native / Expo mobile game featuring deep space exploration, planet discovery,
resource management, and real-time fleet combat.

> **Before every task:** read `docs/overview.md` for the full file map, data flow, and system descriptions. It is the ground truth for what exists and how things connect.

## Tech Stack
- **Framework**: React Native + Expo SDK 56
- **Language**: TypeScript (strict mode)
- **Backend/Auth**: Supabase (auth, player data, leaderboards)
- **State**: Zustand (game state), React Query (server sync)
- **Navigation**: Expo Router
- **Physics**: Custom 2D (or Rapier2d via WASM if needed)
- **Storage**: AsyncStorage (offline), Supabase (cloud save)

---

## Core Game Systems

| System | Status | Location |
|--------|--------|----------|
| Gacha Spin | 🟢 Complete | `src/game/spin/`, `src/ui/spin/`, `supabase/functions/spin/` |
| Ship Loadout | 🟢 Complete | `src/ui/fleet/LoadoutScreen.tsx`, `useShipStore` |
| Combat Engine | 🟡 Logic done, no UI | `src/game/ships/CombatEngine.ts` |
| Marketplace / Auction House | 🟢 Complete | `src/ui/fleet/MarketScreen.tsx`, `supabase/functions/marketplace-buy/` |
| Fragment Combining | 🟢 Complete | `src/game/ships/FragmentCombiner.ts`, `supabase/functions/combine-fragments/` |
| Star Map / Planet Discovery | 🟡 Built, not wired up + 4 known bugs (see Session Sync) | `src/game/exploration/`, `src/stores/useExplorationStore.ts`, `src/ui/exploration/` |
| Resource System | 🔴 Not started | `src/game/resources/` |
| Tech Tree | 🔴 Not started | `src/game/progression/` |

---

## Session Sync (update before each session)
```
Last worked on : Fixed the 4 known bugs from the prior code review (systematic-debugging
                  process: confirmed each against current code, added failing tests for
                  the two logic-layer bugs, then fixed):
                  1. DiscoveryCard no longer calls collectMission — SystemSheet is now
                     the sole owner of the collect action; DiscoveryCard's button just
                     calls onClose().
                  2. StarMapScreen destructures `fuel` from the reactive useExplorationStore()
                     selector instead of a one-time getState() snapshot.
                  3. mission.ts resolveMission throws a descriptive error on a missing
                     system instead of an unguarded `!` assertion; useExplorationStore.
                     collectMission wraps the call in try/catch and no-ops on failure.
                  4. useExplorationStore.collectMission now calls cancelNotification()
                     for mission.notificationId before mutating state.
                  Added tests: mission.test.ts (throws on missing system), useExplorationStore.test.ts
                  (cancels notification, no-ops on resolveMission throw). Full suite: 85/86
                  pass (1 pre-existing unrelated flaky failure in marketStyles.test.ts —
                  DST/rounding issue in formatTimeLeft, confirmed present on main before
                  these changes too). Lint: 0 errors. tsc: clean.

Also completed Task 10 of docs/superpowers/plans/2026-06-29-star-map-planet-discovery.md:
created app/(tabs)/fleet/explore.tsx (calls useExplorationStore.initMap with the
Supabase session's playerUUID, renders StarMapScreen) and added a "Star Map →"
button to FleetScreen.tsx below Auction House. Lint/tsc/Jest all clean. Manual
device smoke test (plan's Task 10 Step 4 checklist) not yet run — dev server was
started but user deferred hands-on testing to next session.

Current feature : Star Map & Planet Discovery (exploration system). All 10 plan tasks
                  code-complete and tested. All 4 known bugs fixed.

Known bugs      : None outstanding from the last review.

Next task       : Manual device smoke test per the plan's Task 10 Step 4 checklist
                  (open Fleet tab → Star Map → dispatch → wait → collect), via Expo Go
                  on a phone (no native modules requiring a dev-client build) or an
                  Android Studio emulator. Note: docs/overview.md flags that the
                  top-level `(tabs)` Star Map tab is a separate, still-untouched
                  placeholder — the real system lives under /fleet/explore. After
                  smoke test passes, the plan is fully done — decide next system
                  (Resource System or Tech Tree are both 🔴 Not started).

Blockers        : None.
```

Minor/deferred findings from the same review (not blocking, low priority): redundant
duplicate `.find()` calls in SystemSheet.tsx, an inline `import('...')` type instead of
a top-level import, a couple of stylistically-inconsistent `!` assertions, unmemoized
O(n²) lane computation in StarMapScreen (fine at 20 systems), `EXPLORATION.TRAVEL_LANE_MAX_DIST`
only enforced visually not in dispatch logic, no AsyncStorage persist versioning.

---

## Subagents Available
Four project subagents live in `.claude/agents/`. They run read-only in their own
context and can be auto-invoked or called explicitly by name:

- `code-review` — Battle logic, state machines, exploit checks
- `research` — Libraries, patterns, performance research
- `game-design` — Balance, progression, feel
- `performance-audit` — 60fps, memory, render optimization

**Usage examples:**
- *"Use the code-review agent to audit BattleEngine.ts"*
- *"Use the research agent to find the best 2D spatial index for 200+ enemies"*
- *"Use the game-design agent to review the tech tree unlock curve"*

> Note: these are named `code-review` / `research` to avoid shadowing the global
> `code-reviewer` / `researcher` agents — both sets remain available.

---

## Skills Available
Domain-specific guidance Claude should consult during relevant tasks:

- `skills/game-mechanics.md` — Ship physics, weapon systems, collision
- `skills/mobile-optimization.md` — 60fps, memory, touch input
- `skills/battle-systems.md` — Combat loops, AI, damage calc

---

## Project Conventions
- All game logic is pure TypeScript (no JSX) — lives in `src/game/`
- UI components live in `src/ui/`
- Route screens (Expo Router) live in `app/` and stay thin — they import from `src/`
- Services (Supabase, analytics) live in `src/services/`
- Types shared across systems live in `src/types/`
- Every system exports a single `index.ts` barrel file
- Constants go in `src/constants/` — never magic numbers in game logic
- Tests go alongside source: `BattleEngine.test.ts` next to `BattleEngine.ts`

## Naming Conventions
- Game entities: PascalCase types (`Ship`, `Fleet`, `Planet`)
- State slices: camelCase (`useFleetStore`, `useBattleStore`)
- Game loop functions: verb-first (`updateBattle`, `resolveCollision`)
- Constants: SCREAMING_SNAKE (`MAX_FLEET_SIZE`, `BASE_DAMAGE_MULTIPLIER`)

---

## Critical Rules
1. **Never run game logic on the UI thread.** Use `InteractionManager` or workers.
2. **All battle calculations must be deterministic** (no `Math.random()` — use seeded RNG).
3. **Profile before optimizing** — measure first, fix what's proven slow.
4. **Supabase calls are never in the game loop** — buffer and sync outside of it.
5. **Every ship/fleet/planet has a UUID** — never use array index as identity.
