# Ship Loadout & Fleet Screen — Design Spec
**Date:** 2026-06-27
**Status:** Approved

---

## Overview

Two new screens: **Ship Fleet** (tab entry point showing ship cards) and **Loadout** (per-ship component equipping). The loadout screen lets players equip components across 4 slots, see their ship's power score and archetype radar chart, and trigger fragment combining when they have enough fragments.

---

## Navigation

- Tab label: **Ship Fleet** (replaces current empty Fleet tab)
- `app/(tabs)/fleet/index.tsx` → `FleetScreen`
- `app/(tabs)/fleet/[shipId].tsx` → `LoadoutScreen`
- Existing `app/(tabs)/fleet.tsx` is deleted and replaced by the `fleet/` folder

Flow: Ship Fleet tab → ship card → stack push to LoadoutScreen for that ship.

The `[shipId]` param future-proofs multi-ship fleet management without any refactor.

---

## File Structure

```
src/ui/fleet/
  constants.ts        — slot labels, icons, ability descriptions map
  slotStyles.ts       — per-slot accent colors
  ShipCard.tsx        — card on FleetScreen
  RadarChart.tsx      — SVG spider chart (4 axes)
  PowerScore.tsx      — numeric power display
  LoadoutSlot.tsx     — slot row + inline expand/collapse picker
  ComponentCard.tsx   — single component option in the picker
  LoadoutScreen.tsx   — assembles the full loadout view
  FleetScreen.tsx     — ship card list
  index.ts            — barrel export

app/(tabs)/fleet/
  index.tsx           — thin route → FleetScreen
  [shipId].tsx        — thin route → LoadoutScreen
```

Tests sit alongside source: `slotStyles.test.ts`, `LoadoutSlot.test.ts`, `RadarChart.test.ts`, `PowerScore.test.ts`.

---

## Slot Styles

Each slot has its own accent color to make the 4 slots visually distinct:

| Slot | Accent |
|------|--------|
| Hull | Orange |
| Weapons | Red |
| Shields | Blue |
| Engine | Green |

Reuses `TIER_STYLES` from `src/ui/spin/tierStyles.ts` for component tier badge colors.

---

## FleetScreen

- Dark background (`COLORS.background`), "Ship Fleet" title
- One ship card for now: ship name, a one-line summary of equipped tiers (e.g. "Rare · Uncommon · Common · Rare"), chevron →
- Tapping card pushes `LoadoutScreen` with `shipId`
- When multi-ship exists, the list grows — no structural changes needed

---

## LoadoutScreen

### Loading State
While `fetchShip()` is in flight: animated spinning planet with rings (branded, on-theme). Centered on screen.

### Error State
If `fetchShip()` fails: error message + "Retry" button. Tapping retry calls `fetchShip()` again.

### Top Section — Stats
**RadarChart**
- SVG spider/radar chart with 4 axes: Hull, Weapons, Shields, Engine
- Each axis value = `equippedComponents[slot]?.statMultiplier ?? 0`
- Rendered normalized against 2.5 for visual polygon sizing
- Axis labels show the raw multiplier value
- Filled polygon: `COLORS.primary` at 40% opacity, solid stroke
- Unequipped slot = 0 on that axis (flat on the chart)

**PowerScore**
- Displayed below/beside the chart
- Formula: `sum of equippedComponents[slot].statMultiplier` for all 4 slots
- Unequipped slot contributes 0
- Display: "Power: 6.2 / 10.0" (max = 4 × 2.5 = 10.0)
- Updates live on every equip action via store subscription

### Bottom Section — Slot Rows (×4)

**Collapsed state (default):**
- Slot icon + label (e.g. 🛡 Shields)
- Tier badge + stat multiplier ("Rare · 1.7×")
- Ultra-Rare ability name if applicable (e.g. "Phase Cannon")
- "None equipped" in muted text if slot is empty
- Chevron rotates 90° on expand

**Expanded state (inline, below the row):**
- Vertically scrollable list of `ComponentCard` for all owned components matching this slot
- Sorted: tier descending (ultra_rare → legendary → rare → uncommon → common)
- Currently equipped component has a colored border highlight

**Fragment combine alert:**
- Fires *before* the picker opens, if `fragmentCounts[slot] >= 3`
- Alert text: "You have N [slot] fragments — combine into an Uncommon component?"
- Yes → calls `combineFragmentsForSlot(slot)`, new component appears in picker list, picker opens
- No → picker opens normally

**Empty picker state:**
- "No other components for this slot yet. Try spinning!"

---

## ComponentCard

Shown inside an expanded slot picker. Full detail:

| Field | Display |
|-------|---------|
| Tier | Colored tier badge (reuses `TIER_STYLES`) |
| Stat multiplier | "1.7×" |
| Ability name | Only for ultra_rare (e.g. "Phase Cannon") |
| Ability description | Only for ultra_rare (e.g. "20% chance per shot to bypass shields entirely") |
| Equip button | Disabled + highlighted if already equipped |

---

## Ability Descriptions Map (`constants.ts`)

```
iron_tomb    → "Blocks the first opponent ability proc per battle, then becomes neutral."
phase_cannon → "20% chance per shot to bypass shields entirely."
overdrive    → "Sacrifice 10% own HP at battle start for 1.5× burst damage."
echo_shell   → "Reflects 15% damage back to attacker, maximum 2 times per battle."
```

---

## Data Flow

**On mount:**
- `LoadoutScreen` calls `fetchShip()` once
- Populates `equippedComponents`, `ownedComponents`, `fragmentCounts` in `useShipStore`

**Equip flow:**
1. User taps "Equip" on a `ComponentCard`
2. `equipComponent(component)` — optimistic local update, then persists to Supabase
3. Radar chart and power score update instantly via store subscription
4. Slot collapses after successful equip

**Fragment combine flow:**
1. Slot tapped, `fragmentCounts[slot] >= 3` → Alert
2. Yes → `combineFragmentsForSlot(slot)` → `ownedComponents` gains new component, `fragmentCounts[slot]` decrements
3. Picker opens with new component in list
4. No → picker opens, no combine

**No new Supabase calls needed** beyond what `useShipStore` already handles. Screen is a pure consumer of the store.

---

## Power Score Formula

```
score = hull.statMultiplier + weapons.statMultiplier + shields.statMultiplier + engine.statMultiplier
max   = 10.0  (4 × 2.5, all Ultra-Rare)
min   = 4.0   (4 × 1.0, all Common)
unequipped slot = 0 (pulls score below 4.0)
```

---

## Radar Chart Normalization

```
axisValue[slot] = equippedComponents[slot]?.statMultiplier ?? 0
visualRadius[slot] = axisValue[slot] / 2.5  // 0.0 → 1.0
```

Common build → uniform 0.4 polygon (small square). Full Ultra-Rare → full 1.0 polygon. Mixed builds show the archetype visually (e.g. high weapons + engine, low hull + shields = "glass cannon").

---

## Tests

| File | What it covers |
|------|---------------|
| `slotStyles.test.ts` | All 4 slots have defined accent colors, no undefined entries |
| `LoadoutSlot.test.ts` | Expand/collapse toggle; combine alert fires at ≥3 fragments, not at 2 |
| `RadarChart.test.ts` | Axis normalization (Common → 0.4, Ultra-Rare → 1.0, unequipped → 0) |
| `PowerScore.test.ts` | Sum formula correct; max = 10.0; unequipped slots contribute 0 |

No render/snapshot tests — consistent with spin UI test pattern.

---

## Out of Scope (this screen)

- Multi-ship management (future — `[shipId]` route is ready)
- Selling / trading components (Auction House screen)
- Blueprint unlocks
- Combat preview / simulated battle
