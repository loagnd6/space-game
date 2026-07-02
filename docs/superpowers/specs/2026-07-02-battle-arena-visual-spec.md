# Battle Arena — Visual & Choreography Spec (Fable pass)

**Companion to:** `docs/superpowers/specs/2026-07-02-battle-arena-progression-design.md` (§3, §5, §10.3, §10.4)
**Produced by:** two Fable design agents, 2026-07-02. Part A = battle screens; Part B = app-wide visual language, SpaceBackground, Spin overhaul.
**Constraints honored:** existing deps only (Skia, Reanimated, expo-linear-gradient, expo-blur, expo-haptics), 60fps mid-range Android, no per-frame JS, skippable replay.
**Token sources:** `src/constants/theme.ts` (`COLORS/SPACING/RADIUS/FONT`), `src/ui/spin/tierStyles.ts` (`TIER_STYLES`).

---

# PART A — Battle screens

## A0. Shared visual language

**New named colors (add to a `BATTLE_COLORS` block, no magic hexes in components):**

| Token | Hex | Use |
|---|---|---|
| `abilityPhase` | `#B45BFF` | Phase Cannon (brighter than ultra_rare `#9C27B0` so it reads on dark) |
| `abilityTomb` | `COLORS.accent` (`#FFB454`) | Iron Tomb |
| `abilityOverdrive` | `COLORS.danger` (`#FF5E7A`) | Overdrive |
| `abilityEcho` | `COLORS.primary` (`#5EC8FF`) | Echo Shell |
| `hpHigh` | `#4CAF50` | HP > 50% (reuses uncommon green) |
| `hpMid` | `COLORS.accent` | HP 20–50% |
| `hpLow` | `COLORS.danger` | HP < 20% |
| `ghostDamage` | `#FF5E7A99` | trailing HP "ghost" layer |

**Glow rule (Android-safe):** never use RN `shadow*`/`elevation` for glows. Glows are either (a) a translucent 1px outer border in `color + '66'`, or (b) Skia `BlurMask` inside the arena canvas. This keeps overdraw predictable on mid-range GPUs.

**Haptics rule:** haptics fire only at beat boundaries from the conductor (per-event, ~1–3 Hz), never inside worklets.

## A1. BattleScreen (launcher) — `src/ui/battle/BattleScreen.tsx`

Backdrop: shared `SpaceBackground` (standard variant). All cards sit on `#141A2EE8` (surface at ~91%) so stars faintly ghost through.

### A1.1 Header (fixed, does not scroll)

Padding: `insets.top + SPACING.sm` top, `SPACING.md` horizontal. Two rows, total content height ~72px.

**Row 1 (height 48):**
- **Level badge** — 48×48 circle, bg `COLORS.surface`, border 2px `COLORS.primary`, centered level number `FONT.lg` (22) weight `800` `COLORS.text`. During level-up celebration this same badge is the anchor (see §A2.9).
- **XP block** (flex 1, `marginLeft: SPACING.sm + 4`):
  - Caption line: `LEVEL 7` — 11px, weight `800`, `letterSpacing: 1.5`, `COLORS.muted`; right-aligned on same line: `1,240 / 2,828 XP` — 11px `COLORS.muted`.
  - **XP bar** — height 8, `borderRadius: RADIUS.full`, track `COLORS.border`, fill = `expo-linear-gradient` horizontal `['#5EC8FF', '#8FE8FF']`. Fill width animates on focus/refresh: `withTiming(fraction, { duration: 600, easing: Easing.out(Easing.cubic) })`.
- **Settings gear** — 40×40 touch target, 22px glyph, `COLORS.muted`, pressed → `COLORS.text` (90ms `withTiming`). Opens the modal settings route.

**Row 2 (height 28, `marginTop: SPACING.xs`):** currency pills, right-aligned.
- Pill: bg `COLORS.surface`, border 1px `COLORS.border`, `borderRadius: RADIUS.full`, paddingH 10 / paddingV 4, gap `SPACING.sm` between pills.
- **Lumens**: `✦ 3,420` — value 13px weight `700` `COLORS.accent`.
- **Salvage**: `⚙ 180` — value 13px weight `700` `COLORS.primary`.
- When a balance changes (post-battle return), the pill scale-pulses: `withSequence(withTiming(1.12, {duration:140, easing: Easing.out(Easing.quad)}), withTiming(1, {duration:180, easing: Easing.inOut(Easing.quad)}))`.

### A1.2 Section labels

`SKIRMISH` / `PVP ARENA` — 13px, weight `800`, `letterSpacing: 1.5`, `COLORS.muted`, `marginTop: SPACING.lg`, `marginBottom: SPACING.sm`. PvP section adds a right-aligned `RANK 42` chip (12px weight 800 `COLORS.primary`).

### A1.3 Skirmish TierCard (×8, vertical list, gap `SPACING.sm`)

**Tier accent ramp** (one accent per tier, roughly tracking the opponent band's rarity — reuses `TIER_STYLES` + theme tokens):

| # | Tier | Accent |
|---|---|---|
| 1 | Recruit | `#9E9E9E` |
| 2 | Scout | `#4CAF50` |
| 3 | Corsair | `#2196F3` |
| 4 | Vanguard | `#5EC8FF` |
| 5 | Ace | `#FFB454` |
| 6 | Warlord | `#FF9800` |
| 7 | Dreadnought | `#FF5E7A` |
| 8 | Sovereign | `#9C27B0` |

**Base card:** height 84, `borderRadius: RADIUS.md`, bg `#141A2EE8`, border 1px `COLORS.border`, plus a **3px accent bar** flush left (full height, rounded on left corners) in the tier accent. Row content, `padding: SPACING.md`:
- Emblem: 40×40 circle, bg `accent + '20'`, tier glyph centered 20px.
- Middle (flex 1): tier name `FONT.md` (16) weight `700` `COLORS.text`; sub-line 12px `COLORS.muted` = **today's generated fleet name** (§A3.2), e.g. `Crimson Talons · Ship Lv 9`.
- Right: reward preview — three stacked micro-chips 10px weight `700`: `+250 XP` (`COLORS.text`), `+125 ✦` (`COLORS.accent`), `+50 ⚙` (`COLORS.primary`).

**States:**
- **Unlocked, uncleared (the "live" state):** accent bar at 100%; outer glow = extra 1px border `accent + '66'`.
- **Featured (highest unlocked tier only):** height 96, border 1.5px accent, emblem 48px, name `FONT.lg` (22). This is the eye-magnet of the screen — exactly one card gets it.
- **Cleared today:** accent bar dims to `accent + '80'`; a check chip replaces reward chips: `✓ CLEARED · 15% until reset` — 11px weight `700` `#4CAF50`.
- **Locked:** entire card `opacity: 0.45`, accent bar `#26304D`, emblem replaced by 🔒, sub-line = `Unlocks at Level 8` (12px `COLORS.muted`). Not pressable.
- **Pressed (any pressable card):** `scale: 0.98`, 90ms `withTiming`, `Haptics.selectionAsync()` on challenge confirm.

### A1.4 PvP RivalCard (5 rivals + pinned "you" row)

Height 64, same bg/border/radius as TierCard, no accent bar. Row, `padding: SPACING.md`:
- **Rank slot** (40px wide): `#37` — `FONT.lg` (22) weight `800`, `COLORS.muted`; the rival closest above you gets `COLORS.accent`.
- Name: 15px weight `600` `COLORS.text` (flex 1).
- **Power chip:** `PWR 12,480` — 12px weight `700` `COLORS.primary`, bg `COLORS.primary + '18'`, `borderRadius: RADIUS.sm`, paddingH 8 / paddingV 3.
- Chevron `›` 18px `COLORS.muted`.

**Your row** (pinned below the 5 rivals): border 1px `COLORS.primary`, a `YOU` badge (10px weight 800, `COLORS.primary`, letterSpacing 1) after the name, not pressable. Reads as "the floor you're climbing from."

**Visual hierarchy summary:** header (identity/progress) → one featured Skirmish card (primary action) → skirmish list → PvP list. Only the featured card and the header XP gradient use saturated fills; everything else is line-work on dark, so the screen has exactly one focal point.

## A2. Battle Replay choreography — `src/ui/battle/BattleReplayScreen.tsx`

### A2.0 Architecture (the recipe everything below hangs on)

1. **Precompute the timeline once, before playback** (plain JS, off the render path): walk `BattleEvent[]` with the known loadouts (`buildCombatant` + shield-pool math from `src/constants/game.ts`) to produce `Beat[]` — each beat = `{ event, startMs, durationMs, hpAfter: {a, d}, shieldAfter: {a, d} }`. The client **derives** display values; it never re-decides outcomes (winner/loser/values all come from the log). Overdrive's self-HP cost is derived from `OVERDRIVE_HP_COST_PERCENT × maxHp` (the log's `value` is the burst only).
2. **Conductor:** a chained `setTimeout` per beat (1–3 Hz JS — allowed; the ban is per-*frame* JS). Each beat fires Reanimated `withTiming`/`withSequence` on shared values + updates Skia values. All motion runs on the UI thread.
3. **Pools, pre-mounted:** 8 damage-number `Animated.Text` nodes (recycled round-robin), 1 Skia `Canvas` for the whole arena (projectiles, flashes, explosions as Skia primitives driven by shared values). Zero mount/unmount during playback.
4. **Skip** = clear pending timeouts + `cancelAnimation` on every shared value + snap to final state (§A2.10).

### A2.1 Screen layout

Full-screen modal over `SpaceBackground` **dramatic variant** (denser stars, nebula gradient `['#0B0E1A', '#141A2E', '#1A1030']` at 12% extra opacity, slow drift).

- **Enemy panel** — top, `insets.top + SPACING.sm`, width `screen − 32`, height 96.
- **Player panel** — bottom, `insets.bottom + SPACING.md` above safe area, same size.
- **Arena** — everything between; the Skia canvas absolute-fills it.
- **Turn indicator** — centered at arena top: `TURN 4` — 11px, `letterSpacing: 2`, `COLORS.muted`; crossfades 150ms on change.
- **Skip pill** — top-right, `SKIP ▸▸`, 12px weight `800` `COLORS.muted`, bg `#141A2ECC`, border 1px `COLORS.border`, `borderRadius: RADIUS.full`, min 44×44 touch target. Visible from t=0. Android back gesture = skip.

**Ship panel anatomy** (`padding: SPACING.md`, bg `#141A2EE8`, border 1px `COLORS.border`, `borderRadius: RADIUS.md`):
- Left: ship emblem 44px.
- Name row: fleet/player name 15px weight `700` `COLORS.text` + level chip `LV 9` (10px, `COLORS.muted`).
- **Shield bar** — height 4, `borderRadius: RADIUS.full`, track `COLORS.border`, fill `COLORS.primary`. Echo Shell ships show 2 charge pips (4px dots, `COLORS.primary`) right of the bar.
- **HP bar** — height 14, `borderRadius: RADIUS.full`, three layers back-to-front: track `COLORS.border` → ghost `ghostDamage` → front fill (`hpHigh`/`hpMid`/`hpLow` by fraction, color crossfade 200ms `withTiming`). Numeric HP right-aligned above bar: `832 / 1,300` — 11px `COLORS.muted`, snaps (no tween) at impact.

### A2.2 Turn pacing

| Beat type | Turns 1–3 | Turns 4–8 | Turns 9+ |
|---|---|---|---|
| `attack` | 780 ms | 620 ms | 460 ms |
| `phase_bypass` (callout, precedes its attack) | 650 ms | 650 ms | 500 ms |
| `ability_block` | 900 ms | 900 ms | 700 ms |
| `reflect` | 520 ms | 520 ms | 420 ms |
| `overdrive_burst` | 1600 ms (always turn 0) | — | — |
| inter-turn gap | 120 ms | 120 ms | 80 ms |

**Global cap:** if the summed timeline exceeds **28,000 ms**, scale every beat by `28000 / total` (floor any beat at 380 ms). Long grinds accelerate; the opening always breathes.

### A2.3 `attack` beat (micro-timeline, t = beat start)

| t | What moves | Values |
|---|---|---|
| 0 ms | **Attacker lunge** — panel `translateY` 8px toward opponent | 90 ms `Easing.out(Easing.quad)`, return 160 ms `Easing.inOut(Easing.quad)` |
| 0 ms | **Muzzle flash** — Skia circle r 10 at panel's arena edge | opacity 0.9→0 over 140 ms |
| 60 ms | **Projectile** — Skia rounded line 26×3 px, `BlurMask` blur 6; player shots `COLORS.primary`, enemy shots `COLORS.danger` | travels edge-to-edge in 170 ms, `Easing.linear` |
| 230 ms | **Impact shake** — target panel `translateX` `withSequence` keyframes `[−5, 4, −2, 0]`, 60 ms each | 240 ms total |
| 230 ms | **Impact flash** — Skia radial r 0→22, opacity 0.8→0 | 220 ms `Easing.out(Easing.quad)` |
| 230 ms | **Border pulse** — target panel border → hit color, 80 ms in, 320 ms out | hit color = projectile color |
| 230 ms | HP/shield bars update (§A2.4), damage number spawns (§A2.5), haptic fires | `impactLight` if value < 15% of target maxHp, `impactMedium` 15–30%, `impactHeavy` > 30% |

### A2.4 HP & shield bar behavior

- **Front HP fill:** `withTiming(newFraction, { duration: 140, easing: Easing.out(Easing.quad) })` — the snap.
- **Ghost layer:** `withDelay(300, withTiming(newFraction, { duration: 450, easing: Easing.out(Easing.cubic) }))` — the red trail that makes big hits legible.
- **Shield fill:** same snap/ghost pattern (ghost in `#5EC8FF66`). Partial absorb → a small cyan `−N` (13px) rises 18px/450 ms beside the shield bar. `value === 0` attack ("fully absorbed") → no hull number; instead **`ABSORBED`** — 12px weight `800`, `letterSpacing: 1`, `COLORS.primary` — rises 18px/450 ms, and the shield bar flashes white for 80 ms.
- **Shield break (pool hits 0):** bar flickers opacity `[1, 0.3, 1, 0]` at 70 ms steps, then height collapses 4→0 over 200 ms; caption `SHIELDS DOWN` (10px, `COLORS.danger`, letterSpacing 1) fades in 150 ms, holds 700 ms, fades 200 ms.

### A2.5 Damage numbers (pooled ×8)

- Spawn at target panel's inner edge, x = panel center ± up to 24px jitter (presentation-only RNG seeded from `turn × 31 + poolIndex` so replays are identical).
- Base: 20px weight `800` `COLORS.text`. Phase-bypass hull hits: 28px `abilityPhase`. Overdrive burst: 28px `abilityOverdrive`. Reflect (lands on the original attacker): 16px `abilityEcho`.
- Motion: scale 0.7→1 in 120 ms `Easing.out(Easing.quad)`; `translateY` −30px over 620 ms `Easing.out(Easing.cubic)`; opacity holds, then `withDelay(370, withTiming(0, { duration: 250 }))`.

### A2.6 Ability beats

**Callout banner** (`AbilityCallout.tsx`, centered in arena): pill bg `#0B0E1AE6`, border 1.5px ability color, `borderRadius: RADIUS.full`, paddingH 18 / paddingV 8. Title 16px weight `900` `letterSpacing: 2` in ability color; sub-line 11px `COLORS.muted` (copy in §A3.3). Entrance: scale 0.8→1 + opacity 0→1, 160 ms `Easing.out(Easing.quad)`; hold 450 ms; exit fade 180 ms. `Haptics.notificationAsync(Warning)` at entrance.

- **`phase_bypass`** (`abilityPhase`): banner plays; the *following* `attack` beat is restyled — projectile in `#B45BFF`, and the target's shield bar drops to opacity 0.4 for 150 ms as the shot "passes through" it (pure presentation). Damage number per §A2.5.
- **`ability_block` / Iron Tomb** (`abilityTomb`): the incoming purple projectile flies but **shatters at the panel edge** — 5 Skia shard lines radiate outward, 260 ms, opacity→0. Target border width animates 1→3px in amber over 120 ms, holds 200 ms, back over 250 ms. No damage number; instead **`BLOCKED`** — 14px weight `900` `abilityTomb`, rises 22px/500 ms. No shake (that's the point: the tomb doesn't move).
- **`reflect` / Echo Shell** (`abilityEcho`): a cyan **arc** (Skia quadratic path bowing 30px sideways) travels reflector→attacker in 220 ms; small impact flash (r 0→14, 180 ms); cyan damage number on the attacker; one Echo charge pip dims to opacity 0.25 over 150 ms. `Haptics.impactLight`.
- **`overdrive_burst`** (`abilityOverdrive`, always the replay's opening set piece, 1600 ms):
  - 0 ms: arena dim — black overlay opacity 0→0.35 over 250 ms; actor panel border pulses `#FF5E7A` twice (2 × 200 ms).
  - 200 ms: `OVERDRIVE` banner.
  - 500 ms: actor's **own** HP takes the sacrifice — red flash on own bar + own damage number `−{hpCost}` in `abilityOverdrive` (hpCost derived per §A2.0).
  - 800 ms: mega projectile — 44×6 px streak, `BlurMask` blur 10, 200 ms travel.
  - 1000 ms: mega impact — shake amplitude ±9 px, Skia radial r 0→40 over 300 ms, `Haptics.impactHeavy`, 28px damage number. Shield bar untouched (burst bypasses shields — don't animate it).
  - 1300 ms: dim lifts over 300 ms. Battle proper begins.

### A2.7 Win/loss reveal

1. Final damage lands → **350 ms hold** (let the last number land).
2. **Loser destruction** (~800 ms): 3 Skia explosion pulses on the loser panel, staggered 130 ms, r 0→18, colors cycling `#FFB454 → #FF5E7A`, each 300 ms `Easing.out(Easing.quad)`; panel opacity flickers `[1, 0.4, 0.9, 0.2]` at 80 ms steps; then settles to `opacity: 0.3, scale: 0.97, translateY: +10px` over 400 ms `Easing.inOut(Easing.quad)`. Haptic: `notificationSuccess` if the player won, `notificationError` if they lost.
3. 600 ms after destruction starts → **result card**.

### A2.8 Result card (`BattleResultCard.tsx` — same family as `SpinResult`/`DiscoveryCard`)

- Card: `borderRadius: RADIUS.lg`, bg `COLORS.surface`, `padding: SPACING.lg`. **Win:** border 1.5px `COLORS.accent`. **Loss:** border 1px `COLORS.border`.
- Entrance: `translateY` 40→0 + opacity 0→1, `withSpring({ damping: 16, stiffness: 180 })`.
- **Win:** title `VICTORY` — `FONT.xl` (30) weight `900`, `letterSpacing: 3`, `COLORS.accent` — with 2 expanding rings behind it (reuse the `SpinResult` `Ring` recipe verbatim: scale 0.4→2, opacity 0.8→0, 700 ms `Easing.out(Easing.quad)`, 150 ms stagger, ring color `COLORS.accent`). Sub-line (copy §A3.4) 13px `COLORS.muted`.
- **Reward chips** (XP / Lumens / Salvage): pop in staggered 90 ms, scale 0.6→1 `withSpring({ damping: 12 })`, colors matching the header pills. Consolation fights add a caption: `DAILY BONUS CLAIMED · 15%` — 11px `COLORS.muted`.
- **PvP win only:** rank row `RANK 42 → 37` — old rank `COLORS.muted` with strikethrough, arrow + new rank `COLORS.accent` weight 800; new rank slides in from +12px x-offset, 200 ms `Easing.out(Easing.cubic)`.
- **Loss:** title `DEFEAT` — same size, `COLORS.danger`, no rings, no chips. Buttons: `RETRY` (Skirmish/PvP only — never defense) + `CONTINUE`. Win: `CONTINUE` primary (bg `COLORS.primary`, text `#0B0E1A`, weight 800).

### A2.9 Level-up moment (appended inside the win card, starts ~900 ms after chips land, ~1500 ms total)

1. Card's XP bar fills the remainder → 100% over 450 ms `Easing.out(Easing.cubic)`.
2. White flash overlay on the bar, 120 ms; bar resets to the overflow fraction over 250 ms.
3. Level badge: `withSequence(withTiming(1.4, { duration: 180, easing: Easing.out(Easing.quad) }), withSpring(1, { damping: 10 }))` + 2 rings in `COLORS.primary` (same `Ring` recipe).
4. Banner slides up 12px + fades in 200 ms: `LEVEL 8` — 16px weight `900` `letterSpacing: 2` `COLORS.primary`. If a tier unlocked, second line in that tier's accent: `SKIRMISH UNLOCKED: WARLORD`.
5. `Haptics.notificationAsync(Success)`.

### A2.10 Skip behavior

- Responds in **< 100 ms**: clear the conductor's pending timeouts → `cancelAnimation` on all shared values → snap HP/shield bars, pips, and panel transforms to final precomputed state (no tween) → abbreviated destruction (single flash, 200 ms) → result card enters normally (the spring entrance always plays — the reward moment is never skipped, only the fight).
- Level-up still plays, compressed: XP fill 250 ms, no flash/reset trick, badge bounce kept.
- Skip is idempotent; tapping during the result card does nothing.

### A2.11 Performance checklist

- One Skia `Canvas`; projectiles/flashes/explosions are Skia primitives driven by shared values (`useDerivedValue`), never re-created per beat.
- Conductor JS runs per beat (≤ 3 Hz); all interpolation on the UI thread.
- Pools pre-mounted (8 damage numbers, fixed callout banner, fixed Skia shapes toggled by opacity).
- No RN shadows/elevation on Android; glows per §A0.
- Dramatic starfield variant caps twinkling stars at ~40 animated nodes.
- Verify on Pixel_9 AVD with the established adb/uiautomator flow; watch for dropped frames during the overdrive set piece (worst case: dim overlay + blur + shake concurrently).

## A3. Flavor copy (final)

### A3.1 Skirmish tiers (one rename: Veteran → **Vanguard**; the rest earn their keep)

| # | Name | Min Lv | One-liner |
|---|---|---|---|
| 1 | **Recruit** | 1 | Fresh out of the academy. Their shields are mostly paint. |
| 2 | **Scout** | 3 | Fast, curious, lightly armed. Someone has to report your victories. |
| 3 | **Corsair** | 5 | Freelance raiders flying stolen guns with something to prove. |
| 4 | **Vanguard** | 8 | Disciplined front-line crews. The first real test. |
| 5 | **Ace** | 11 | One pilot. No wasted shots. Bring your best loadout. |
| 6 | **Warlord** | 14 | A conqueror's escort fleet. They don't retreat — they regroup. |
| 7 | **Dreadnought** | 17 | A wall of legendary plating. Chip it down or be buried under it. |
| 8 | **Sovereign** | 20 | The throne fleet. Ultra-rare tech, zero mercy. |

### A3.2 AI fleet-name generator

`name = PREFIXES[seed % 12] + ' ' + SUFFIXES[Math.floor(seed / 12) % 12]` — 144 combos, derived from the daily opponent seed so the launcher preview and the replay always agree.

```ts
const PREFIXES = ['Crimson','Void','Iron','Silent','Obsidian','Rogue','Solar','Phantom','Ashen','Feral','Zenith','Hollow'];
const SUFFIXES = ['Talons','Armada','Reavers','Wardens','Syndicate','Lancers','Vultures','Legion','Pact','Swarm','Halo','Fangs'];
```

(Every pairing scans: *Crimson Talons*, *Hollow Pact*, *Solar Swarm*, *Phantom Legion*. "Vanguard" deliberately excluded from suffixes to avoid colliding with the tier name.)

### A3.3 Ability callouts (banner title / sub-line)

| Ability | Title | Sub-line | In-arena text |
|---|---|---|---|
| `phase_cannon` | `PHASE CANNON` | Shields mean nothing. | — |
| `iron_tomb` | `IRON TOMB` | The hull endures. | `BLOCKED` |
| `overdrive` | `OVERDRIVE` | Burn everything. | — |
| `echo_shell` | `ECHO SHELL` | Returned to sender. | — |

### A3.4 Result-card copy (sub-line picked by `seed % pool.length` so a given replay is stable)

**Win — title `VICTORY`, sub-line pool:**
1. Enemy fleet neutralized.
2. Not even close.
3. The void keeps what you break.
4. Another one for the log.

**Loss — title `DEFEAT`, sub-line pool:**
1. Your fleet limps home. Nothing lost but pride.
2. They were ready. Next time, so are you.
3. Refit. Rethink. Return.
4. Every ace has a first defeat. This was yours.

**Context overrides (replace the pooled sub-line):**
- PvP win: `Ranks exchanged. The climb continues.`
- PvP loss: `No rank lost. The ladder forgives — once.`
- Planetary Defense win: `The planet yields its secret.` (fragment chip uses `TIER_STYLES` colors)
- Planetary Defense loss: `The defenders keep their prize.`
- Level-up banner: `LEVEL {n}` · unlock line: `SKIRMISH UNLOCKED: {TIER NAME}`

---

# PART B — App-wide visual language, SpaceBackground, Spin overhaul

## B0. New theme tokens (`src/constants/theme.ts`)

Add to `COLORS`:

```ts
backgroundDeep: '#070912',   // gradient bottom / vignette end
surfaceRaised:  '#1B2440',   // top stop of card gradients
borderBright:   '#3A4A78',   // active/selected borders
success:        '#10B981',   // tokenizes the hardcoded green in MissionTracker
primaryGlow:    '#5EC8FF33', // halo rings / glows (20% cyan)
accentGlow:     '#FFB45433',
successGlow:    '#10B98122',
starFaint:      '#8FA3C8',
starMid:        '#C9D6F2',
starBright:     '#FFFFFF',
nebulaIndigo:   '#1B2A5E',
nebulaViolet:   '#3A1B5E',
nebulaEmber:    '#7A2E4A',
```

New export:

```ts
export const GRADIENTS = {
  screen:       ['#0B0E1A', '#070912'],
  card:         ['#1B2440', '#141A2E'],
  primaryBtn:   ['#5EC8FF', '#3D9BFF'],
  accentBtn:    ['#FFB454', '#FF8A3D'],
  reelBackdrop: ['#10162B', '#0B0E1A'],
} as const;
```

**Consistency rules (apply everywhere):** cards = vertical `GRADIENTS.card` + 1px `COLORS.border` + `RADIUS.lg`; primary CTAs = `GRADIENTS.primaryBtn` + `RADIUS.md` + text `COLORS.background`; disabled = flat `COLORS.surface` + `COLORS.border` border + `COLORS.muted` text (never opacity-faded gradients); glows = 1px `borderBright` inner + translucent `*Glow` outer ring (NOT `shadowColor` — Android elevation shadows render black).

## B1. `src/ui/common/SpaceBackground.tsx`

One absolute-fill Skia `Canvas` rendered under screen content. Screens keep `COLORS.background` on the root; the Canvas paints its own base rect so nothing flashes on mount.

**API:** `<SpaceBackground variant?: 'default' | 'battle', seed?: number, focalGlow?: { cx: number; cy: number; r: number; color: string } />` (cx/cy/r as fractions of width/height).

**Rendering strategy (the cheap part):**
- Star positions/radii generated once from `mulberry32(seed)` (deterministic, stable across remounts), memoized.
- **Static stars** recorded into a single Skia `Picture` (`createPicture`) — one replay op per frame, no React nodes per star.
- **Twinkling stars** split into exactly 2 `Group`s of `Circle`s; each group's `opacity` is one shared value driven by `withRepeat(withSequence(withTiming(...)))`. Battle drift adds 1 more shared value. **Total: ≤3 shared values, zero per-frame JS, zero re-renders.**

### B1.1 Star layers (counts at 412×915dp baseline; scale by `count = round(density × w×h / 10000)`)

| Layer | Count | Density /10k dp² | Radius (px) | Opacity | Color |
|---|---|---|---|---|---|
| A — far | 90 | 2.4 | 0.5–1.0 | 0.15–0.35 | `starFaint` #8FA3C8 |
| B — mid | 45 | 1.2 | 1.0–1.8 | 0.30–0.60 | `starMid` #C9D6F2 |
| C — near | 19 | 0.5 | 1.8–2.6 | 0.55–0.90 | `starBright` #FFFFFF, with 2 stars tinted #5EC8FF and 1 tinted #FFB454 |

### B1.2 Nebula (default variant)

Two radial-gradient circles (`RadialGradient` fill, no blur filter — the gradient falloff is the softness; blur mask filters are banned here for cost):

| Blob | Center (% of W, % of H) | Radius | Gradient stops |
|---|---|---|---|
| 1 | (18%, 12%) | 0.55 × screen W | `#1B2A5E` @ alpha 0.20 → 0.08 @ stop 0.55 → transparent @ 1.0 |
| 2 | (88%, 68%) | 0.48 × screen W | `#3A1B5E` @ alpha 0.16 → 0.06 @ stop 0.55 → transparent @ 1.0 |

### B1.3 Twinkle (default variant)

- **Who twinkles:** 100% of layer C + 30% of layer B (≈33 stars, ~21% of all). Layer A never twinkles.
- Twinklers split into two interleaved groups (alternate assignment):
  - Group 1: opacity 0.55 ↔ 1.0, period **2800 ms** (1400 up / 1400 down, `Easing.inOut(quad)`)
  - Group 2: opacity 0.55 ↔ 1.0, period **3700 ms**
- Non-synced periods prevent a visible "pulse".

### B1.4 Battle variant (`variant="battle"`, used only by BattleReplayScreen)

- **Stars +50%:** A 135 / B 68 / C 28 (densities 3.6 / 1.8 / 0.75).
- **Nebula:** blob 1 alpha 0.26, blob 2 alpha 0.22, plus **Blob 3**: center (50%, 95%), radius 0.70 × W, `#7A2E4A` @ 0.18 → transparent (ember underlight beneath the fighting ships).
- **Twinkle:** faster + deeper — periods **1600 / 2300 ms**, opacity 0.40 ↔ 1.0; 100% of C + 50% of B.
- **Drift (1 shared value):** layers B+C wrapped in a `Group` with `translateY` −8 ↔ +8 px over **14000 ms**, `Easing.inOut(quad)`, repeat-reverse. Layer A stays fixed → subtle parallax.
- **Vignette:** full-screen linear gradient rect, vertical, colors `['#070912CC', 'transparent', 'transparent', '#070912CC']` at stops `[0, 0.20, 0.80, 1]` — keeps HP bars and damage numbers legible.

**Adoption note:** every tab screen gets `<SpaceBackground />` and drops its flat `backgroundColor` from the content container — **except StarMapScreen**, which already renders its own star field (skip it there; double star fields look busted).

## B2. Spin screen prettying + landing feel

### B2.1 Backdrop

- `<SpaceBackground focalGlow={{ cx: 0.5, cy: 0.42, r: 0.55, color: '#5EC8FF12' }} />` — a dim cyan spotlight centered behind the reel.
- Replace the `Spin` H1 with a centered overline: text `DAILY SPIN`, `FONT.sm`, `letterSpacing: 4`, `fontWeight: '700'`, `color: COLORS.muted`.

### B2.2 Reel frame (fixes the >screen-width clip too)

Current `REEL_CONTAINER_WIDTH = 740px` silently overflows a 412dp screen. Replace with a full-bleed framed window:

- **Frame:** width = screen width − 2×`SPACING.md`; `borderRadius: RADIUS.lg (22)`; `borderWidth: 1`; `borderColor: COLORS.border`; `paddingVertical: SPACING.md`; background = vertical `GRADIENTS.reelBackdrop`; `overflow: 'hidden'` on the inner clip.
- **Halo ring:** absolute view inset −6 on all sides, `borderRadius: 28`, `borderWidth: 1`, `borderColor: COLORS.primaryGlow`. (Two-ring frame = cross-platform glow, no shadows.)
- **Center math:** `toOffset(i) = frameInnerWidth / 2 − CARD_WIDTH / 2 − i × CARD_STEP` (replaces the `CENTER_SLOT = 2` assumption).
- **Landing zone:** absolute centered outline — `width: CARD_WIDTH + 12 (148)`, `height: CARD_HEIGHT + 12 (180)`, `borderRadius: 18`, `borderWidth: 2`, `borderColor: '#5EC8FF55'`. On reveal, animate borderColor → `TIER_STYLES[tier].border` and backgroundColor → `TIER_STYLES[tier].glow` over 250 ms, hold 400 ms, fade back.
- **Edge fades:** two absolute 56px-wide `LinearGradient`s over the track ends, `['#0B0E1A', '#0B0E1A00']` (and mirrored), so cards materialize instead of clipping.
- **Pointer:** keep the triangle (12/12/18, `marginBottom: 20`) but recolor `borderTopColor` → `COLORS.accent` — it's a prize marker; accent is the prize color everywhere else.

### B2.3 Buttons (`SpinButtons.tsx`)

- Free Spin: `GRADIENTS.primaryBtn` (vertical), `borderRadius: RADIUS.lg`, `borderWidth: 1`, `borderColor: '#8FDBFF55'`, pressed scale 0.97 (`withTiming` 90 ms).
- Ticket: `GRADIENTS.accentBtn`, same treatment, border `'#FFD9A055'`.
- Disabled state: flat `COLORS.surface`, border `COLORS.border`, label `COLORS.muted` (replaces `opacity: 0.45` — countdown stays readable).
- Give `resultSection` a `minHeight: 160` so the reel no longer jumps when the result card appears.

### B2.4 Landing feel (replaces phase-3 pause+lurch; fakeout mechanic retired in favor of near-miss overshoot)

**Sequence:** fast scroll (linear, `FAST_MS 500` unchanged) → decel to `finalOffset + overshootPx` over **1400 ms** `Easing.out(cubic)` (`DECEL_MS` 900 → 1400; delete `PAUSE_MS`/`LURCH_MS`) → `withSpring(finalOffset, …)`.

**Randomized landing (presentation-only, prize is always the server result):** `winnerIndex = 30 + floor(rand() × 7)` (30–36) each spin, `REEL_TOTAL` stays 40 (≥3 cards remain past the winner for overshoot travel).

**Overshoot + spring (Reanimated `withSpring`):**

| Case | Probability | Overshoot (× CARD_WIDTH = 136px) | damping | stiffness | mass | Feel |
|---|---|---|---|---|---|---|
| Standard | 0.82 (0.65 if tier ≥ rare) | U(0.15, 0.40) → 20–54 px | **14** | **120** | **1.0** | ζ≈0.64 — one small counter-bounce, "chunk-settle" |
| Near-miss crawl | 0.18 (0.35 if tier ≥ rare) | U(0.50, 0.62) → 68–84 px (pointer visibly crosses onto the neighbor card) | **18** | **60** | **1.2** | ζ≈1.06 — zero bounce, agonizing slow crawl back |

Both: `restDisplacementThreshold: 0.5`, `restSpeedThreshold: 0.5` so `onDone` fires promptly.

**Haptic ticks** — `useAnimatedReaction` on `floor(-translateX / CARD_STEP)`; on slot change, `runOnJS` one call, gated by time since last crossing:

| Inter-card interval | Haptic (expo-haptics) |
|---|---|
| < 70 ms | none (Android queues and mushes them) |
| 70–140 ms | `ImpactFeedbackStyle.Soft`, every 2nd crossing |
| 140–280 ms | `ImpactFeedbackStyle.Light`, every crossing |
| > 280 ms | `ImpactFeedbackStyle.Medium`, every crossing |
| Overshoot apex (velocity sign flip) | `ImpactFeedbackStyle.Heavy`, once |
| Reveal | keep existing `notificationAsync` Success/Warning |

## B3. App-wide polish checklist

**FleetScreen** (`src/ui/fleet/FleetScreen.tsx`)
1. `<SpaceBackground />`; container backgroundColor → transparent.
2. ShipCard: `GRADIENTS.card` + 1px `COLORS.border` + `RADIUS.lg` per the card rule.
3. Auction House button → secondary style: `COLORS.surface` bg, 1px `COLORS.borderBright` border, keep primary text; add `RADIUS.md` explicitly.

**LoadoutScreen** (`src/ui/fleet/LoadoutScreen.tsx`)
1. `<SpaceBackground />`.
2. Wrap `statsRow` (RadarChart + PowerScore) in a card: `GRADIENTS.card`, 1px border, `RADIUS.lg`, `padding: SPACING.md`.
3. PowerScore number: `textShadowColor: '#5EC8FF66'`, `textShadowRadius: 8` (text-shadow works on both platforms, unlike view shadows).
4. LoadoutSlot: `borderLeftWidth: 3`, `borderLeftColor: TIER_STYLES[tier].border` on the equipped component row — tier color becomes scannable at a glance.

**MarketScreen** (`src/ui/fleet/MarketScreen.tsx`)
1. `<SpaceBackground />`.
2. `balanceChip`: add 1px border `COLORS.accentGlow` — reads as a currency token, matches the Battle header treatment.
3. `segmentActive`: `GRADIENTS.primaryBtn` instead of flat primary.
4. FAB: `GRADIENTS.primaryBtn` + an outer halo ring (absolute circle, +8px radius, bg `COLORS.primaryGlow`).

**SystemSheet** (`src/ui/exploration/SystemSheet.tsx`)
1. Sheet: `borderTopWidth: 1`, `borderTopColor: COLORS.borderBright`; body `GRADIENTS.card` vertical. Optional: `expo-blur` `BlurView` (tint `dark`, intensity 30) behind the sheet only — modals are the one place blur is allowed.
2. Danger stars: color-code — dangerLevel ≤ 3 stays `COLORS.accent`, ≥ 4 → `COLORS.danger`.
3. `dispatchBtn`: `GRADIENTS.primaryBtn`; disabled → flat surface + muted text per the disabled rule (replaces `opacity: 0.4`).

**MissionTracker** (`src/ui/exploration/MissionTracker.tsx`)
1. Replace hardcoded `'#10B981'` with `COLORS.success`.
2. Chips: add 1px `COLORS.border`; arrived chips get border `COLORS.success` + bg `COLORS.successGlow` — "Collect!" becomes visible peripherally.
3. Container `borderTopColor` → `COLORS.borderBright` (crisper separation from the map).

**Tech / Settings placeholders** (`app/(tabs)/tech.tsx`, settings route via `src/ui/Screen.tsx`)
1. `<SpaceBackground />` behind `Screen`.
2. Add a large glyph above the title (Tech: 🛰, Settings: ⚙️), `fontSize: 64`, `opacity: 0.5`.
3. "COMING SOON" pill: `RADIUS.full`, 1px `COLORS.border`, `COLORS.muted` text, `letterSpacing: 2`, `FONT.sm`.

**Performance guardrails (all screens):** one Skia Canvas per screen max; BlurView only on modal sheets, never in scrolling lists; no `shadowColor` glows (border+halo instead); all looping animation via Reanimated `withRepeat` on the UI thread — the only `runOnJS` in the whole spec is the haptic tick, capped at ~1 call per card crossing.
