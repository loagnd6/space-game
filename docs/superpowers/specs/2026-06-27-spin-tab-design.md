# Spin Tab — Design Spec
**Date:** 2026-06-27  
**Status:** Approved

---

## Overview

A new "Spin" tab added to the main tab bar (between Fleet and Tech). Players spin a horizontal scrolling reel to win loot. Two spin types: **Free** (daily cooldown) and **Ticket** (consumes a `spin_ticket` inventory item). The winning item is determined server-side before animation begins; the animation is pure theatre — a choreographed fake-out that makes the outcome feel uncertain.

---

## Tab Bar Change

File: `app/(tabs)/_layout.tsx`  
Add `spin` between `fleet` and `tech`. Icon: `gift` (Ionicons).

New tab file: `app/(tabs)/spin.tsx` — thin screen that imports from `src/ui/spin/`.

---

## Screen Layout (top → bottom)

```
┌─────────────────────────────────────┐
│  SPIN                               │  ← header
├─────────────────────────────────────┤
│         ▼  (center pointer)         │
│  [card][card][CARD][card][card]     │  ← reel (clips to ~5 visible)
├─────────────────────────────────────┤
│  Last result: [icon] [name] [tier]  │  ← result area (empty on first load)
├─────────────────────────────────────┤
│  [🎯 Free Spin]   [🎫 Use Ticket]  │  ← spin buttons
└─────────────────────────────────────┘
```

- Reel clips via `overflow: hidden` on a fixed-width container
- Center card slot is highlighted by a fixed arrow/pointer above the reel
- Result area is hidden until the first spin of the session completes

---

## Reel Card Design

Each card renders:
- **Item icon** — mapped from `itemType` (static asset or emoji fallback)
- **Item name** — human-readable label (e.g. "Rare Hull Component", "500 Ore")
- **Key stat** — one line from `itemData` (e.g. "slot: hull", "×3 boost")
- **Tier border color:**

| Tier | Color |
|------|-------|
| common | `#9E9E9E` (grey) |
| uncommon | `#4CAF50` (green) |
| rare | `#2196F3` (blue) |
| legendary | `#FF9800` (orange/gold) |
| ultra_rare | `#9C27B0` (purple) |

- **Legendary / ultra_rare only:** pulsing outer glow (`Animated` opacity loop, 0.4→1.0→0.4 over 1s) + shimmer overlay (animated gradient sweep across the card)

---

## Reel Data

The reel is a flat array of ~40 `LootItem` objects:
- Generated client-side from a **visual seed** (unrelated to the real result seed)
- Weighted to feel realistic: ~60% common, ~25% uncommon, ~12% rare, ~3% legendary/ultra_rare
- The **real winning card is injected at a predetermined index** (e.g. index 34 of 40) before animation starts
- This index is constant — only the surrounding filler cards vary per spin

The reel array is wide enough that early cards scroll off-screen before the player can count positions.

---

## Animation Sequence

Driven by a single `Animated.Value` (`scrollX`) representing the horizontal pixel offset of the reel.

All timings are approximate; tuning is expected during implementation.

| Phase | Duration | Easing | Description |
|-------|----------|--------|-------------|
| Fast scroll | 500ms | linear | Items blur past at high speed |
| Decelerate | 600ms | ease-out | Slows toward fake-out index (winning index − 1) |
| Fake-out pause | 150ms | none | Holds briefly so player thinks it landed on wrong card |
| Final lurch | 300ms | ease-in-out | Springs forward one card to true landing index |
| Settle | — | — | Reel stops; center card scales to 1.05×; result area fades in |

**Total animation: ~1.55 seconds.**

The fake-out only activates when the winning item is NOT common (no point teasing a common). For common results, phases 3+4 are skipped and it decelerates directly to the landing index.

---

## Spin Buttons

**Free Spin button:**
- Active when `freeSpinAvailableAt` is in the past (or null)
- Disabled + shows countdown timer (`HH:MM:SS`) when cooldown is active
- Calls `useSpinStore.spin('free')`

**Use Ticket button:**
- Active when player has ≥1 `spin_ticket` in inventory
- Greyed out with "No tickets" label when count is 0
- Calls `useSpinStore.spin('ticket')`
- Ticket count sourced from inventory store (to be wired up; placeholder count for now)

Both buttons disabled while `isSpinning === true`.

---

## Result Area

After animation settles, a result row fades in below the reel showing:
- Item icon
- Item name  
- Tier badge (colored pill matching tier color table above)

This persists until the next spin starts, then fades out as the new animation begins.

---

## Components

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `SpinScreen` | `src/ui/spin/SpinScreen.tsx` | Root screen, composes all below |
| `SpinReel` | `src/ui/spin/SpinReel.tsx` | Animated reel, owns `scrollX` Animated.Value |
| `ReelCard` | `src/ui/spin/ReelCard.tsx` | Single card; tier glow/shimmer logic |
| `SpinButtons` | `src/ui/spin/SpinButtons.tsx` | Free + Ticket buttons + cooldown timer |
| `SpinResult` | `src/ui/spin/SpinResult.tsx` | Last-result display row |
| `buildReelData` | `src/ui/spin/reelData.ts` | Generates the ~40-card filler array + injects winner |
| `TIER_STYLES` | `src/ui/spin/tierStyles.ts` | Color + glow config keyed by `LootTier` |

`app/(tabs)/spin.tsx` imports and renders `SpinScreen` only — no logic in the route file.

---

## Data Flow

```
SpinScreen
  → onSpin(spinType)
      → useSpinStore.spin(spinType)          // hits Edge Function, returns SpinResult
      → buildReelData(result)                // inject winner at index 34
      → SpinReel.startAnimation(reelData)    // play fake-out sequence
      → onAnimationComplete()
          → SpinResult fades in with result
          → useSpinStore.fetchSpinState()    // refresh cooldown/ticket state
```

The `SpinResult` from the Edge Function is available before animation starts. The animation duration (~1.55s) is the only delay between server response and UI reveal.

---

## Error Handling

- Network error during spin: `isSpinning` resets, buttons re-enable, brief error toast below result area ("Spin failed — try again")
- Cooldown still active (clock drift): server returns error, button shows updated countdown
- No special handling for animation interruption — buttons are disabled for the full animation duration

---

## Out of Scope

- Spin history / log screen
- Ticket purchase flow (buying tickets is handled elsewhere)
- Sound effects (can be layered in later)
- Haptics (can be layered in later)
