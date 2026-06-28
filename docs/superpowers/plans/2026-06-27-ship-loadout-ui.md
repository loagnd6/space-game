# Ship Loadout & Fleet Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a "Ship Fleet" tab with a ship card list and a stack-pushed LoadoutScreen where players equip hull/weapons/shields/engine components, see a radar chart archetype, and can trigger fragment combining.

**Architecture:** Expo Router stack navigation — `app/(tabs)/fleet/index.tsx` (FleetScreen) pushes `app/(tabs)/fleet/[shipId].tsx` (LoadoutScreen). All UI lives in `src/ui/fleet/`. Pure logic is extracted to `.ts` files tested with Jest; components are `.tsx` with no render tests (consistent with Spin UI pattern). The screen is a pure consumer of the existing `useShipStore` — no new Supabase calls.

**Tech Stack:** React Native, Expo Router, Zustand (`useShipStore`), `@shopify/react-native-skia` (radar chart), `react-native-reanimated` (planet loader animation), existing `TIER_STYLES` from `src/ui/spin/tierStyles.ts`.

## Global Constraints

- TypeScript strict mode — no `any`, no implicit types
- No new npm packages — Skia and Reanimated are already installed
- Reuse `FRAGMENT_COMBINE_COUNT` from `src/constants/game.ts` (= 3) — do not duplicate
- Reuse `COMPONENT_STAT_MULTIPLIERS` from `src/constants/game.ts` for max multiplier (2.5)
- Reuse `TIER_STYLES` from `src/ui/spin/tierStyles.ts` for tier badge colors
- No game logic on UI thread — `equipComponent` and `combineFragmentsForSlot` are async store calls, fire and forget with local state update
- All lint + type-check must pass after each task: `npm run lint && npx tsc --noEmit`
- Commit after each task

---

## File Map

**Create:**
```
src/ui/fleet/constants.ts
src/ui/fleet/slotStyles.ts
src/ui/fleet/slotStyles.test.ts
src/ui/fleet/radarChart.ts
src/ui/fleet/radarChart.test.ts
src/ui/fleet/RadarChart.tsx
src/ui/fleet/powerScore.ts
src/ui/fleet/powerScore.test.ts
src/ui/fleet/PowerScore.tsx
src/ui/fleet/ComponentCard.tsx
src/ui/fleet/loadoutSlot.ts
src/ui/fleet/loadoutSlot.test.ts
src/ui/fleet/LoadoutSlot.tsx
src/ui/fleet/ShipCard.tsx
src/ui/fleet/FleetScreen.tsx
src/ui/fleet/PlanetLoader.tsx
src/ui/fleet/LoadoutScreen.tsx
src/ui/fleet/index.ts
app/(tabs)/fleet/index.tsx
app/(tabs)/fleet/[shipId].tsx
```

**Modify:**
```
src/ui/index.ts               — add fleet barrel export
app/(tabs)/_layout.tsx        — rename "Fleet" → "Ship Fleet"
```

**Delete:**
```
app/(tabs)/fleet.tsx          — replaced by app/(tabs)/fleet/ folder
```

---

## Task 1: Constants & Slot Styles

**Files:**
- Create: `src/ui/fleet/constants.ts`
- Create: `src/ui/fleet/slotStyles.ts`
- Create: `src/ui/fleet/slotStyles.test.ts`

**Interfaces:**
- Produces: `SLOT_ORDER`, `SLOT_LABELS`, `SLOT_ICONS`, `ABILITY_NAMES`, `ABILITY_DESCRIPTIONS` (used by Tasks 2–7); `SLOT_STYLES`, `SlotStyle` (used by Tasks 5–7)

---

- [ ] **Step 1: Write the failing test**

`src/ui/fleet/slotStyles.test.ts`:
```typescript
import { SLOT_STYLES } from './slotStyles';

const SLOTS = ['hull', 'weapons', 'shields', 'engine'] as const;

describe('SLOT_STYLES', () => {
  it.each(SLOTS)('%s has a defined accent and accentFaded color', (slot) => {
    expect(SLOT_STYLES[slot].accent).toBeDefined();
    expect(SLOT_STYLES[slot].accentFaded).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx jest src/ui/fleet/slotStyles.test.ts --no-coverage
```
Expected: Cannot find module `'./slotStyles'`

- [ ] **Step 3: Create `src/ui/fleet/constants.ts`**

```typescript
import type { ComponentSlot, UltraRareAbility } from '@/src/game/ships/types';

export const SLOT_ORDER: ComponentSlot[] = ['hull', 'weapons', 'shields', 'engine'];

export const SLOT_LABELS: Record<ComponentSlot, string> = {
  hull:    'Hull',
  weapons: 'Weapons',
  shields: 'Shields',
  engine:  'Engine',
};

export const SLOT_ICONS: Record<ComponentSlot, string> = {
  hull:    '🛸',
  weapons: '⚡',
  shields: '🛡',
  engine:  '🔥',
};

export const ABILITY_NAMES: Record<UltraRareAbility, string> = {
  iron_tomb:    'Iron Tomb',
  phase_cannon: 'Phase Cannon',
  overdrive:    'Overdrive',
  echo_shell:   'Echo Shell',
};

export const ABILITY_DESCRIPTIONS: Record<UltraRareAbility, string> = {
  iron_tomb:    'Blocks the first opponent ability proc per battle, then becomes neutral.',
  phase_cannon: '20% chance per shot to bypass shields entirely.',
  overdrive:    'Sacrifice 10% own HP at battle start for 1.5× burst damage.',
  echo_shell:   'Reflects 15% damage back to attacker, maximum 2 times per battle.',
};
```

- [ ] **Step 4: Create `src/ui/fleet/slotStyles.ts`**

```typescript
import type { ComponentSlot } from '@/src/game/ships/types';

export interface SlotStyle {
  accent: string;
  accentFaded: string;
}

export const SLOT_STYLES: Record<ComponentSlot, SlotStyle> = {
  hull:    { accent: '#FF9800', accentFaded: '#FF980030' },
  weapons: { accent: '#FF5E7A', accentFaded: '#FF5E7A30' },
  shields: { accent: '#5EC8FF', accentFaded: '#5EC8FF30' },
  engine:  { accent: '#4CAF50', accentFaded: '#4CAF5030' },
};
```

- [ ] **Step 5: Run test — expect PASS**

```bash
npx jest src/ui/fleet/slotStyles.test.ts --no-coverage
```
Expected: 4 tests pass

- [ ] **Step 6: Lint + type-check**

```bash
npm run lint && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add src/ui/fleet/constants.ts src/ui/fleet/slotStyles.ts src/ui/fleet/slotStyles.test.ts
git commit -m "feat: add fleet UI constants and slot styles"
```

---

## Task 2: Radar Chart Logic + Component

**Files:**
- Create: `src/ui/fleet/radarChart.ts`
- Create: `src/ui/fleet/radarChart.test.ts`
- Create: `src/ui/fleet/RadarChart.tsx`

**Interfaces:**
- Consumes: `SLOT_ORDER` from `./constants`; `COMPONENT_STAT_MULTIPLIERS` from `@/src/constants/game`; `ShipComponent`, `ComponentSlot` from `@/src/game/ships/types`; `COLORS` from `@/src/constants/theme`
- Produces: `normalizeAxis(statMultiplier: number): number`; `RadarChart` component with prop `equipped: Record<ComponentSlot, ShipComponent | null>`

---

- [ ] **Step 1: Write failing tests**

`src/ui/fleet/radarChart.test.ts`:
```typescript
import { normalizeAxis } from './radarChart';

describe('normalizeAxis', () => {
  it('returns 0.4 for Common (1.0×)', () => {
    expect(normalizeAxis(1.0)).toBeCloseTo(0.4);
  });

  it('returns 1.0 for Ultra-Rare (2.5×)', () => {
    expect(normalizeAxis(2.5)).toBeCloseTo(1.0);
  });

  it('returns 0 for unequipped (0)', () => {
    expect(normalizeAxis(0)).toBe(0);
  });

  it('returns intermediate value for Rare (1.7×)', () => {
    expect(normalizeAxis(1.7)).toBeCloseTo(0.68);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx jest src/ui/fleet/radarChart.test.ts --no-coverage
```
Expected: Cannot find module `'./radarChart'`

- [ ] **Step 3: Create `src/ui/fleet/radarChart.ts`**

```typescript
import { COMPONENT_STAT_MULTIPLIERS } from '@/src/constants/game';

const MAX_MULTIPLIER = COMPONENT_STAT_MULTIPLIERS.ultra_rare; // 2.5

export function normalizeAxis(statMultiplier: number): number {
  return statMultiplier / MAX_MULTIPLIER;
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npx jest src/ui/fleet/radarChart.test.ts --no-coverage
```
Expected: 4 tests pass

- [ ] **Step 5: Create `src/ui/fleet/RadarChart.tsx`**

```tsx
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { COLORS, FONT } from '@/src/constants/theme';
import type { ComponentSlot, ShipComponent } from '@/src/game/ships/types';
import { SLOT_ORDER, SLOT_LABELS, SLOT_ICONS } from './constants';
import { normalizeAxis } from './radarChart';

const SIZE = 200;
const CX = SIZE / 2;
const CY = SIZE / 2;
const RADAR_RADIUS = 65;
// Hull=top, Weapons=right, Shields=bottom, Engine=left
const ANGLES = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];

interface Props {
  equipped: Record<ComponentSlot, ShipComponent | null>;
}

export function RadarChart({ equipped }: Props) {
  const fillPath = useMemo(() => {
    const path = Skia.Path.Make();
    SLOT_ORDER.forEach((slot, i) => {
      const r = normalizeAxis(equipped[slot]?.statMultiplier ?? 0) * RADAR_RADIUS;
      const x = CX + r * Math.cos(ANGLES[i]);
      const y = CY + r * Math.sin(ANGLES[i]);
      if (i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    });
    path.close();
    return path;
  }, [equipped]);

  const gridPath = useMemo(() => {
    const path = Skia.Path.Make();
    [0.25, 0.5, 0.75, 1.0].forEach(t => {
      path.addCircle(CX, CY, t * RADAR_RADIUS);
    });
    return path;
  }, []);

  const axisPath = useMemo(() => {
    const path = Skia.Path.Make();
    ANGLES.forEach(angle => {
      path.moveTo(CX, CY);
      path.lineTo(CX + RADAR_RADIUS * Math.cos(angle), CY + RADAR_RADIUS * Math.sin(angle));
    });
    return path;
  }, []);

  return (
    <View style={styles.wrapper}>
      {/* Top label: Hull */}
      <Text style={[styles.axisLabel, styles.labelTop]}>
        {SLOT_ICONS.hull} {SLOT_LABELS.hull}
      </Text>

      <View style={styles.chartRow}>
        {/* Left label: Engine */}
        <Text style={[styles.axisLabel, styles.labelSide]}>
          {SLOT_ICONS.engine}{'\n'}{SLOT_LABELS.engine}
        </Text>

        <Canvas style={styles.canvas}>
          <Path path={gridPath} color={COLORS.border} style="stroke" strokeWidth={1} />
          <Path path={axisPath} color={COLORS.border} style="stroke" strokeWidth={1} />
          <Path path={fillPath} color="rgba(94, 200, 255, 0.25)" style="fill" />
          <Path path={fillPath} color={COLORS.primary} style="stroke" strokeWidth={2} />
        </Canvas>

        {/* Right label: Weapons */}
        <Text style={[styles.axisLabel, styles.labelSide]}>
          {SLOT_ICONS.weapons}{'\n'}{SLOT_LABELS.weapons}
        </Text>
      </View>

      {/* Bottom label: Shields */}
      <Text style={[styles.axisLabel, styles.labelBottom]}>
        {SLOT_ICONS.shields} {SLOT_LABELS.shields}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper:    { alignItems: 'center' },
  chartRow:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  canvas:     { width: SIZE, height: SIZE },
  axisLabel:  { color: COLORS.muted, fontSize: FONT.sm, textAlign: 'center' },
  labelTop:   { marginBottom: 2 },
  labelBottom:{ marginTop: 2 },
  labelSide:  { width: 56 },
});
```

- [ ] **Step 6: Lint + type-check**

```bash
npm run lint && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add src/ui/fleet/radarChart.ts src/ui/fleet/radarChart.test.ts src/ui/fleet/RadarChart.tsx
git commit -m "feat: add radar chart logic and Skia component"
```

---

## Task 3: Power Score Logic + Component

**Files:**
- Create: `src/ui/fleet/powerScore.ts`
- Create: `src/ui/fleet/powerScore.test.ts`
- Create: `src/ui/fleet/PowerScore.tsx`

**Interfaces:**
- Consumes: `SLOT_ORDER` from `./constants`; `COMPONENT_STAT_MULTIPLIERS` from `@/src/constants/game`; `ComponentSlot`, `ShipComponent` from `@/src/game/ships/types`
- Produces: `calcPowerScore(equipped: Record<ComponentSlot, ShipComponent | null>): number`; `MAX_POWER_SCORE: number`; `PowerScore` component with prop `score: number`

---

- [ ] **Step 1: Write failing tests**

`src/ui/fleet/powerScore.test.ts`:
```typescript
import { calcPowerScore, MAX_POWER_SCORE } from './powerScore';
import type { ShipComponent, ComponentSlot } from '@/src/game/ships/types';

function makeComponent(slot: ComponentSlot, statMultiplier: number): ShipComponent {
  return { id: 'test', slot, tier: 'common', statMultiplier };
}

const empty = { hull: null, weapons: null, shields: null, engine: null };

describe('calcPowerScore', () => {
  it('returns 0 when all slots are unequipped', () => {
    expect(calcPowerScore(empty)).toBe(0);
  });

  it('returns sum of all multipliers', () => {
    expect(calcPowerScore({
      hull:    makeComponent('hull', 1.0),
      weapons: makeComponent('weapons', 1.7),
      shields: makeComponent('shields', 2.2),
      engine:  makeComponent('engine', 2.5),
    })).toBeCloseTo(7.4);
  });

  it('handles partial loadout (3 empty slots)', () => {
    expect(calcPowerScore({ ...empty, hull: makeComponent('hull', 2.5) })).toBe(2.5);
  });

  it('MAX_POWER_SCORE equals 10.0', () => {
    expect(MAX_POWER_SCORE).toBeCloseTo(10.0);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx jest src/ui/fleet/powerScore.test.ts --no-coverage
```
Expected: Cannot find module `'./powerScore'`

- [ ] **Step 3: Create `src/ui/fleet/powerScore.ts`**

```typescript
import { COMPONENT_STAT_MULTIPLIERS } from '@/src/constants/game';
import type { ComponentSlot, ShipComponent } from '@/src/game/ships/types';
import { SLOT_ORDER } from './constants';

export const MAX_POWER_SCORE = 4 * COMPONENT_STAT_MULTIPLIERS.ultra_rare; // 10.0

export function calcPowerScore(equipped: Record<ComponentSlot, ShipComponent | null>): number {
  return SLOT_ORDER.reduce((sum, slot) => sum + (equipped[slot]?.statMultiplier ?? 0), 0);
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npx jest src/ui/fleet/powerScore.test.ts --no-coverage
```
Expected: 4 tests pass

- [ ] **Step 5: Create `src/ui/fleet/PowerScore.tsx`**

```tsx
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, FONT, SPACING } from '@/src/constants/theme';
import { MAX_POWER_SCORE } from './powerScore';

interface Props {
  score: number;
}

export function PowerScore({ score }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Power</Text>
      <Text style={styles.score}>{score.toFixed(1)}</Text>
      <Text style={styles.max}>/ {MAX_POWER_SCORE.toFixed(1)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: SPACING.xs },
  label:     { color: COLORS.muted, fontSize: FONT.sm, fontWeight: '600', letterSpacing: 1 },
  score:     { color: COLORS.primary, fontSize: FONT.xl, fontWeight: '700' },
  max:       { color: COLORS.muted, fontSize: FONT.sm },
});
```

- [ ] **Step 6: Lint + type-check**

```bash
npm run lint && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add src/ui/fleet/powerScore.ts src/ui/fleet/powerScore.test.ts src/ui/fleet/PowerScore.tsx
git commit -m "feat: add power score logic and display component"
```

---

## Task 4: ComponentCard

**Files:**
- Create: `src/ui/fleet/ComponentCard.tsx`

**Interfaces:**
- Consumes: `TIER_STYLES` from `@/src/ui/spin/tierStyles`; `ABILITY_NAMES`, `ABILITY_DESCRIPTIONS` from `./constants`; `ShipComponent` from `@/src/game/ships/types`
- Produces: `ComponentCard` component with props `{ component: ShipComponent; isEquipped: boolean; onEquip: (c: ShipComponent) => void }`

---

- [ ] **Step 1: Create `src/ui/fleet/ComponentCard.tsx`**

```tsx
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, FONT, RADIUS, SPACING } from '@/src/constants/theme';
import { TIER_STYLES } from '@/src/ui/spin/tierStyles';
import { ABILITY_NAMES, ABILITY_DESCRIPTIONS } from './constants';
import type { ShipComponent } from '@/src/game/ships/types';

interface Props {
  component: ShipComponent;
  isEquipped: boolean;
  onEquip: (component: ShipComponent) => void;
}

export function ComponentCard({ component, isEquipped, onEquip }: Props) {
  const tier = TIER_STYLES[component.tier];

  return (
    <View style={[styles.card, isEquipped && { borderColor: tier.border, borderWidth: 2 }]}>
      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: tier.glow }]}>
          <Text style={[styles.badgeText, { color: tier.border }]}>{tier.label}</Text>
        </View>
        <Text style={styles.multiplier}>{component.statMultiplier}×</Text>
      </View>

      {component.ability ? (
        <View style={styles.abilitySection}>
          <Text style={styles.abilityName}>{ABILITY_NAMES[component.ability]}</Text>
          <Text style={styles.abilityDesc}>{ABILITY_DESCRIPTIONS[component.ability]}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.button, isEquipped && styles.buttonEquipped]}
        onPress={() => onEquip(component)}
        disabled={isEquipped}
        accessibilityRole="button"
        accessibilityLabel={isEquipped ? 'Already equipped' : `Equip ${tier.label} component`}
      >
        <Text style={[styles.buttonText, isEquipped && styles.buttonTextEquipped]}>
          {isEquipped ? 'Equipped' : 'Equip'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.sm,
    minWidth: 160,
  },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge:        { borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 2 },
  badgeText:    { fontSize: 11, fontWeight: '700' },
  multiplier:   { color: COLORS.text, fontSize: FONT.md, fontWeight: '700' },
  abilitySection: { gap: 2 },
  abilityName:  { color: COLORS.accent, fontSize: FONT.sm, fontWeight: '600' },
  abilityDesc:  { color: COLORS.muted, fontSize: 12, lineHeight: 16 },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.xs,
    alignItems: 'center',
  },
  buttonEquipped:     { backgroundColor: COLORS.border },
  buttonText:         { color: COLORS.background, fontSize: FONT.sm, fontWeight: '700' },
  buttonTextEquipped: { color: COLORS.muted },
});
```

- [ ] **Step 2: Lint + type-check**

```bash
npm run lint && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/ui/fleet/ComponentCard.tsx
git commit -m "feat: add ComponentCard with full tier and ability detail"
```

---

## Task 5: Loadout Slot Logic + Component

**Files:**
- Create: `src/ui/fleet/loadoutSlot.ts`
- Create: `src/ui/fleet/loadoutSlot.test.ts`
- Create: `src/ui/fleet/LoadoutSlot.tsx`

**Interfaces:**
- Consumes: `FRAGMENT_COMBINE_COUNT` from `@/src/constants/game`; `SLOT_LABELS`, `SLOT_ICONS`, `SLOT_ORDER` from `./constants`; `SLOT_STYLES` from `./slotStyles`; `ComponentCard` from `./ComponentCard`; `ShipComponent`, `ComponentSlot`, `ComponentTier` from `@/src/game/ships/types`
- Produces: `shouldPromptCombine(fragmentCount: number): boolean`; `sortByTier(components: ShipComponent[]): ShipComponent[]`; `LoadoutSlot` component

---

- [ ] **Step 1: Write failing tests**

`src/ui/fleet/loadoutSlot.test.ts`:
```typescript
import { shouldPromptCombine, sortByTier } from './loadoutSlot';
import type { ShipComponent, ComponentTier } from '@/src/game/ships/types';

function makeComponent(tier: ComponentTier): ShipComponent {
  return { id: tier, slot: 'hull', tier, statMultiplier: 1.0 };
}

describe('shouldPromptCombine', () => {
  it('returns false for fewer than 3 fragments', () => {
    expect(shouldPromptCombine(0)).toBe(false);
    expect(shouldPromptCombine(2)).toBe(false);
  });

  it('returns true at exactly 3 fragments', () => {
    expect(shouldPromptCombine(3)).toBe(true);
  });

  it('returns true for more than 3 fragments', () => {
    expect(shouldPromptCombine(10)).toBe(true);
  });
});

describe('sortByTier', () => {
  it('sorts ultra_rare before common', () => {
    const components = [makeComponent('common'), makeComponent('ultra_rare')];
    const sorted = sortByTier(components);
    expect(sorted[0].tier).toBe('ultra_rare');
    expect(sorted[1].tier).toBe('common');
  });

  it('preserves full tier order: ultra_rare > legendary > rare > uncommon > common', () => {
    const input: ComponentTier[] = ['common', 'rare', 'ultra_rare', 'uncommon', 'legendary'];
    const sorted = sortByTier(input.map(makeComponent));
    expect(sorted.map(c => c.tier)).toEqual([
      'ultra_rare', 'legendary', 'rare', 'uncommon', 'common',
    ]);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx jest src/ui/fleet/loadoutSlot.test.ts --no-coverage
```
Expected: Cannot find module `'./loadoutSlot'`

- [ ] **Step 3: Create `src/ui/fleet/loadoutSlot.ts`**

```typescript
import { FRAGMENT_COMBINE_COUNT } from '@/src/constants/game';
import type { ShipComponent, ComponentTier } from '@/src/game/ships/types';

export function shouldPromptCombine(fragmentCount: number): boolean {
  return fragmentCount >= FRAGMENT_COMBINE_COUNT;
}

const TIER_ORDER: ComponentTier[] = ['ultra_rare', 'legendary', 'rare', 'uncommon', 'common'];

export function sortByTier(components: ShipComponent[]): ShipComponent[] {
  return [...components].sort(
    (a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier),
  );
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npx jest src/ui/fleet/loadoutSlot.test.ts --no-coverage
```
Expected: 5 tests pass

- [ ] **Step 5: Create `src/ui/fleet/LoadoutSlot.tsx`**

```tsx
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, FONT, RADIUS, SPACING } from '@/src/constants/theme';
import { FRAGMENT_COMBINE_COUNT } from '@/src/constants/game';
import type { ComponentSlot, ShipComponent } from '@/src/game/ships/types';
import { SLOT_LABELS, SLOT_ICONS } from './constants';
import { SLOT_STYLES } from './slotStyles';
import { TIER_STYLES } from '@/src/ui/spin/tierStyles';
import { ComponentCard } from './ComponentCard';
import { shouldPromptCombine, sortByTier } from './loadoutSlot';

interface Props {
  slot: ComponentSlot;
  equippedComponent: ShipComponent | null;
  ownedComponents: ShipComponent[];
  fragmentCount: number;
  onEquip: (component: ShipComponent) => Promise<void>;
  onCombine: () => Promise<ShipComponent | null>;
}

export function LoadoutSlot({
  slot, equippedComponent, ownedComponents, fragmentCount, onEquip, onCombine,
}: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const slotStyle = SLOT_STYLES[slot];
  const equippedTier = equippedComponent ? TIER_STYLES[equippedComponent.tier] : null;

  function openPicker() {
    if (shouldPromptCombine(fragmentCount)) {
      Alert.alert(
        'Combine Fragments',
        `You have ${fragmentCount} ${SLOT_LABELS[slot]} fragments — combine into an Uncommon component?`,
        [
          { text: 'No', style: 'cancel', onPress: () => setIsExpanded(e => !e) },
          {
            text: 'Yes',
            onPress: async () => {
              await onCombine();
              setIsExpanded(true);
            },
          },
        ],
      );
    } else {
      setIsExpanded(e => !e);
    }
  }

  async function handleEquip(component: ShipComponent) {
    await onEquip(component);
    setIsExpanded(false);
  }

  const sortedComponents = sortByTier(ownedComponents);

  return (
    <View style={[styles.container, isExpanded && { borderColor: slotStyle.accent }]}>
      <TouchableOpacity style={styles.header} onPress={openPicker} activeOpacity={0.7}>
        <View style={styles.headerLeft}>
          <Text style={[styles.icon, { color: slotStyle.accent }]}>
            {SLOT_ICONS[slot]}
          </Text>
          <Text style={styles.slotLabel}>{SLOT_LABELS[slot]}</Text>
        </View>

        <View style={styles.headerRight}>
          {equippedComponent && equippedTier ? (
            <View style={[styles.equippedBadge, { backgroundColor: equippedTier.glow }]}>
              <Text style={[styles.equippedText, { color: equippedTier.border }]}>
                {equippedTier.label} · {equippedComponent.statMultiplier}×
              </Text>
            </View>
          ) : (
            <Text style={styles.noneText}>None equipped</Text>
          )}
          <Text style={[styles.chevron, isExpanded && styles.chevronExpanded]}>›</Text>
        </View>
      </TouchableOpacity>

      {isExpanded ? (
        <View style={styles.pickerContainer}>
          {sortedComponents.length === 0 ? (
            <Text style={styles.emptyText}>
              No other components for this slot yet. Try spinning!
            </Text>
          ) : (
            <ScrollView
              horizontal={false}
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {sortedComponents.map(component => (
                <ComponentCard
                  key={component.id}
                  component={component}
                  isEquipped={component.id === equippedComponent?.id}
                  onEquip={handleEquip}
                />
              ))}
            </ScrollView>
          )}
          {fragmentCount > 0 && fragmentCount < FRAGMENT_COMBINE_COUNT ? (
            <Text style={styles.fragmentHint}>
              {fragmentCount}/{FRAGMENT_COMBINE_COUNT} fragments — keep spinning to combine
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
  },
  headerLeft:     { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  headerRight:    { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  icon:           { fontSize: 20 },
  slotLabel:      { color: COLORS.text, fontSize: FONT.md, fontWeight: '600' },
  equippedBadge:  { borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 2 },
  equippedText:   { fontSize: 12, fontWeight: '700' },
  noneText:       { color: COLORS.muted, fontSize: FONT.sm },
  chevron:        { color: COLORS.muted, fontSize: 20, transform: [{ rotate: '0deg' }] },
  chevronExpanded:{ transform: [{ rotate: '90deg' }] },
  pickerContainer:{ paddingHorizontal: SPACING.md, paddingBottom: SPACING.md, gap: SPACING.sm },
  scroll:         { maxHeight: 320 },
  scrollContent:  { gap: SPACING.sm },
  emptyText:      { color: COLORS.muted, fontSize: FONT.sm, textAlign: 'center', paddingVertical: SPACING.md },
  fragmentHint:   { color: COLORS.muted, fontSize: 12, textAlign: 'center' },
});
```

- [ ] **Step 6: Lint + type-check**

```bash
npm run lint && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add src/ui/fleet/loadoutSlot.ts src/ui/fleet/loadoutSlot.test.ts src/ui/fleet/LoadoutSlot.tsx
git commit -m "feat: add LoadoutSlot with expand, picker, and fragment combine prompt"
```

---

## Task 6: ShipCard + FleetScreen

**Files:**
- Create: `src/ui/fleet/ShipCard.tsx`
- Create: `src/ui/fleet/FleetScreen.tsx`

**Interfaces:**
- Consumes: `COLORS`, `FONT`, `RADIUS`, `SPACING` from `@/src/constants/theme`; Expo Router `useRouter`
- Produces: `ShipCard` component with props `{ name: string; subtitle: string; onPress: () => void }`; `FleetScreen` component

---

- [ ] **Step 1: Create `src/ui/fleet/ShipCard.tsx`**

```tsx
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, FONT, RADIUS, SPACING } from '@/src/constants/theme';

interface Props {
  name: string;
  subtitle: string;
  onPress: () => void;
}

export function ShipCard({ name, subtitle, onPress }: Props) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>🚀</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    gap: SPACING.md,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon:     { fontSize: 26 },
  info:     { flex: 1, gap: 2 },
  name:     { color: COLORS.text, fontSize: FONT.md, fontWeight: '700' },
  subtitle: { color: COLORS.muted, fontSize: FONT.sm },
  chevron:  { color: COLORS.muted, fontSize: 22 },
});
```

- [ ] **Step 2: Create `src/ui/fleet/FleetScreen.tsx`**

```tsx
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { COLORS, FONT, SPACING } from '@/src/constants/theme';
import { ShipCard } from './ShipCard';

export function FleetScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        <Text style={styles.title}>Ship Fleet</Text>
        <ShipCard
          name="Your Ship"
          subtitle="Tap to manage loadout"
          onPress={() => router.push('/fleet/player-ship')}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1, paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, gap: SPACING.lg },
  title:     { color: COLORS.text, fontSize: FONT.xl, fontWeight: '700' },
});
```

- [ ] **Step 3: Lint + type-check**

```bash
npm run lint && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/ui/fleet/ShipCard.tsx src/ui/fleet/FleetScreen.tsx
git commit -m "feat: add ShipCard and FleetScreen"
```

---

## Task 7: PlanetLoader + LoadoutScreen

**Files:**
- Create: `src/ui/fleet/PlanetLoader.tsx`
- Create: `src/ui/fleet/LoadoutScreen.tsx`

**Interfaces:**
- Consumes: All prior `src/ui/fleet/` components; `useShipStore` from `@/src/stores/useShipStore`; `calcPowerScore` from `./powerScore`; `SLOT_ORDER` from `./constants`; Reanimated, SafeAreaView
- Produces: `PlanetLoader` component (no props); `LoadoutScreen` component (no props — reads shipId param internally but currently ignores it, always loading the current player's ship)

---

- [ ] **Step 1: Create `src/ui/fleet/PlanetLoader.tsx`**

```tsx
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { COLORS } from '@/src/constants/theme';

export function PlanetLoader() {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 3000, easing: Easing.linear }),
      -1,
      false,
    );
  }, [rotation]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ rotateZ: `${rotation.value}deg` }],
  }));

  return (
    <View style={styles.wrapper}>
      <View style={styles.planet} />
      <Animated.View style={[styles.ring, ringStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planet: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primary,
    opacity: 0.85,
  },
  ring: {
    position: 'absolute',
    width: 110,
    height: 40,
    borderRadius: 55,
    borderWidth: 3,
    borderColor: COLORS.accent,
    opacity: 0.7,
  },
});
```

- [ ] **Step 2: Create `src/ui/fleet/LoadoutScreen.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, FONT, SPACING } from '@/src/constants/theme';
import { useShipStore } from '@/src/stores/useShipStore';
import { SLOT_ORDER } from './constants';
import { calcPowerScore } from './powerScore';
import { RadarChart } from './RadarChart';
import { PowerScore } from './PowerScore';
import { LoadoutSlot } from './LoadoutSlot';
import { PlanetLoader } from './PlanetLoader';

export function LoadoutScreen() {
  const {
    equippedComponents,
    ownedComponents,
    fragmentCounts,
    fetchShip,
    equipComponent,
    combineFragmentsForSlot,
  } = useShipStore();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await fetchShip();
    } catch {
      setError('Failed to load ship data.');
    } finally {
      setIsLoading(false);
    }
  }, [fetchShip]);

  useEffect(() => { load(); }, [load]);

  const powerScore = calcPowerScore(equippedComponents);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <PlanetLoader />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={load}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Loadout</Text>

        <View style={styles.statsRow}>
          <RadarChart equipped={equippedComponents} />
          <PowerScore score={powerScore} />
        </View>

        <View style={styles.slots}>
          {SLOT_ORDER.map(slot => (
            <LoadoutSlot
              key={slot}
              slot={slot}
              equippedComponent={equippedComponents[slot]}
              ownedComponents={ownedComponents.filter(c => c.slot === slot)}
              fragmentCount={fragmentCounts[slot]}
              onEquip={equipComponent}
              onCombine={() => combineFragmentsForSlot(slot)}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: COLORS.background },
  container:      { padding: SPACING.lg, gap: SPACING.xl },
  title:          { color: COLORS.text, fontSize: FONT.xl, fontWeight: '700' },
  statsRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  slots:          { gap: SPACING.md },
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.lg },
  errorText:      { color: COLORS.danger, fontSize: FONT.md, textAlign: 'center' },
  retryButton:    { backgroundColor: COLORS.primary, borderRadius: 8, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm },
  retryText:      { color: COLORS.background, fontSize: FONT.md, fontWeight: '700' },
});
```

- [ ] **Step 3: Lint + type-check**

```bash
npm run lint && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/ui/fleet/PlanetLoader.tsx src/ui/fleet/LoadoutScreen.tsx
git commit -m "feat: add PlanetLoader animation and LoadoutScreen"
```

---

## Task 8: Routes, Barrel, Navigation Wiring

**Files:**
- Create: `src/ui/fleet/index.ts`
- Create: `app/(tabs)/fleet/index.tsx`
- Create: `app/(tabs)/fleet/[shipId].tsx`
- Modify: `src/ui/index.ts`
- Modify: `app/(tabs)/_layout.tsx`
- Delete: `app/(tabs)/fleet.tsx`

---

- [ ] **Step 1: Create `src/ui/fleet/index.ts`**

```typescript
export * from './FleetScreen';
export * from './LoadoutScreen';
```

- [ ] **Step 2: Update `src/ui/index.ts`**

```typescript
export * from './Screen';
export * from './spin';
export * from './fleet';
```

- [ ] **Step 3: Delete `app/(tabs)/fleet.tsx`**

```bash
git rm "app/(tabs)/fleet.tsx"
```

- [ ] **Step 4: Create `app/(tabs)/fleet/_layout.tsx`**

Expo Router needs an explicit Stack layout inside the fleet folder so that navigating from FleetScreen to LoadoutScreen is treated as a stack push (back button, no double tab bar).

```tsx
import { Stack } from 'expo-router';
import { COLORS } from '@/src/constants/theme';

export default function FleetLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.background },
      }}
    />
  );
}
```

- [ ] **Step 5: Create `app/(tabs)/fleet/index.tsx`**

```tsx
import { FleetScreen } from '@/src/ui/fleet';

export default function FleetTab() {
  return <FleetScreen />;
}
```

- [ ] **Step 6: Create `app/(tabs)/fleet/[shipId].tsx`**

```tsx
import { LoadoutScreen } from '@/src/ui/fleet';

export default function LoadoutTab() {
  return <LoadoutScreen />;
}
```

- [ ] **Step 7: Update `app/(tabs)/_layout.tsx` — rename Fleet tab to "Ship Fleet"**

In `app/(tabs)/_layout.tsx`, change the fleet `Tabs.Screen` options:

```tsx
// Change:
<Tabs.Screen
  name="fleet"
  options={{
    title: 'Fleet',
    tabBarIcon: ({ color, size }) => <Ionicons name="rocket" size={size} color={color} />,
  }}
/>
// To:
<Tabs.Screen
  name="fleet"
  options={{
    title: 'Ship Fleet',
    tabBarIcon: ({ color, size }) => <Ionicons name="rocket" size={size} color={color} />,
    headerShown: false,
  }}
/>
```

- [ ] **Step 8: Run all tests**

```bash
npx jest --no-coverage
```
Expected: all existing 34 tests pass + new tests (slotStyles ×4, radarChart ×4, powerScore ×4, loadoutSlot ×5 = 17 new = 51 total)

- [ ] **Step 9: Lint + type-check**

```bash
npm run lint && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 10: Commit**

```bash
git add "app/(tabs)/fleet/_layout.tsx" "app/(tabs)/fleet/index.tsx" "app/(tabs)/fleet/[shipId].tsx" "app/(tabs)/_layout.tsx" src/ui/fleet/index.ts src/ui/index.ts
git commit -m "feat: wire Ship Fleet tab routes and barrel exports"
```
