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
| Star Map / Planet Discovery | 🟢 Complete — top-level tab, verified live on emulator | `src/game/exploration/`, `src/stores/useExplorationStore.ts`, `src/ui/exploration/` |
| Resource System | 🔴 Not started | `src/game/resources/` |
| Tech Tree | 🔴 Not started | `src/game/progression/` |

---

## Session Sync (update before each session)
```
Last worked on : Two rounds of live device testing on an Android Studio emulator
                  (Pixel_9 AVD), fixing real bugs found via systematic-debugging (not
                  guessed — root-caused by reading actual source/logs each time):

                  Round 1 (Star Map + backend):
                  1. expo-notifications hard-crashed the app on Android under Expo Go
                     (SDK 53+ removed push-token auto-registration there; the package
                     throws at import time — traced to DevicePushTokenAutoRegistration.fx.ts
                     calling addPushTokenListener eagerly at module load).
                     src/services/notifications.ts now guards the import behind
                     try/catch + require(), degrading to a no-op on Android/Expo Go.
                  2. Spin/Auction House/Fragment-combine all returned "NOT_FOUND" — the
                     3 Supabase Edge Functions existed in the repo but were never
                     deployed (only DB migrations had been pushed). Deployed all 3 via
                     `supabase functions deploy`; confirmed ACTIVE.
                  3. StarMapScreen could only scroll vertically (RN ScrollView is
                     single-axis). Replaced with a react-native-gesture-handler
                     Pan+Pinch gesture driving Reanimated shared values (no new
                     dependency). Fixed a missing `insets.top` (content rendered under
                     the status bar) and a Pan/Pinch pointer conflict (Pan wasn't
                     restricted to `.maxPointers(1)`, so a 2-finger pinch also triggered
                     Pan and broke zoom) — user confirmed pinch zoom in/out now works.
                  4. The top-level `(tabs)` Star Map tab was a dead placeholder while
                     the real exploration screen was nested at fleet/explore.tsx behind
                     a "Star Map →" button. Moved the real screen to be the top-level
                     tab's content, deleted fleet/explore.tsx, removed the redundant
                     button from FleetScreen.tsx. Confirmed live: bottom tab now shows
                     the working map directly.

                  Round 2 (Spin UI polish, user feedback after using it):
                  5. Free-spin cooldown set to 10 seconds for testing (marked `TEMP` in
                     both src/constants/game.ts and supabase/functions/spin/index.ts —
                     MUST revert to 4 hours before any real release; redeploy the spin
                     function after reverting). Also reset the test account's
                     spin_state.free_spin_available_at via a one-off service-role PATCH
                     so testing wasn't blocked by the old 4h timestamp.
                  6. Reel cards enlarged twice over the session (now CARD_WIDTH=136,
                     CARD_HEIGHT=168 in src/ui/spin/constants.ts) and the result/reel
                     area is now vertically centered in SpinScreen.tsx (was crammed at
                     the top with a big empty gap below).
                  7. Reel deceleration felt abrupt — DECEL_MS 600→900, LURCH_MS
                     300→550, and the final "lurch to winner" phase's easing changed
                     from `inOut(quad)` to `out(cubic)` (same curve as the prior phase)
                     so the whole landing reads as one continuous slowdown.
                  8. The pointer arrow above the reel visually cut into the card
                     border — enlarged the arrow and bumped its marginBottom
                     (4→12→20 across two attempts) for unambiguous clearance.
                  9. Added tier-differentiated celebration animations on the result
                     reveal (src/ui/spin/SpinResult.tsx): scale-bounce entrance +
                     pulsing rings + outward-flying spark glyphs, with count/rings
                     scaling by tier (common: none, uncommon: 1 ring, rare: 1 ring + 4
                     sparks, legendary: 2 rings + 6 sparks, ultra_rare: 3 rings + 8
                     sparks) — reuses the existing TIER_STYLES color palette. Verified
                     no crashes across common/rare-tier live spins; the burst itself
                     (~700ms) is too fast to catch via delayed adb screenshots, so the
                     visual feel itself needs a live human check, not just "does it
                     crash."

                  All verified live via adb (screenshots + UI Automator dumps for
                  precise tap coordinates — the emulator's displayed image and actual
                  touch coordinates don't map 1:1, and guessing pixel positions wasted
                  many tap attempts before switching to `adb shell uiautomator dump` +
                  grep for `bounds=`). Lint/tsc/Jest clean throughout (85/86, same
                  pre-existing unrelated marketStyles.test.ts DST flake).

Current feature : Star Map & Planet Discovery: fully done, verified live end-to-end.
                  Spin: functionally complete pre-session; this session was UI/feel
                  polish requested after the user actually played with it.

Known bugs      : None outstanding. Spin reel deceleration feel and the new tier-burst
                  animations are code-verified (no crashes, correct tier gating) but
                  not yet subjectively confirmed by the user live (screenshots can't
                  capture sub-second motion reliably).

Next task       : User was asked what's missing to actually play the game today.
                  Answer given: the collect-and-manage loop (Spin/Loadout/Auction
                  House/Star Map) all works, but there's nothing to actually DO with
                  ships yet — Combat Engine has logic (src/game/ships/CombatEngine.ts)
                  but no UI/screen to trigger a battle. Resource System and Tech Tree
                  are both still 🔴 Not started (collected resources + research have no
                  sink yet). Combat UI is the highest-leverage next system if the goal
                  is a playable game rather than a set of menus — awaiting user
                  decision on what to build next.
                  Also outstanding: revert the TEMP 10s free-spin interval (item 5
                  above) before any real release.

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
