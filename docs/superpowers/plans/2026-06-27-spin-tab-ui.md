# Spin Tab UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a horizontal-scrolling gacha reel screen wired to the existing `useSpinStore`, with a fake-out deceleration animation and tier-based card styling.

**Architecture:** A new `src/ui/spin/` folder holds all components and pure helpers. `app/(tabs)/spin.tsx` is a thin route that renders `SpinScreen`. Animation is driven by a single `Animated.Value` (`translateX`) owned by `SpinReel`, triggered imperatively via a ref handle. The server result is known before animation starts; the fake-out is pure choreography.

**Tech Stack:** React Native `Animated` API, `expo-linear-gradient`, `expo-haptics`, Zustand (`useSpinStore`), TypeScript strict mode.

## Global Constraints

- No new npm packages — everything needed is already in `package.json`
- Follow `COLORS`, `FONT`, `SPACING`, `RADIUS` from `src/constants/theme.ts` — no magic color/size values
- All game logic stays in `src/game/` — UI files in `src/ui/spin/` import types from `src/game/spin/types.ts`
- Route file `app/(tabs)/spin.tsx` contains zero logic — only renders `SpinScreen`
- `Math.random()` is only acceptable for cosmetic reel filler — the real result comes from the server
- `useNativeDriver: true` on all `Animated.timing` calls
- Every new file is TypeScript strict — no `any`

---

### Task 1: Spin UI constants and tier styles

**Files:**
- Create: `src/ui/spin/constants.ts`
- Create: `src/ui/spin/tierStyles.ts`
- Test: `src/ui/spin/tierStyles.test.ts`

**Interfaces:**
- Produces:
  - `REEL_TOTAL`, `WINNER_INDEX`, `VISIBLE_CARDS`, `CARD_WIDTH`, `CARD_HEIGHT`, `CARD_MARGIN`, `CARD_STEP`, `REEL_CONTAINER_WIDTH`, `ANIM` from `constants.ts`
  - `TierStyle` interface and `TIER_STYLES: Record<LootTier, TierStyle>` from `tierStyles.ts`

- [ ] **Step 1: Create `src/ui/spin/constants.ts`**

```typescript
export const REEL_TOTAL = 40;
export const WINNER_INDEX = 34;
export const VISIBLE_CARDS = 5;

export const CARD_WIDTH = 88;
export const CARD_HEIGHT = 110;
export const CARD_MARGIN = 8;
export const CARD_STEP = CARD_WIDTH + CARD_MARGIN; // px per card slot

export const REEL_CONTAINER_WIDTH = VISIBLE_CARDS * CARD_STEP;

export const ANIM = {
  FAST_MS: 500,
  DECEL_MS: 600,
  PAUSE_MS: 150,
  LURCH_MS: 300,
} as const;
```

- [ ] **Step 2: Create `src/ui/spin/tierStyles.ts`**

```typescript
import type { LootTier } from '@/src/game/spin/types';

export interface TierStyle {
  border: string;
  glow: string;
  label: string;
  flashy: boolean;
}

export const TIER_STYLES: Record<LootTier, TierStyle> = {
  common:     { border: '#9E9E9E', glow: '#9E9E9E40', label: 'Common',     flashy: false },
  uncommon:   { border: '#4CAF50', glow: '#4CAF5040', label: 'Uncommon',   flashy: false },
  rare:       { border: '#2196F3', glow: '#2196F340', label: 'Rare',       flashy: false },
  legendary:  { border: '#FF9800', glow: '#FF980060', label: 'Legendary',  flashy: true  },
  ultra_rare: { border: '#9C27B0', glow: '#9C27B060', label: 'Ultra Rare', flashy: true  },
};
```

- [ ] **Step 3: Write the test**

Create `src/ui/spin/tierStyles.test.ts`:

```typescript
import { TIER_STYLES } from './tierStyles';

const ALL_TIERS = ['common', 'uncommon', 'rare', 'legendary', 'ultra_rare'] as const;

describe('TIER_STYLES', () => {
  it('has an entry for every LootTier', () => {
    for (const tier of ALL_TIERS) {
      expect(TIER_STYLES[tier]).toBeDefined();
    }
  });

  it('marks only legendary and ultra_rare as flashy', () => {
    expect(TIER_STYLES.legendary.flashy).toBe(true);
    expect(TIER_STYLES.ultra_rare.flashy).toBe(true);
    expect(TIER_STYLES.common.flashy).toBe(false);
    expect(TIER_STYLES.uncommon.flashy).toBe(false);
    expect(TIER_STYLES.rare.flashy).toBe(false);
  });

  it('every entry has a non-empty label and border', () => {
    for (const tier of ALL_TIERS) {
      expect(TIER_STYLES[tier].label.length).toBeGreaterThan(0);
      expect(TIER_STYLES[tier].border).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
```

- [ ] **Step 4: Run the test**

```bash
npx jest src/ui/spin/tierStyles.test.ts --no-coverage
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/spin/constants.ts src/ui/spin/tierStyles.ts src/ui/spin/tierStyles.test.ts
git commit -m "feat: spin UI constants and tier styles"
```

---

### Task 2: Reel data builder

**Files:**
- Create: `src/ui/spin/reelData.ts`
- Test: `src/ui/spin/reelData.test.ts`

**Interfaces:**
- Consumes: `REEL_TOTAL`, `WINNER_INDEX` from `./constants`; `LootTier`, `SpinResult` from `@/src/game/spin/types`
- Produces:
  - `ReelItem` interface
  - `buildReelData(result: SpinResult): ReelItem[]` — 40-item array with winner at index `WINNER_INDEX`
  - `spinResultToReelItem(result: SpinResult): ReelItem` — converts server result to display item

- [ ] **Step 1: Create `src/ui/spin/reelData.ts`**

```typescript
import type { LootTier, SpinResult } from '@/src/game/spin/types';
import { REEL_TOTAL, WINNER_INDEX } from './constants';

export interface ReelItem {
  id: string;
  tier: LootTier;
  label: string;
  sublabel: string;
  icon: string;
}

// Representative display items per tier shown during the reel scroll.
// These are cosmetic only — the real result comes from the server.
const TIER_POOL: Record<LootTier, Omit<ReelItem, 'id' | 'tier'>[]> = {
  common: [
    { label: '500 Ore',     sublabel: 'Resource', icon: '⛏️' },
    { label: '200 Crystal', sublabel: 'Resource', icon: '💎' },
    { label: '150 Gas',     sublabel: 'Resource', icon: '⛽' },
    { label: '100 Water',   sublabel: 'Resource', icon: '💧' },
  ],
  uncommon: [
    { label: 'Boost Token', sublabel: '×1 use',   icon: '⚡' },
    { label: '1,000 Ore',   sublabel: 'Resource', icon: '⛏️' },
    { label: 'Hull Shard',  sublabel: 'Fragment', icon: '🔩' },
  ],
  rare: [
    { label: 'Rare Hull',   sublabel: 'Component', icon: '🛡️' },
    { label: 'Blueprint',   sublabel: 'Advanced',  icon: '📐' },
    { label: 'Boost ×3',   sublabel: 'Token',     icon: '⚡' },
  ],
  legendary: [
    { label: 'Legendary Hull',    sublabel: 'Component', icon: '🌟' },
    { label: 'Legendary Weapons', sublabel: 'Component', icon: '🌟' },
    { label: 'Cosmetic Skin',     sublabel: 'Exclusive', icon: '✨' },
  ],
  ultra_rare: [
    { label: 'Phase Cannon', sublabel: 'Ultra Rare', icon: '🔮' },
    { label: 'Echo Shell',   sublabel: 'Ultra Rare', icon: '🔮' },
    { label: 'Overdrive',    sublabel: 'Ultra Rare', icon: '🔮' },
    { label: 'Iron Tomb',    sublabel: 'Ultra Rare', icon: '🔮' },
  ],
};

const VISUAL_WEIGHTS: { tier: LootTier; weight: number }[] = [
  { tier: 'common',     weight: 0.600 },
  { tier: 'uncommon',   weight: 0.250 },
  { tier: 'rare',       weight: 0.120 },
  { tier: 'legendary',  weight: 0.025 },
  { tier: 'ultra_rare', weight: 0.005 },
];

// Linear congruential generator — cosmetic use only, not for game logic
function makeLCG(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(1664525, s) + 1013904223 >>> 0;
    return s / 0xffffffff;
  };
}

function pickTier(rand: number): LootTier {
  let cumulative = 0;
  for (const { tier, weight } of VISUAL_WEIGHTS) {
    cumulative += weight;
    if (rand < cumulative) return tier;
  }
  return 'common';
}

const TIER_LABEL: Record<LootTier, string> = {
  common: 'Common', uncommon: 'Uncommon', rare: 'Rare',
  legendary: 'Legendary', ultra_rare: 'Ultra Rare',
};

export function spinResultToReelItem(result: SpinResult): ReelItem {
  const { itemType, itemData, tier } = result;
  let label: string;
  let sublabel: string;
  let icon: string;

  switch (itemType) {
    case 'resource_bundle':
      label = `${itemData.amount} ${capitalize(String(itemData.resourceType ?? ''))}`;
      sublabel = 'Resource';
      icon = '⛏️';
      break;
    case 'boost_token':
      label = `Boost ×${itemData.quantity}`;
      sublabel = 'Token';
      icon = '⚡';
      break;
    case 'blueprint':
      label = 'Blueprint';
      sublabel = capitalize(String(itemData.buildingTier ?? ''));
      icon = '📐';
      break;
    case 'ship_component':
      label = `${TIER_LABEL[tier]} ${capitalize(String(itemData.slot ?? ''))}`;
      sublabel = 'Component';
      icon = tier === 'ultra_rare' ? '🔮' : '🌟';
      break;
    case 'component_fragment':
      label = `${capitalize(String(itemData.slot ?? ''))} Shard`;
      sublabel = 'Fragment';
      icon = '🔩';
      break;
    case 'cosmetic_skin':
      label = 'Cosmetic Skin';
      sublabel = 'Exclusive';
      icon = '✨';
      break;
    default:
      label = 'Unknown';
      sublabel = '';
      icon = '❓';
  }

  return { id: 'winner', tier, label, sublabel, icon };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function buildReelData(result: SpinResult): ReelItem[] {
  const rand = makeLCG(Date.now());
  const items: ReelItem[] = [];

  for (let i = 0; i < REEL_TOTAL; i++) {
    if (i === WINNER_INDEX) {
      items.push(spinResultToReelItem(result));
      continue;
    }
    const tier = pickTier(rand());
    const pool = TIER_POOL[tier];
    const template = pool[Math.floor(rand() * pool.length)];
    items.push({ ...template, tier, id: `filler-${i}` });
  }

  return items;
}
```

- [ ] **Step 2: Write the tests**

Create `src/ui/spin/reelData.test.ts`:

```typescript
import { buildReelData, spinResultToReelItem } from './reelData';
import { REEL_TOTAL, WINNER_INDEX } from './constants';
import type { SpinResult } from '@/src/game/spin/types';

const shipResult: SpinResult = {
  tier: 'rare',
  itemType: 'ship_component',
  itemData: { tier: 'rare', slot: 'hull' },
  pityCount: 5,
};

const resourceResult: SpinResult = {
  tier: 'common',
  itemType: 'resource_bundle',
  itemData: { resourceType: 'ore', amount: 500 },
  pityCount: 1,
};

describe('buildReelData', () => {
  it('returns exactly REEL_TOTAL items', () => {
    expect(buildReelData(shipResult)).toHaveLength(REEL_TOTAL);
  });

  it('places winner at WINNER_INDEX with id "winner"', () => {
    const items = buildReelData(shipResult);
    expect(items[WINNER_INDEX].id).toBe('winner');
    expect(items[WINNER_INDEX].tier).toBe('rare');
  });

  it('does not place winner at any other index', () => {
    const items = buildReelData(shipResult);
    items.forEach((item, i) => {
      if (i !== WINNER_INDEX) expect(item.id).not.toBe('winner');
    });
  });

  it('all filler items have non-empty labels', () => {
    const items = buildReelData(resourceResult);
    items.forEach((item, i) => {
      if (i !== WINNER_INDEX) expect(item.label.length).toBeGreaterThan(0);
    });
  });
});

describe('spinResultToReelItem', () => {
  it('maps ship_component correctly', () => {
    const item = spinResultToReelItem(shipResult);
    expect(item.id).toBe('winner');
    expect(item.tier).toBe('rare');
    expect(item.label).toBe('Rare Hull');
    expect(item.sublabel).toBe('Component');
  });

  it('maps resource_bundle correctly', () => {
    const item = spinResultToReelItem(resourceResult);
    expect(item.label).toBe('500 Ore');
    expect(item.sublabel).toBe('Resource');
  });
});
```

- [ ] **Step 3: Run the tests**

```bash
npx jest src/ui/spin/reelData.test.ts --no-coverage
```

Expected: 6 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/ui/spin/reelData.ts src/ui/spin/reelData.test.ts
git commit -m "feat: spin reel data builder with winner injection"
```

---

### Task 3: ReelCard component

**Files:**
- Create: `src/ui/spin/ReelCard.tsx`

**Interfaces:**
- Consumes: `ReelItem` from `./reelData`; `TierStyle`, `TIER_STYLES` from `./tierStyles`; `CARD_WIDTH`, `CARD_HEIGHT`, `CARD_MARGIN` from `./constants`; theme constants from `@/src/constants/theme`
- Produces: `<ReelCard item={ReelItem} isCenter={boolean} />` — renders a single reel card

- [ ] **Step 1: Create `src/ui/spin/ReelCard.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONT, RADIUS, SPACING } from '@/src/constants/theme';
import { TIER_STYLES } from './tierStyles';
import { CARD_WIDTH, CARD_HEIGHT, CARD_MARGIN } from './constants';
import type { ReelItem } from './reelData';

type Props = {
  item: ReelItem;
  isCenter?: boolean;
};

export function ReelCard({ item, isCenter }: Props) {
  const style = TIER_STYLES[item.tier];
  const glowOpacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (!style.flashy) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowOpacity, { toValue: 1,   duration: 700, useNativeDriver: true }),
        Animated.timing(glowOpacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [style.flashy, glowOpacity]);

  return (
    <View
      style={[
        styles.card,
        { borderColor: style.border },
        isCenter && styles.cardCenter,
      ]}
    >
      {style.flashy && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            styles.glow,
            { opacity: glowOpacity, shadowColor: style.border },
          ]}
        />
      )}
      {style.flashy && (
        <LinearGradient
          colors={['transparent', style.glow, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[StyleSheet.absoluteFill, styles.shimmer]}
          pointerEvents="none"
        />
      )}
      <Text style={styles.icon}>{item.icon}</Text>
      <Text style={styles.label} numberOfLines={2}>{item.label}</Text>
      <Text style={styles.sublabel} numberOfLines={1}>{item.sublabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    marginRight: CARD_MARGIN,
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xs,
    overflow: 'hidden',
  },
  cardCenter: {
    transform: [{ scale: 1.05 }],
  },
  glow: {
    borderRadius: RADIUS.md,
    shadowOpacity: 0.9,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  shimmer: {
    borderRadius: RADIUS.md,
  },
  icon: { fontSize: 28 },
  label: {
    color: COLORS.text,
    fontSize: FONT.sm - 2,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
  },
  sublabel: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 2,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/spin/ReelCard.tsx
git commit -m "feat: ReelCard with tier border and legendary/ultra-rare glow shimmer"
```

---

### Task 4: SpinReel animated component

**Files:**
- Create: `src/ui/spin/SpinReel.tsx`

**Interfaces:**
- Consumes: `ReelCard` from `./ReelCard`; `CARD_STEP`, `REEL_CONTAINER_WIDTH`, `WINNER_INDEX`, `ANIM` from `./constants`; `ReelItem` from `./reelData`; theme constants
- Produces:
  - `SpinReelHandle` interface: `{ start(isFakeout: boolean, onDone: () => void): void }`
  - `<SpinReel ref={SpinReelHandle} items={ReelItem[]} centerIndex={number} />` component

- [ ] **Step 1: Create `src/ui/spin/SpinReel.tsx`**

```tsx
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { COLORS } from '@/src/constants/theme';
import { CARD_STEP, REEL_CONTAINER_WIDTH, WINNER_INDEX, ANIM } from './constants';
import { ReelCard } from './ReelCard';
import type { ReelItem } from './reelData';

export interface SpinReelHandle {
  start(isFakeout: boolean, onDone: () => void): void;
}

// How many card slots from the left edge the center landing zone sits
const CENTER_SLOT = 2;

function toOffset(cardIndex: number): number {
  return -(cardIndex - CENTER_SLOT) * CARD_STEP;
}

type Props = {
  items: ReelItem[];
  centerIndex: number;
};

export const SpinReel = forwardRef<SpinReelHandle, Props>(function SpinReel(
  { items, centerIndex },
  ref,
) {
  const translateX = useRef(new Animated.Value(0)).current;

  useImperativeHandle(ref, () => ({
    start(isFakeout, onDone) {
      translateX.setValue(0);

      // Phase 1: fast scroll to midpoint
      Animated.timing(translateX, {
        toValue: toOffset(15),
        duration: ANIM.FAST_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(() => {
        // Phase 2: decelerate toward fake-out or winner
        const phase2Target = isFakeout ? WINNER_INDEX - 1 : WINNER_INDEX;
        Animated.timing(translateX, {
          toValue: toOffset(phase2Target),
          duration: ANIM.DECEL_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(() => {
          if (!isFakeout) {
            onDone();
            return;
          }
          // Phase 3: brief pause, then lurch to winner
          setTimeout(() => {
            Animated.timing(translateX, {
              toValue: toOffset(WINNER_INDEX),
              duration: ANIM.LURCH_MS,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }).start(() => onDone());
          }, ANIM.PAUSE_MS);
        });
      });
    },
  }));

  return (
    <View style={styles.outer}>
      <View style={styles.pointer} />
      <View style={styles.clip}>
        <Animated.View style={[styles.track, { transform: [{ translateX }] }]}>
          {items.map((item, i) => (
            <ReelCard key={item.id} item={item} isCenter={i === centerIndex} />
          ))}
        </Animated.View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  outer: { alignItems: 'center' },
  pointer: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: COLORS.primary,
    marginBottom: 4,
  },
  clip: {
    width: REEL_CONTAINER_WIDTH,
    overflow: 'hidden',
  },
  track: {
    flexDirection: 'row',
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/spin/SpinReel.tsx
git commit -m "feat: SpinReel with fake-out animation sequence"
```

---

### Task 5: SpinResult and SpinButtons components

**Files:**
- Create: `src/ui/spin/SpinResult.tsx`
- Create: `src/ui/spin/SpinButtons.tsx`
- Test: `src/ui/spin/SpinButtons.test.ts`

**Interfaces:**
- Consumes: `TIER_STYLES` from `./tierStyles`; `ReelItem` from `./reelData`; theme constants
- Produces:
  - `<SpinResult item={ReelItem | null} />` — fades in after spin, placeholder height when null
  - `export function formatCountdown(availableAt: Date): string` — pure, testable, exported
  - `<SpinButtons freeSpinAvailableAt={Date|null} ticketCount={number} isSpinning={boolean} onFreeSpin={()=>void} onTicketSpin={()=>void} />`

- [ ] **Step 1: Create `src/ui/spin/SpinResult.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { COLORS, FONT, RADIUS, SPACING } from '@/src/constants/theme';
import { TIER_STYLES } from './tierStyles';
import type { ReelItem } from './reelData';

type Props = { item: ReelItem | null };

export function SpinResult({ item }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!item) {
      opacity.setValue(0);
      return;
    }
    Animated.timing(opacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [item, opacity]);

  if (!item) return <View style={styles.placeholder} />;

  const tierStyle = TIER_STYLES[item.tier];

  return (
    <Animated.View style={[styles.row, { opacity }]}>
      <Text style={styles.icon}>{item.icon}</Text>
      <View style={styles.text}>
        <Text style={styles.label}>{item.label}</Text>
        <Text style={styles.sublabel}>{item.sublabel}</Text>
      </View>
      <View
        style={[
          styles.badge,
          { backgroundColor: tierStyle.border + '30', borderColor: tierStyle.border },
        ]}
      >
        <Text style={[styles.badgeText, { color: tierStyle.border }]}>{tierStyle.label}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  placeholder: { height: 56 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  icon: { fontSize: 28 },
  text: { flex: 1 },
  label: { color: COLORS.text, fontSize: FONT.md, fontWeight: '600' },
  sublabel: { color: COLORS.muted, fontSize: FONT.sm - 2 },
  badge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
});
```

- [ ] **Step 2: Create `src/ui/spin/SpinButtons.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, FONT, RADIUS, SPACING } from '@/src/constants/theme';

type Props = {
  freeSpinAvailableAt: Date | null;
  ticketCount: number;
  isSpinning: boolean;
  onFreeSpin: () => void;
  onTicketSpin: () => void;
};

export function formatCountdown(availableAt: Date): string {
  const diff = Math.max(0, availableAt.getTime() - Date.now());
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1_000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function SpinButtons({
  freeSpinAvailableAt,
  ticketCount,
  isSpinning,
  onFreeSpin,
  onTicketSpin,
}: Props) {
  const [countdown, setCountdown] = useState('');
  const freeReady = !freeSpinAvailableAt || freeSpinAvailableAt.getTime() <= Date.now();

  useEffect(() => {
    if (freeReady || !freeSpinAvailableAt) return;
    setCountdown(formatCountdown(freeSpinAvailableAt));
    const id = setInterval(() => {
      setCountdown(formatCountdown(freeSpinAvailableAt));
    }, 1000);
    return () => clearInterval(id);
  }, [freeReady, freeSpinAvailableAt]);

  const freeDisabled = isSpinning || !freeReady;
  const ticketDisabled = isSpinning || ticketCount < 1;

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={[styles.btn, styles.btnFree, freeDisabled && styles.btnDisabled]}
        onPress={onFreeSpin}
        disabled={freeDisabled}
        activeOpacity={0.75}
      >
        {isSpinning ? (
          <ActivityIndicator color={COLORS.background} size="small" />
        ) : (
          <>
            <Text style={styles.btnLabel}>🎯 Free Spin</Text>
            {!freeReady && <Text style={styles.timer}>{countdown}</Text>}
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.btn, styles.btnTicket, ticketDisabled && styles.btnDisabled]}
        onPress={onTicketSpin}
        disabled={ticketDisabled}
        activeOpacity={0.75}
      >
        <Text style={styles.btnLabel}>🎫 Use Ticket</Text>
        <Text style={styles.ticketCount}>
          {ticketCount > 0 ? `${ticketCount} left` : 'No tickets'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: SPACING.md },
  btn: {
    flex: 1,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 64,
  },
  btnFree:     { backgroundColor: COLORS.primary },
  btnTicket:   { backgroundColor: COLORS.accent },
  btnDisabled: { opacity: 0.45 },
  btnLabel:    { color: COLORS.background, fontSize: FONT.md, fontWeight: '700' },
  timer:       { color: COLORS.background, fontSize: FONT.sm - 2, marginTop: 2, opacity: 0.8 },
  ticketCount: { color: COLORS.background, fontSize: FONT.sm - 2, marginTop: 2, opacity: 0.8 },
});
```

- [ ] **Step 3: Write the SpinButtons test**

Create `src/ui/spin/SpinButtons.test.ts`:

```typescript
import { formatCountdown } from './SpinButtons';

describe('formatCountdown', () => {
  it('formats hours, minutes, and seconds with zero-padding', () => {
    const target = new Date(Date.now() + 2 * 3_600_000 + 30 * 60_000 + 5_000);
    expect(formatCountdown(target)).toBe('02:30:05');
  });

  it('returns 00:00:00 for a date in the past', () => {
    const past = new Date(Date.now() - 1000);
    expect(formatCountdown(past)).toBe('00:00:00');
  });

  it('formats single-digit components with leading zeros', () => {
    const target = new Date(Date.now() + 1 * 3_600_000 + 1 * 60_000 + 1_000);
    expect(formatCountdown(target)).toBe('01:01:01');
  });
});
```

- [ ] **Step 4: Run the test**

```bash
npx jest src/ui/spin/SpinButtons.test.ts --no-coverage
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/spin/SpinResult.tsx src/ui/spin/SpinButtons.tsx src/ui/spin/SpinButtons.test.ts
git commit -m "feat: SpinResult fade-in and SpinButtons with countdown timer"
```

---

### Task 6: SpinScreen root component and barrel exports

**Files:**
- Create: `src/ui/spin/SpinScreen.tsx`
- Create: `src/ui/spin/index.ts`
- Modify: `src/ui/index.ts`

**Interfaces:**
- Consumes: all components and helpers from previous tasks; `useSpinStore` from `@/src/stores/useSpinStore`; `SpinType` from `@/src/game/spin/types`; `expo-haptics`
- Produces: `<SpinScreen />` — fully wired root component

- [ ] **Step 1: Create `src/ui/spin/SpinScreen.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { COLORS, FONT, SPACING } from '@/src/constants/theme';
import { useSpinStore } from '@/src/stores/useSpinStore';
import { buildReelData, spinResultToReelItem } from './reelData';
import { SpinReel, SpinReelHandle } from './SpinReel';
import { SpinResult } from './SpinResult';
import { SpinButtons } from './SpinButtons';
import { WINNER_INDEX } from './constants';
import type { ReelItem } from './reelData';
import type { SpinType } from '@/src/game/spin/types';

const PLACEHOLDER_ITEMS: ReelItem[] = Array.from({ length: 40 }, (_, i) => ({
  id: `placeholder-${i}`,
  tier: 'common',
  label: '?',
  sublabel: '',
  icon: '❓',
}));

export function SpinScreen() {
  const { freeSpinAvailableAt, isSpinning, fetchSpinState, spin } = useSpinStore();
  const reelRef = useRef<SpinReelHandle>(null);
  const [reelItems, setReelItems] = useState<ReelItem[]>(PLACEHOLDER_ITEMS);
  const [resultItem, setResultItem] = useState<ReelItem | null>(null);
  const [centerIndex, setCenterIndex] = useState(2);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSpinState();
  }, [fetchSpinState]);

  async function handleSpin(spinType: SpinType) {
    setError(null);
    setResultItem(null);
    try {
      const result = await spin(spinType);
      const items = buildReelData(result);
      setReelItems(items);
      setCenterIndex(2); // no highlight during animation

      const isFakeout = result.tier !== 'common';
      reelRef.current?.start(isFakeout, async () => {
        setCenterIndex(WINNER_INDEX);
        setResultItem(spinResultToReelItem(result));
        await Haptics.notificationAsync(
          result.tier === 'ultra_rare' || result.tier === 'legendary'
            ? Haptics.NotificationFeedbackType.Success
            : Haptics.NotificationFeedbackType.Warning,
        );
        await fetchSpinState();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Spin failed — try again');
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        <Text style={styles.title}>Spin</Text>

        <View style={styles.reelSection}>
          <SpinReel ref={reelRef} items={reelItems} centerIndex={centerIndex} />
        </View>

        <View style={styles.resultSection}>
          <SpinResult item={resultItem} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <View style={styles.buttonsSection}>
          <SpinButtons
            freeSpinAvailableAt={freeSpinAvailableAt}
            ticketCount={0} // TODO: wire to inventory store when built
            isSpinning={isSpinning}
            onFreeSpin={() => handleSpin('free')}
            onTicketSpin={() => handleSpin('ticket')}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  container: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    gap: SPACING.xl,
  },
  title: { color: COLORS.text, fontSize: FONT.xl, fontWeight: '700' },
  reelSection: { alignItems: 'center' },
  resultSection: {},
  buttonsSection: { marginTop: 'auto', paddingBottom: SPACING.lg },
  error: { color: COLORS.danger, fontSize: FONT.sm, marginTop: SPACING.sm, textAlign: 'center' },
});
```

- [ ] **Step 2: Create `src/ui/spin/index.ts`**

```typescript
export { SpinScreen } from './SpinScreen';
```

- [ ] **Step 3: Update `src/ui/index.ts`**

Current content of `src/ui/index.ts`:
```typescript
export * from './Screen';
```

New content:
```typescript
export * from './Screen';
export * from './spin';
```

- [ ] **Step 4: Run lint**

```bash
npm run lint
```

Fix any reported issues before continuing.

- [ ] **Step 5: Commit**

```bash
git add src/ui/spin/SpinScreen.tsx src/ui/spin/index.ts src/ui/index.ts
git commit -m "feat: SpinScreen wiring useSpinStore to reel animation"
```

---

### Task 7: Wire the new tab into navigation

**Files:**
- Create: `app/(tabs)/spin.tsx`
- Modify: `app/(tabs)/_layout.tsx`

**Interfaces:**
- Consumes: `SpinScreen` from `@/src/ui/spin`; `Ionicons` + `Tabs` already imported in `_layout.tsx`
- Produces: a working "Spin" tab between Fleet and Tech in the tab bar

- [ ] **Step 1: Create `app/(tabs)/spin.tsx`**

```tsx
import { SpinScreen } from '@/src/ui/spin';

export default function SpinTab() {
  return <SpinScreen />;
}
```

- [ ] **Step 2: Add the Spin tab to `app/(tabs)/_layout.tsx`**

Current file has four `<Tabs.Screen>` entries in this order: `index`, `fleet`, `tech`, `settings`.

Add the new screen **after `fleet` and before `tech`**. The full updated file:

```tsx
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { COLORS } from '@/src/constants/theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.muted,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Star Map',
          tabBarIcon: ({ color, size }) => <Ionicons name="planet" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="fleet"
        options={{
          title: 'Fleet',
          tabBarIcon: ({ color, size }) => <Ionicons name="rocket" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="spin"
        options={{
          title: 'Spin',
          tabBarIcon: ({ color, size }) => <Ionicons name="gift" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="tech"
        options={{
          title: 'Tech',
          tabBarIcon: ({ color, size }) => <Ionicons name="git-branch" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Ionicons name="settings" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
```

- [ ] **Step 3: Run lint and all tests**

```bash
npm run lint
npx jest --no-coverage
```

Expected: lint passes, all tests pass (tierStyles ×3, reelData ×6, SpinButtons ×3).

- [ ] **Step 4: Commit**

```bash
git add app/(tabs)/spin.tsx app/(tabs)/_layout.tsx
git commit -m "feat: add Spin tab to navigation between Fleet and Tech"
```

---

## Self-Review

**Spec coverage check:**
- [x] New tab between Fleet and Tech → Task 7
- [x] Horizontal scrolling reel with full item cards → Tasks 3, 4
- [x] Free Spin + Ticket buttons on one screen → Task 5
- [x] Tier border colors (common → ultra_rare) → Task 1
- [x] Legendary/ultra_rare pulsing glow + shimmer → Task 3
- [x] Fake-out animation skipped for common results → Task 4 (`isFakeout = result.tier !== 'common'`)
- [x] Fake-out: decelerate → pause → lurch → Task 4
- [x] Free spin cooldown timer → Task 5
- [x] Ticket count placeholder (0) with TODO comment → Task 6
- [x] Result row fades in after animation → Task 5
- [x] Haptic feedback on result → Task 6
- [x] Error toast on spin failure → Task 6
- [x] Visual reel seed = Date.now() (cosmetic, non-deterministic) → Task 2

**Type consistency check:**
- `SpinReelHandle.start()` defined in Task 4, called as `reelRef.current?.start()` in Task 6 ✓
- `ReelItem` defined in Task 2, consumed in Tasks 3, 4, 5, 6 ✓
- `buildReelData` and `spinResultToReelItem` defined in Task 2, imported in Task 6 ✓
- `WINNER_INDEX` from `constants.ts` (Task 1) used in Tasks 4 and 6 ✓
- `TIER_STYLES` from `tierStyles.ts` (Task 1) used in Tasks 3 and 5 ✓

**No placeholders found.**
