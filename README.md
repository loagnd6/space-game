# 🚀 Space Explorer

A React Native / Expo mobile game: deep space exploration, planet discovery,
resource management, and real-time fleet combat.

See [CLAUDE.md](CLAUDE.md) for architecture, conventions, and the system map.

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npm start
   ```

   Then open it in [Expo Go](https://expo.dev/go) on a device, or an iOS/Android
   emulator / web (`w`).

## Project layout

```
app/                  Expo Router screens (thin — import from src/)
  (tabs)/             Tab navigator: Star Map, Fleet, Tech, Settings
src/
  game/               Pure TypeScript game logic (no JSX)
    exploration/      Star map, navigation, planet discovery
    battle/           Deterministic battle engine
    fleet/            Fleet management
    resources/        Resource economy
    progression/      Tech tree
  ui/                 Reusable UI components
  services/           Supabase, analytics
  types/              Shared types
  constants/          Theme + game constants (no magic numbers in logic)
.claude/agents/       Project subagents (code-review, research, game-design, performance-audit)
skills/               Domain guidance docs
```

## Conventions
See [CLAUDE.md](CLAUDE.md). Highlights: TypeScript strict, `@/*` path alias,
deterministic battle math (seeded RNG, no `Math.random()`), UUIDs for all entities,
no game logic or Supabase calls in the render/UI thread.
