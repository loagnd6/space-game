# Battle Arena, Player Progression & Combat Economy — Design Spec

**Date:** 2026-07-02
**Status:** Approved pending user review
**Depends on:** Combat Engine (`src/game/ships/CombatEngine.ts`, complete), Spin, Auction House, Star Map (all live)

---

## 1. Goal

The collect-and-manage loop (Spin / Loadout / Auction House / Star Map) works, but there is
nothing to *do* with ships. This feature makes Battle the center of the game:

- A **Battle Arena** tab where players fight AI fleets (Skirmish ladder) and other players'
  fleets (PvP ladder), watching battles play out as animated replays.
- A **Player Level / XP** system earned only through battle, gating harder content.
- A **Ship Leveling** sink (Lumens + new Salvage resource, Clash Royale style) so battle
  rewards feed back into combat power.
- **Planetary Defense** fights during exploration collection — fragments must now be won,
  not passively rolled (this also fixes the existing phantom-fragment bug, §8.3).
- A visual/UX pass: shared space background, Spin landing overhaul, Fable-designed battle
  choreography.

Out of scope (follow-up specs): Star Map planet-art overhaul, any Lumens cosmetics shop,
Tech Tree, Resource System.

---

## 2. Navigation Changes

- Tab order becomes: **Fleet, Star Map, Battle, Tech, Spin** (5 tabs).
- **Battle is the middle tab and the initial route** — the game opens on Battle.
- **Settings tab is removed.** Settings becomes a pushed/modal route opened from a gear
  icon in the top-right of the Battle screen header.
- New full-screen modal route for the **Battle Replay** screen, shared by all three battle
  sources (Skirmish, PvP, Planetary Defense) — it must be reachable from the Battle tab and
  from the Star Map collect flow.

---

## 3. Battle Arena (launcher screen)

`app/(tabs)/battle.tsx` → `src/ui/battle/BattleScreen.tsx`.

Layout: header (Player Level + XP progress bar, Salvage + Lumens balances, settings gear),
then two sections:

1. **Skirmish ladder** — vertical list of AI tiers (TierCard: name, min level, reward
   preview, cleared-today state, locked/unlocked).
2. **PvP ladder** — the player's current rank plus the 5 rivals directly above them
   (RivalCard: name, rank, power score). Tap a rival to challenge.

Tapping any opponent calls the matching Edge Function; on success the client opens the
Battle Replay screen with the returned battle log and rewards.

### 3.1 Battle Replay screen

Animates the `BattleEvent[]` log turn by turn: two ship panels with HP bars depleting,
damage numbers, ability-proc callouts (Phase Cannon, Iron Tomb, Overdrive, Echo Shell),
ending in a win/loss result card showing rewards (same visual family as `DiscoveryCard` /
`SpinResult`). Skippable (skip → jump to result). Exact choreography, pacing, and copy come
from the Fable visual spec (§10.4).

The client **never computes battle outcomes** for reward-bearing fights — it animates the
log the server returns.

---

## 4. Player Level & XP

- New server-side progression: `player_progress` table (§9.1). XP is granted **only** by
  Skirmish and PvP wins, written by the battle Edge Functions.
- Level curve: `xpToNext(level) = round(100 × level^1.5)`. Level cap **30**; XP past cap is
  discarded.
- Player Level gates Skirmish tier unlocks (§5) and nothing else for now.
- Displayed in the Battle header; level-up moment gets a celebration treatment (Fable spec).

---

## 5. AI Skirmish Ladder

Eight tiers. Each defines a minimum Player Level and an opponent strength band:

| # | Tier (placeholder names — Fable pass finalizes) | Min level | Opponent band |
|---|---|---|---|
| 1 | Recruit    | 1  | common components, ship level 1 |
| 2 | Scout      | 3  | common/uncommon, ship level 2 |
| 3 | Corsair    | 5  | uncommon, ship level 4 |
| 4 | Veteran    | 8  | uncommon/rare, ship level 6 |
| 5 | Ace        | 11 | rare, ship level 9 |
| 6 | Warlord    | 14 | rare/legendary, ship level 12 |
| 7 | Dreadnought| 17 | legendary, ship level 16 |
| 8 | Sovereign  | 20 | legendary/ultra_rare (with abilities), ship level 20 |

- **Opponent generation is deterministic per day:** seed = `hash(playerId + tierId + UTC date)`.
  The same tier fields the same fleet all day ("today's Ace fleet"), fresh tomorrow. Both
  client (for preview display) and Edge Function (authoritative) derive it identically from
  `src/game/battle/ladder.ts` logic (inlined server-side, same pattern as spin).
- Opponent stats scale **off tier/level only** — never off the player's power score.
- Unlocking: a tier is challengeable when Player Level ≥ min level. Beating a tier is not
  required to attempt the next (level is the gate).

### 5.1 Rewards

- **First win per tier per UTC day** pays full rewards; further wins on that tier that day
  pay a consolation of **15% (rounded up)**.
- Full reward for tier *n*: **XP = 50 × n, Lumens = 25 × n, Salvage = 10 × n.**
- This is the game's first passive Lumens faucet — values are deliberately modest relative
  to Auction House prices and are constants, easy to tune.
- Losses pay nothing.

---

## 6. PvP Ladder

- Players join the ladder on first visit to the Battle tab (rank = current max + 1).
- **Matchmaking:** the screen lists the 5 rivals ranked directly above you. Challenge any
  of them.
- **Resolution:** `battle-pvp` Edge Function reads the *defender's live loadout* via
  service role at fight time (client RLS can't read others' ships — the Edge Function
  sidesteps this with no schema change). Defenders who have never equipped anything get a
  default all-common loadout. Ship levels of both sides apply.
- **Win:** attacker and defender swap ranks (only if attacker was lower). **Loss:** no rank
  change — losses are never punished.
- **Rewards:** 1.5× the full reward of the player's highest unlocked Skirmish tier, for the
  first **5 PvP wins per UTC day**; consolation (15%) after the cap. XP/Lumens/Salvage trio,
  same as Skirmish.

---

## 7. Ship Leveling (the Lumens + Salvage sink)

- One whole-ship level per player, **1–20**, stored in `player_progress.ship_level`.
- Each level above 1 adds **+2% to all combat stats** (max HP, damage, shield pool) —
  +38% at level 20. Applied inside `buildCombatant()` via a new optional `shipLevel`
  parameter (defaults to 1; existing tests unaffected).
- Cost to reach level *n+1*: **Lumens = round(200 × 1.5^(n−1)), Salvage = 10 × n.**
  (Level 2 ≈ 200 Lumens + 10 Salvage; level 20 ≈ 295k Lumens — deliberately steep at the
  top; constants, tunable.)
- Upgrade UI lives on **LoadoutScreen** next to PowerScore: current level, stat bonus, next
  cost, upgrade button. The upgrade mutation is a small Edge Function call (or RPC) so the
  server validates balances and writes atomically.
- **Salvage** is a new fungible resource earned *only* from Skirmish/PvP wins and spent
  *only* on Ship Leveling. Stored in `player_progress.salvage`, shown in Battle header and
  LoadoutScreen.

---

## 8. Exploration Changes

### 8.1 Planetary Defense (contest the planet)

Replaces the passive fragment roll on mission collection:

1. Client collects an arrived mission. `resolveMission()` still deterministically rolls
   fragment eligibility from `hashUUID(missionId)` (unchanged odds: 8% base + danger bonus).
2. **If eligible**, instead of silently granting the badge, the collect flow presents a
   defender encounter: a hostile fleet guards the prize. The player fights it via the
   shared Battle Replay screen.
3. `battle-defense` Edge Function is authoritative: it **regenerates the player's star map
   server-side** (map is deterministic from the player UUID), validates systemId +
   dangerLevel, re-derives the same eligibility roll from missionId, generates the same
   seeded defender fleet, resolves the battle, and on a win **credits the fragment to
   `player_inventory`** (tier odds by dangerLevel, same `TIERS_BY_DANGER` as today).
4. **Win:** fragment (real, in inventory). **Loss:** base resources only, fragment
   forfeited — one attempt per mission, no retry. Declining the fight (or dismissing the
   encounter without starting it) also forfeits. No XP/Lumens/Salvage from this path.
5. Anti-replay: Edge Function dedupes by missionId (a `claimed_missions` table) and
   enforces a per-system claim cooldown ≥ minimum travel time, so minting fresh missionIds
   client-side achieves nothing.

Defender fleets are generated by `src/game/exploration/defender.ts`:
`generateDefender(dangerLevel, seed)` — component tiers scale with dangerLevel (danger 1 ≈
common fleet, danger 5 ≈ legendary), seeded from `hashUUID(missionId)` so client preview
and server resolution always agree.

### 8.2 Travel time & Wormholes

- Travel time stays **distance-based** (danger never affects travel). The clamp widens:
  `TRAVEL_TIME_MIN_MS` 5 min → **90 s**, `TRAVEL_TIME_MAX_MS` 20 min → **30 min**. Near
  systems resolve fast for new players; the far rim is a real wait.
- **Wormhole** — new consumable `ItemType`. Sources: **Spin loot pool only** (rare tier
  roll becomes 40% ship_component / 40% blueprint / 20% wormhole). Not purchasable.
  **Tradeable on the Auction House** (not soul-bound) — gives the market a desirable good.
  Using one on a dispatch (button in SystemSheet) makes the fleet arrive instantly;
  consumption is server-validated (small `use-item` Edge Function decrements inventory),
  then the local mission's `arrivesAt` is set to now.
- Spin's loot table is inlined in the deployed spin Edge Function — **it must be updated
  and redeployed** together with the client `lootTable.ts` change.

### 8.3 Bug absorbed: phantom fragments

Today `DiscoveryCard` displays a fragment reward but nothing ever writes it to
`player_inventory` — the player never receives it. Planetary Defense fixes this: fragments
are credited server-side on a won defense fight. No separate fix needed.

---

## 9. Data Model & Backend

### 9.1 New migration

- `player_progress` — `player_id` PK/FK, `xp` int, `level` int, `salvage` int,
  `ship_level` int (default 1). RLS: players read own row; writes via service role only.
- `skirmish_clears` — `(player_id, tier_id, cleared_date)` for daily first-win tracking.
- `pvp_ladder` — `player_id` PK, `rank` int unique, `display_name`. Publicly readable
  (it's a ladder); writes via service role only. `pvp_wins_today` tracking for the daily cap.
- `claimed_missions` — `mission_id` PK, `player_id`, `system_id`, `claimed_at` (defense
  dedupe + cooldown).
- Helper RPCs as needed (mirroring `increment_lumens`).

### 9.2 Edge Functions (all inline the pure logic, same pattern as spin)

| Function | Input | Does |
|---|---|---|
| `battle-skirmish` | `tierId` | level gate → seeded daily opponent → `resolveBattle` → grant full/consolation rewards → return log + rewards + reward type |
| `battle-pvp` | `defenderId` | rank-proximity check → read defender loadout (service role) → resolve → swap ranks on win → grant capped rewards → return log + rewards |
| `battle-defense` | `missionId`, `systemId` | regenerate map from caller UUID → validate + dedupe → re-derive eligibility + defender → resolve → credit fragment on win → return log + fragment |
| `use-item` | `itemId` | validate ownership → decrement/delete inventory row (first use: Wormhole) |

Seeds: `battle-skirmish` and `battle-defense` use the deterministic seeds defined in §5
and §8.1 (server re-derives them independently); `battle-pvp` uses server entropy. All
three return the full `BattleEvent[]` log; the client animates, never recomputes.

---

## 10. Client Architecture

### 10.1 New pure game logic (`src/game/`, all with unit tests)

- `battle/ladder.ts` — `SKIRMISH_TIERS`, `generateOpponent(tierId, seed): PlayerShip`
- `battle/xp.ts` — `xpToNext(level)`, `levelFromXp(xp)`
- `battle/leveling.ts` — `shipLevelBonus(level)`, `shipLevelCost(level)`
- `battle/rewards.ts` — reward tables, consolation math
- `exploration/defender.ts` — `generateDefender(dangerLevel, seed)`
- `ships/CombatEngine.ts` — `buildCombatant(ship, shipLevel = 1)` applies the flat % bonus
- Constants: new `BATTLE` and `SHIP_LEVELING` blocks in `src/constants/game.ts`;
  `EXPLORATION` travel clamps updated

### 10.2 State

- New `src/stores/useBattleStore.ts` — playerLevel/xp/salvage/shipLevel, skirmish clear
  state, PvP rivals, `fetchProgress()`, `challengeSkirmish(tierId)`, `challengePvp(id)`,
  `levelUpShip()`. Thin: calls Edge Functions, updates state.
- `useExplorationStore.collectMission` splits into a two-phase flow when a defense fight
  triggers (resolve locally → fight → credit via Edge Fn on win).

### 10.3 New UI (`src/ui/battle/` + shared)

- `BattleScreen.tsx`, `BattleReplayScreen.tsx`, `TierCard.tsx`, `RivalCard.tsx`,
  `HpBar.tsx`, `AbilityCallout.tsx`, `BattleResultCard.tsx`
- `src/ui/common/SpaceBackground.tsx` — shared Skia starfield: 2–3 depth layers, subtle
  nebula gradient, slow twinkle (Reanimated, no per-frame JS). Used by all tabs; the
  replay screen gets a more dramatic variant. Replaces flat `COLORS.background`.
- LoadoutScreen: Ship Level display + upgrade button. SystemSheet: defense-fight entry +
  "Use Wormhole". Routes: tab reorder, `battle.tsx`, settings route, replay modal route.

### 10.4 Spin overhaul & Fable design pass

**Spin landing:** replace the timed final lurch with an overshoot-and-settle spring — and
**vary it per spin**: the reel's landing position within the strip is randomized each spin
(the winning card is placed at a randomized index / scroll distance, not the fixed
`WINNER_INDEX`), and the overshoot magnitude varies (roughly 0.15–0.6 card widths,
occasionally a near-miss crawl past the adjacent card). Presentation-only randomness — the
prize is always the server's result. Haptic ticks fire per card passing and slow with the
reel. The spin area also gets a visual prettying (frame/glow around the reel, richer
backdrop) per the Fable spec.

**Fable pass (process):** at implementation-planning time, Fable-model subagents produce a
companion visual spec (`docs/superpowers/specs/2026-07-02-battle-arena-visual-spec.md`)
covering: battle replay choreography (pacing, HP bar behavior, proc callouts, damage
numbers, win/loss moment, level-up moment), the shared space visual language (background,
glows, building on `TIER_STYLES`), Spin screen relayout, and flavor copy (final tier
names, AI fleet names, callout text). Implementation tasks reference that spec; I write
the code.

---

## 11. Error Handling

- Edge Function failures → stores return `{ error }`; UI shows a toast/inline error and
  never opens the replay screen. No optimistic reward display.
- Offline: Battle tab renders cached progress/ladder with challenge buttons disabled.
- Defense fight interrupted (app killed mid-replay): the Edge Fn already resolved and
  credited server-side; on next collect-flow open, show the stored result rather than
  re-fighting (missionId dedupe makes retry calls safe/idempotent).
- `use-item` failure leaves the mission timer untouched.

## 12. Testing

- Unit tests (Jest, alongside source): ladder/opponent generation determinism, XP curve,
  ship-level bonus & cost curve, reward/consolation math, defender generation determinism,
  `buildCombatant` with shipLevel, travel-time clamp changes.
- Store tests with mocked fetch for `useBattleStore` (reward application, error paths).
- Existing suites must stay green; `CombatEngine.test.ts` extended, not modified.
- Manual emulator pass (adb + uiautomator, per established technique) for: tab order +
  initial route, full skirmish fight, PvP fight, defense fight from collect flow, wormhole
  use, spin landing feel (subjective human check).

## 13. Explicitly Rejected / Deferred

- Lumens for cosmetics or extra spins — rejected as redundant/value-diluting.
- Energy/cooldown gating on battles — rejected in favor of daily first-win reward decay.
- Battle dropping component fragments — rejected; fragments stay Spin + exploration.
- Star Map planet-art visual overhaul — deferred to its own follow-up spec.
- Reminder (pre-existing): revert the TEMP 10s free-spin interval before release.
