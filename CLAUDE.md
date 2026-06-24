# 🚀 Space Exploration & Battle Game

## Project Overview
A React Native / Expo mobile game featuring deep space exploration, planet discovery,
resource management, and real-time fleet combat.

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
| Star Map / Navigation | 🔴 Not started | `src/game/exploration/` |
| Planet Discovery | 🔴 Not started | `src/game/exploration/` |
| Battle Engine | 🔴 Not started | `src/game/battle/` |
| Fleet Management | 🔴 Not started | `src/game/fleet/` |
| Resource System | 🔴 Not started | `src/game/resources/` |
| Tech Tree | 🔴 Not started | `src/game/progression/` |
| UI Layer | 🔴 Not started | `src/ui/` |
| Supabase Integration | 🔴 Not started | `src/services/` |

---

## Session Sync (update before each session)
```
Last worked on : [FILL IN]
Current feature: [FILL IN]
Known bugs     : [FILL IN]
Next task      : [FILL IN]
Blockers       : [FILL IN]
```

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
