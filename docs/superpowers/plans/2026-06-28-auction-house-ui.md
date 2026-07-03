# Auction House UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Auction House marketplace screen (Browse + My Listings toggle, "+" FAB with two-step ListItemModal) wired to the existing economy store, navigable from FleetScreen via stack push.

**Architecture:** One new screen (`MarketScreen`) holds a segmented control, two `FlatList`-based tab views sharing a `ListingCard` component, and a `Modal`-based bottom sheet (`ListItemModal`) for listing creation. Pure formatting helpers live in `marketStyles.ts` with unit tests. A new RLS migration lets sellers delete their own listings directly (Supabase delete, no Edge Function needed — purchase atomicity is unaffected since the `marketplace-buy` Edge Function runs as `service_role` and bypasses RLS).

**Tech Stack:** React Native, Expo Router, Zustand (`useEconomyStore`), Supabase JS client, TypeScript strict. No new npm packages.

## Global Constraints

- No new npm packages.
- TypeScript strict mode — no `any`.
- Reuse `TIER_STYLES` from `src/ui/spin/tierStyles.ts`.
- Reuse `MARKETPLACE` constants from `src/constants/game.ts`.
- All lint + type-check must pass after each task: `npm run lint && npx tsc --noEmit`.
- Cancel listing uses direct Supabase delete (RLS policy from Task 1 migration).
- Purchases remain atomic via `marketplace-buy` Edge Function.
- Expected test count after this feature: ~57 (51 existing + 6 new in `marketStyles.test.ts`).

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `supabase/migrations/20260628000000_seller_can_delete_listing.sql` | RLS policy: seller can delete own listing |
| Create | `src/ui/fleet/marketStyles.ts` | `formatTimeLeft`, `receivedAfterFee`, `formatItemTypeLabel` pure helpers |
| Create | `src/ui/fleet/marketStyles.test.ts` | Unit tests for the two spec-required helpers |
| Create | `src/ui/fleet/ListingCard.tsx` | Single card for Browse + My Listings tabs |
| Create | `src/ui/fleet/ListItemModal.tsx` | Two-step bottom sheet: item picker → price setter |
| Create | `src/ui/fleet/MarketScreen.tsx` | Main screen: header, segmented control, FAB, modal wiring |
| Create | `app/(tabs)/fleet/market.tsx` | Thin Expo Router route wrapper |
| Modify | `src/stores/useEconomyStore.ts` | Add `inventory: InventoryItem[]` + `fetchInventory()` |
| Modify | `src/ui/fleet/FleetScreen.tsx` | Add "Auction House →" button |
| Modify | `src/ui/fleet/index.ts` | Export `MarketScreen` |

---

## Task 1: DB Migration + Pure Helpers + Tests

**Files:**
- Create: `supabase/migrations/20260628000000_seller_can_delete_listing.sql`
- Create: `src/ui/fleet/marketStyles.ts`
- Create: `src/ui/fleet/marketStyles.test.ts`

**Interfaces:**
- Produces:
  - `formatTimeLeft(expiresAt: string): string` — `"5d 3h left"` | `"2h 14m left"` | `"Expired"`
  - `receivedAfterFee(priceLumens: number): number` — floors `price * (1 - 0.05)`
  - `formatItemTypeLabel(itemType: string): string` — human-readable item type

- [ ] **Step 1: Write the failing tests**

```typescript
// src/ui/fleet/marketStyles.test.ts
import { formatTimeLeft, receivedAfterFee } from './marketStyles';

describe('formatTimeLeft', () => {
  it('returns "Xd Yh left" when more than one day remains', () => {
    const future = new Date(
      Date.now() + 5 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000
    ).toISOString();
    expect(formatTimeLeft(future)).toBe('5d 3h left');
  });

  it('returns "Xh Ym left" when less than one day remains', () => {
    const future = new Date(
      Date.now() + 2 * 60 * 60 * 1000 + 14 * 60 * 1000
    ).toISOString();
    expect(formatTimeLeft(future)).toBe('2h 14m left');
  });

  it('returns "Expired" when date is in the past', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(formatTimeLeft(past)).toBe('Expired');
  });
});

describe('receivedAfterFee', () => {
  it('applies 5% fee correctly', () => {
    expect(receivedAfterFee(500)).toBe(475);
    expect(receivedAfterFee(100)).toBe(95);
  });

  it('floors the result for non-integer amounts', () => {
    // 101 * 0.95 = 95.95 → 95
    expect(receivedAfterFee(101)).toBe(95);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx jest src/ui/fleet/marketStyles.test.ts`
Expected: FAIL with `Cannot find module './marketStyles'`

- [ ] **Step 3: Write the SQL migration**

```sql
-- supabase/migrations/20260628000000_seller_can_delete_listing.sql
CREATE POLICY "seller_can_delete_own_listing"
  ON public.marketplace_listings
  FOR DELETE
  USING (auth.uid() = seller_id);
```

- [ ] **Step 4: Write the helpers**

```typescript
// src/ui/fleet/marketStyles.ts
import { MARKETPLACE } from '@/src/constants/game';

export function formatTimeLeft(expiresAt: string): string {
  const msLeft = new Date(expiresAt).getTime() - Date.now();
  if (msLeft <= 0) return 'Expired';
  const totalMinutes = Math.floor(msLeft / 60_000);
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours >= 24) {
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    return `${days}d ${hours}h left`;
  }
  return `${totalHours}h ${totalMinutes % 60}m left`;
}

export function receivedAfterFee(priceLumens: number): number {
  return Math.floor(priceLumens * (1 - MARKETPLACE.LISTING_FEE_PERCENT));
}

const ITEM_TYPE_LABELS: Record<string, string> = {
  resource_bundle: 'Resource Bundle',
  boost_token: 'Boost Token',
  blueprint: 'Blueprint',
  ship_component: 'Ship Component',
  component_fragment: 'Fragment',
  spin_ticket: 'Spin Ticket',
  cosmetic_skin: 'Cosmetic Skin',
};

export function formatItemTypeLabel(itemType: string): string {
  return ITEM_TYPE_LABELS[itemType] ?? itemType;
}
```

- [ ] **Step 5: Run tests to confirm they pass**

Run: `npx jest src/ui/fleet/marketStyles.test.ts`
Expected: PASS — 6 tests, 2 suites

- [ ] **Step 6: Lint + type-check**

Run: `npm run lint && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 7: Apply migration to live Supabase**

Run: `npx supabase db push`
Expected: output includes `Applying migration 20260628000000_seller_can_delete_listing.sql`

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260628000000_seller_can_delete_listing.sql \
        src/ui/fleet/marketStyles.ts \
        src/ui/fleet/marketStyles.test.ts
git commit -m "feat: add marketplace helpers + seller delete RLS migration"
```

---

## Task 2: Store — inventory slice

**Files:**
- Modify: `src/stores/useEconomyStore.ts`

**Interfaces:**
- Consumes: `InventoryItem` from `@/src/types/inventory` (already imported at line 4)
- Produces: `inventory: InventoryItem[]` and `fetchInventory: () => Promise<void>` on `useEconomyStore`

Note: `fetchInventory` **throws** on Supabase error so callers can `.catch()` for error handling. This follows the same `async () => Promise<void>` signature — a rejected promise is still typed as `Promise<void>`.

- [ ] **Step 1: Add to the EconomyStore interface**

In `src/stores/useEconomyStore.ts`, add two lines to the `EconomyStore` interface (after `buyListing` at line 15):

```typescript
  inventory: InventoryItem[];
  fetchInventory: () => Promise<void>;
```

- [ ] **Step 2: Add initial state**

In the `create<EconomyStore>` call, add `inventory: []` alongside `lumenBalance: 0` (line 20):

```typescript
  inventory: [],
```

- [ ] **Step 3: Implement fetchInventory**

Add this method after `buyListing` (before the closing `})`):

```typescript
  fetchInventory: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data, error } = await supabase
      .from('player_inventory')
      .select('*')
      .eq('player_id', session.user.id)
      .order('acquired_at', { ascending: false });
    if (error) throw new Error(error.message);
    set({ inventory: (data as InventoryItem[]) ?? [] });
  },
```

- [ ] **Step 4: Lint + type-check**

Run: `npm run lint && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add src/stores/useEconomyStore.ts
git commit -m "feat: add inventory slice to useEconomyStore"
```

---

## Task 3: ListingCard component

**Files:**
- Create: `src/ui/fleet/ListingCard.tsx`

**Interfaces:**
- Consumes:
  - `MarketplaceListing` from `@/src/game/economy/types` — fields used: `id`, `sellerId`, `itemType`, `itemData`, `priceLumens`, `expiresAt`
  - `LootTier` from `@/src/game/spin/types`
  - `TIER_STYLES` from `@/src/ui/spin/tierStyles`
  - `formatTimeLeft`, `formatItemTypeLabel` from `./marketStyles`
  - Theme: `COLORS`, `FONT`, `RADIUS`, `SPACING` from `@/src/constants/theme`
- Produces: `<ListingCard>` component

```typescript
interface ListingCardProps {
  listing: MarketplaceListing;
  currentUserId: string;
  lumenBalance: number;
  mode: 'browse' | 'my-listings';
  onAction: (listingId: string) => Promise<{ error?: string }>;
}
```

The card manages its own `busy` and `error` state so each card can show inline errors independently.

- [ ] **Step 1: Write ListingCard.tsx**

```tsx
// src/ui/fleet/ListingCard.tsx
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { MarketplaceListing } from '@/src/game/economy/types';
import type { LootTier } from '@/src/game/spin/types';
import { TIER_STYLES } from '@/src/ui/spin/tierStyles';
import { COLORS, FONT, RADIUS, SPACING } from '@/src/constants/theme';
import { formatItemTypeLabel, formatTimeLeft } from './marketStyles';

interface ListingCardProps {
  listing: MarketplaceListing;
  currentUserId: string;
  lumenBalance: number;
  mode: 'browse' | 'my-listings';
  onAction: (listingId: string) => Promise<{ error?: string }>;
}

export function ListingCard({ listing, currentUserId, lumenBalance, mode, onAction }: ListingCardProps) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isBrowse = mode === 'browse';
  const tier = listing.itemType === 'ship_component'
    ? (listing.itemData.tier as LootTier)
    : null;
  const tierStyle = tier ? TIER_STYLES[tier] : null;

  const actionDisabled = isBrowse
    ? listing.sellerId === currentUserId || lumenBalance < listing.priceLumens || busy
    : busy;

  const handleAction = async () => {
    setError(null);
    setBusy(true);
    const result = await onAction(listing.id);
    setBusy(false);
    if (result?.error) setError(result.error);
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.info}>
          <Text style={styles.label}>{formatItemTypeLabel(listing.itemType)}</Text>
          {tierStyle && (
            <View style={[styles.tierBadge, { borderColor: tierStyle.border }]}>
              <Text style={[styles.tierLabel, { color: tierStyle.border }]}>{tierStyle.label}</Text>
            </View>
          )}
        </View>
        <View style={styles.right}>
          <Text style={styles.price}>⚡ {listing.priceLumens.toLocaleString()} Lumens</Text>
          <Text style={styles.timeLeft}>{formatTimeLeft(listing.expiresAt)}</Text>
          <Pressable
            style={[styles.actionBtn, actionDisabled && styles.actionBtnDisabled]}
            onPress={handleAction}
            disabled={actionDisabled}
          >
            {busy
              ? <ActivityIndicator size="small" color={COLORS.background} />
              : <Text style={styles.actionBtnText}>{isBrowse ? 'Buy' : 'Cancel'}</Text>
            }
          </Pressable>
        </View>
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  info: { flex: 1, gap: SPACING.xs },
  label: { color: COLORS.text, fontSize: FONT.sm, fontWeight: '600' },
  tierBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
  },
  tierLabel: { fontSize: 11, fontWeight: '700' },
  right: { alignItems: 'flex-end', gap: SPACING.xs },
  price: { color: COLORS.accent, fontSize: FONT.sm, fontWeight: '600' },
  timeLeft: { color: COLORS.muted, fontSize: 12 },
  actionBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    minWidth: 64,
    alignItems: 'center',
  },
  actionBtnDisabled: { opacity: 0.4 },
  actionBtnText: { color: COLORS.background, fontSize: FONT.sm, fontWeight: '700' },
  errorText: { color: COLORS.danger, fontSize: 12, marginTop: SPACING.xs },
});
```

- [ ] **Step 2: Lint + type-check**

Run: `npm run lint && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/ui/fleet/ListingCard.tsx
git commit -m "feat: add ListingCard component"
```

---

## Task 4: ListItemModal (two-step bottom sheet)

**Files:**
- Create: `src/ui/fleet/ListItemModal.tsx`

**Interfaces:**
- Consumes:
  - `useEconomyStore` — reads `inventory`, `fetchInventory`, `listItem`, `activeListings.length`
  - `InventoryItem` from `@/src/types/inventory` — fields: `id`, `itemType`, `itemData`, `quantity`, `isSoulBound`
  - `LootTier` from `@/src/game/spin/types`
  - `TIER_STYLES` from `@/src/ui/spin/tierStyles`
  - `MARKETPLACE` from `@/src/constants/game`
  - `formatItemTypeLabel`, `receivedAfterFee` from `./marketStyles`
  - Theme: `COLORS`, `FONT`, `RADIUS`, `SPACING` from `@/src/constants/theme`
- Produces: `<ListItemModal>` component

```typescript
interface ListItemModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;  // called after successful listing; parent switches to My Listings tab
}
```

- [ ] **Step 1: Write ListItemModal.tsx**

```tsx
// src/ui/fleet/ListItemModal.tsx
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import type { InventoryItem } from '@/src/types/inventory';
import type { LootTier } from '@/src/game/spin/types';
import { useEconomyStore } from '@/src/stores/useEconomyStore';
import { TIER_STYLES } from '@/src/ui/spin/tierStyles';
import { MARKETPLACE } from '@/src/constants/game';
import { COLORS, FONT, RADIUS, SPACING } from '@/src/constants/theme';
import { formatItemTypeLabel, receivedAfterFee } from './marketStyles';

interface ListItemModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ListItemModal({ visible, onClose, onSuccess }: ListItemModalProps) {
  const { inventory, fetchInventory, listItem } = useEconomyStore();
  const [step, setStep] = React.useState<1 | 2>(1);
  const [selectedItem, setSelectedItem] = React.useState<InventoryItem | null>(null);
  const [priceInput, setPriceInput] = React.useState('');
  const [loadingInventory, setLoadingInventory] = React.useState(false);
  const [inventoryError, setInventoryError] = React.useState<string | null>(null);
  const [listingBusy, setListingBusy] = React.useState(false);
  const [listingError, setListingError] = React.useState<string | null>(null);

  const loadInventory = React.useCallback(() => {
    setLoadingInventory(true);
    setInventoryError(null);
    fetchInventory()
      .catch(() => setInventoryError('Failed to load inventory. Tap Retry.'))
      .finally(() => setLoadingInventory(false));
  }, [fetchInventory]);

  React.useEffect(() => {
    if (visible) loadInventory();
  }, [visible]);

  const reset = () => {
    setStep(1);
    setSelectedItem(null);
    setPriceInput('');
    setListingError(null);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleBack = () => {
    if (step === 2) {
      setStep(1);
      setPriceInput('');
      setListingError(null);
    } else {
      handleClose();
    }
  };

  const handleSelectItem = (item: InventoryItem) => {
    setSelectedItem(item);
    setStep(2);
  };

  const handleConfirm = async () => {
    if (!selectedItem) return;
    const price = parseInt(priceInput, 10);
    setListingBusy(true);
    setListingError(null);
    const result = await listItem(selectedItem, price);
    setListingBusy(false);
    if (result.error) { setListingError(result.error); return; }
    reset();
    onSuccess();
    Alert.alert('Listed!', 'Your item is now on the auction house.');
  };

  const price = parseInt(priceInput, 10);
  const received = !isNaN(price) && price > 0 ? receivedAfterFee(price) : null;
  const feePercent = Math.round(MARKETPLACE.LISTING_FEE_PERCENT * 100);
  const confirmDisabled = listingBusy || !priceInput || isNaN(price) || price <= 0;

  const tradeable = inventory.filter(i => !i.isSoulBound);
  const soulBound = inventory.filter(i => i.isSoulBound);
  const allItems = [...tradeable, ...soulBound];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.container}>
        <TouchableWithoutFeedback onPress={handleClose}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
        <KeyboardAvoidingView
          style={styles.sheet}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={handleBack} style={styles.backBtn}>
              <Text style={styles.backText}>← Back</Text>
            </Pressable>
            <Text style={styles.headerTitle}>{step === 1 ? 'Select Item' : 'Set Price'}</Text>
            <View style={styles.backBtn} />
          </View>

          {/* Step 1: Item Picker */}
          {step === 1 && (
            loadingInventory ? (
              <ActivityIndicator color={COLORS.primary} style={styles.centered} />
            ) : inventoryError ? (
              <View style={styles.centered}>
                <Text style={styles.errorText}>{inventoryError}</Text>
                <Pressable onPress={loadInventory}>
                  <Text style={styles.retryText}>Retry</Text>
                </Pressable>
              </View>
            ) : allItems.length === 0 ? (
              <View style={styles.centered}>
                <Text style={styles.emptyText}>
                  Nothing to list — earn tradeable items from Spin and raids.
                </Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={styles.list}>
                {allItems.map(item => {
                  const tier = item.itemType === 'ship_component'
                    ? (item.itemData.tier as LootTier)
                    : null;
                  const tierStyle = tier ? TIER_STYLES[tier] : null;
                  return (
                    <Pressable
                      key={item.id}
                      style={[styles.inventoryRow, item.isSoulBound && styles.soulBoundRow]}
                      onPress={() => !item.isSoulBound && handleSelectItem(item)}
                      disabled={item.isSoulBound}
                    >
                      <View style={styles.inventoryInfo}>
                        <Text style={[styles.inventoryLabel, item.isSoulBound && styles.mutedText]}>
                          {item.isSoulBound ? '🔒 ' : ''}{formatItemTypeLabel(item.itemType)}
                        </Text>
                        {tierStyle && (
                          <View style={[styles.tierBadge, { borderColor: tierStyle.border }]}>
                            <Text style={[styles.tierLabel, { color: tierStyle.border }]}>
                              {tierStyle.label}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.quantityText, item.isSoulBound && styles.mutedText]}>
                        ×{item.quantity}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )
          )}

          {/* Step 2: Price Setter */}
          {step === 2 && (
            <View style={styles.priceSetter}>
              {selectedItem && (
                <View style={styles.selectedSummary}>
                  <Text style={styles.selectedLabel}>{formatItemTypeLabel(selectedItem.itemType)}</Text>
                </View>
              )}
              <TextInput
                style={styles.priceInput}
                placeholder="Price in Lumens"
                placeholderTextColor={COLORS.muted}
                keyboardType="numeric"
                value={priceInput}
                onChangeText={setPriceInput}
              />
              {received !== null && (
                <Text style={styles.feePreview}>
                  {feePercent}% fee — you receive {received.toLocaleString()} Lumens
                </Text>
              )}
              {listingError && <Text style={styles.errorText}>{listingError}</Text>}
              <Pressable
                style={[styles.confirmBtn, confirmDisabled && styles.confirmBtnDisabled]}
                onPress={handleConfirm}
                disabled={confirmDisabled}
              >
                {listingBusy
                  ? <ActivityIndicator size="small" color={COLORS.background} />
                  : <Text style={styles.confirmBtnText}>Confirm</Text>
                }
              </Pressable>
            </View>
          )}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { flex: 1, backgroundColor: '#00000080' },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    maxHeight: '75%',
    paddingBottom: SPACING.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: { width: 60 },
  backText: { color: COLORS.primary, fontSize: FONT.sm },
  headerTitle: { color: COLORS.text, fontSize: FONT.md, fontWeight: '700' },
  centered: { padding: SPACING.xl, alignItems: 'center', gap: SPACING.sm },
  emptyText: { color: COLORS.muted, textAlign: 'center', fontSize: FONT.sm },
  errorText: { color: COLORS.danger, fontSize: FONT.sm, textAlign: 'center' },
  retryText: { color: COLORS.primary, fontSize: FONT.sm },
  list: { padding: SPACING.md, gap: SPACING.sm },
  inventoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
  },
  soulBoundRow: { opacity: 0.5 },
  inventoryInfo: { gap: SPACING.xs },
  inventoryLabel: { color: COLORS.text, fontSize: FONT.sm },
  mutedText: { color: COLORS.muted },
  tierBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
  },
  tierLabel: { fontSize: 11, fontWeight: '700' },
  quantityText: { color: COLORS.accent, fontSize: FONT.sm },
  priceSetter: { padding: SPACING.lg, gap: SPACING.md },
  selectedSummary: { backgroundColor: COLORS.background, borderRadius: RADIUS.sm, padding: SPACING.sm },
  selectedLabel: { color: COLORS.text, fontSize: FONT.sm, fontWeight: '600' },
  priceInput: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    color: COLORS.text,
    fontSize: FONT.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  feePreview: { color: COLORS.muted, fontSize: FONT.sm },
  confirmBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
  },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmBtnText: { color: COLORS.background, fontSize: FONT.md, fontWeight: '700' },
});
```

- [ ] **Step 2: Lint + type-check**

Run: `npm run lint && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/ui/fleet/ListItemModal.tsx
git commit -m "feat: add ListItemModal two-step bottom sheet"
```

---

## Task 5: MarketScreen + route + wiring

**Files:**
- Create: `src/ui/fleet/MarketScreen.tsx`
- Create: `app/(tabs)/fleet/market.tsx`
- Modify: `src/ui/fleet/FleetScreen.tsx`
- Modify: `src/ui/fleet/index.ts`

**Interfaces:**
- Consumes:
  - `useEconomyStore` — `lumenBalance`, `fetchBalance`, `marketplaceListings`, `fetchMarketplace`, `activeListings`, `fetchMyListings`, `buyListing`
  - `supabase` from `@/src/services/supabase` — for direct cancel delete + auth session
  - `MarketplaceListing` from `@/src/game/economy/types`
  - `MARKETPLACE` from `@/src/constants/game`
  - `ListingCard` from `./ListingCard`
  - `ListItemModal` from `./ListItemModal`
  - Theme constants
- Produces:
  - `MarketScreen` component (exported via barrel)
  - `/fleet/market` route

- [ ] **Step 1: Write MarketScreen.tsx**

```tsx
// src/ui/fleet/MarketScreen.tsx
import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/src/services/supabase';
import type { MarketplaceListing } from '@/src/game/economy/types';
import { useEconomyStore } from '@/src/stores/useEconomyStore';
import { MARKETPLACE } from '@/src/constants/game';
import { COLORS, FONT, RADIUS, SPACING } from '@/src/constants/theme';
import { ListingCard } from './ListingCard';
import { ListItemModal } from './ListItemModal';

type Tab = 'browse' | 'my-listings';

export function MarketScreen() {
  const {
    lumenBalance, fetchBalance,
    marketplaceListings, fetchMarketplace,
    activeListings, fetchMyListings,
    buyListing,
  } = useEconomyStore();

  const [currentUserId, setCurrentUserId] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<Tab>('browse');
  const [refreshing, setRefreshing] = React.useState(false);
  const [browseError, setBrowseError] = React.useState<string | null>(null);
  const [modalVisible, setModalVisible] = React.useState(false);

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUserId(session?.user.id ?? null);
    });
    fetchBalance();
    fetchMarketplace().catch(() => setBrowseError('Failed to load listings.'));
    fetchMyListings();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    if (tab === 'browse') {
      setBrowseError(null);
      await fetchMarketplace().catch(() => setBrowseError('Failed to load listings.'));
      await fetchBalance();
    } else {
      await fetchMyListings();
    }
    setRefreshing(false);
  };

  const handleBuy = async (listingId: string): Promise<{ error?: string }> => {
    return buyListing(listingId);
  };

  const handleCancel = async (listingId: string): Promise<{ error?: string }> => {
    const { error } = await supabase.from('marketplace_listings').delete().eq('id', listingId);
    if (error) return { error: error.message };
    await fetchMyListings();
    return {};
  };

  const handleRetryBrowse = () => {
    setBrowseError(null);
    fetchMarketplace().catch(() => setBrowseError('Failed to load listings.'));
  };

  const renderListing = ({ item }: { item: MarketplaceListing }) => (
    <ListingCard
      listing={item}
      currentUserId={currentUserId ?? ''}
      lumenBalance={lumenBalance}
      mode={tab}
      onAction={tab === 'browse' ? handleBuy : handleCancel}
    />
  );

  const listings = tab === 'browse' ? marketplaceListings : activeListings;
  const emptyText = tab === 'browse'
    ? 'No listings yet — be the first to sell!'
    : 'You have no active listings.';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Auction House</Text>
        <View style={styles.balanceChip}>
          <Text style={styles.balanceText}>⚡ {lumenBalance.toLocaleString()}</Text>
        </View>
      </View>

      {/* Segmented Control */}
      <View style={styles.segmented}>
        {(['browse', 'my-listings'] as Tab[]).map(t => (
          <Pressable
            key={t}
            style={[styles.segment, tab === t && styles.segmentActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.segmentText, tab === t && styles.segmentTextActive]}>
              {t === 'browse' ? 'Browse' : 'My Listings'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Active listing count (My Listings tab only) */}
      {tab === 'my-listings' && (
        <Text style={styles.listingCount}>
          {activeListings.length} / {MARKETPLACE.MAX_ACTIVE_LISTINGS} active listings
        </Text>
      )}

      {/* Browse fetch error */}
      {tab === 'browse' && browseError && (
        <View style={styles.errorRow}>
          <Text style={styles.errorText}>{browseError}</Text>
          <Pressable onPress={handleRetryBrowse}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {/* Listings */}
      <FlatList
        data={listings}
        keyExtractor={item => item.id}
        renderItem={renderListing}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !browseError ? <Text style={styles.emptyText}>{emptyText}</Text> : null
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.primary}
          />
        }
      />

      {/* FAB */}
      <Pressable style={styles.fab} onPress={() => setModalVisible(true)}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      <ListItemModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSuccess={() => {
          setModalVisible(false);
          setTab('my-listings');
          fetchMyListings();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  title: { color: COLORS.text, fontSize: FONT.xl, fontWeight: '700' },
  balanceChip: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  balanceText: { color: COLORS.accent, fontSize: FONT.sm, fontWeight: '700' },
  segmented: {
    flexDirection: 'row',
    marginHorizontal: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: 4,
  },
  segment: { flex: 1, paddingVertical: SPACING.xs, alignItems: 'center', borderRadius: RADIUS.sm },
  segmentActive: { backgroundColor: COLORS.primary },
  segmentText: { color: COLORS.muted, fontSize: FONT.sm, fontWeight: '600' },
  segmentTextActive: { color: COLORS.background },
  listingCount: {
    color: COLORS.muted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  errorRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  errorText: { color: COLORS.danger, fontSize: FONT.sm },
  retryText: { color: COLORS.primary, fontSize: FONT.sm },
  list: { padding: SPACING.lg, paddingBottom: 80 },
  emptyText: { color: COLORS.muted, textAlign: 'center', paddingTop: SPACING.xl },
  fab: {
    position: 'absolute',
    bottom: SPACING.xl,
    right: SPACING.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fabText: { color: COLORS.background, fontSize: FONT.lg, fontWeight: '700', lineHeight: 28 },
});
```

- [ ] **Step 2: Write the route file**

```tsx
// app/(tabs)/fleet/market.tsx
import { MarketScreen } from '@/src/ui/fleet';

export default function MarketRoute() {
  return <MarketScreen />;
}
```

- [ ] **Step 3: Add "Auction House →" button to FleetScreen**

In `src/ui/fleet/FleetScreen.tsx`, add the import for `TouchableOpacity` (or `Pressable`) and the button after `ShipCard`. Full updated file:

```tsx
// src/ui/fleet/FleetScreen.tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { COLORS, FONT, SPACING, RADIUS } from '@/src/constants/theme';
import { ShipCard } from './ShipCard';
import { useShipStore } from '@/src/stores/useShipStore';
import type { ComponentSlot } from '@/src/game/ships/types';

const SLOT_ORDER: ComponentSlot[] = ['hull', 'weapons', 'shields', 'engine'];

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function FleetScreen() {
  const router = useRouter();
  const equippedComponents = useShipStore(s => s.equippedComponents);

  const tierSummary = SLOT_ORDER
    .map(slot => {
      const c = equippedComponents[slot];
      return c ? capitalize(c.tier) : '-';
    })
    .join(' · ');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        <Text style={styles.title}>Ship Fleet</Text>
        <ShipCard
          name="Your Ship"
          subtitle={tierSummary}
          onPress={() => router.push('/fleet/player-ship')}
        />
        <Pressable style={styles.marketBtn} onPress={() => router.push('/fleet/market')}>
          <Text style={styles.marketBtnText}>Auction House →</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1, paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, gap: SPACING.lg },
  title: { color: COLORS.text, fontSize: FONT.xl, fontWeight: '700' },
  marketBtn: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
  },
  marketBtnText: { color: COLORS.primary, fontSize: FONT.sm, fontWeight: '700' },
});
```

- [ ] **Step 4: Update the barrel export**

Replace `src/ui/fleet/index.ts` with:

```typescript
export * from './FleetScreen';
export * from './LoadoutScreen';
export * from './MarketScreen';
```

- [ ] **Step 5: Run all tests**

Run: `npx jest`
Expected: ~57 tests pass, 0 failures

- [ ] **Step 6: Lint + type-check**

Run: `npm run lint && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add src/ui/fleet/MarketScreen.tsx \
        app/(tabs)/fleet/market.tsx \
        src/ui/fleet/FleetScreen.tsx \
        src/ui/fleet/index.ts
git commit -m "feat: add MarketScreen, route, and Auction House button on FleetScreen"
```

---

## Self-Review

### Spec coverage

| Spec requirement | Task |
|---|---|
| RLS migration for seller delete | Task 1 |
| `formatTimeLeft` + `receivedAfterFee` helpers + tests | Task 1 |
| `useEconomyStore.inventory` + `fetchInventory` | Task 2 |
| `ListingCard` — Buy/Cancel, tier badge, time left, price, disabled states | Task 3 |
| `ListItemModal` — item picker, soul-bound greyed/locked, step 2 price setter | Task 4 |
| `ListItemModal` — fee preview, confirm, success Alert, inline error | Task 4 |
| `ListItemModal` — inventory error state + retry | Task 4 |
| `MarketScreen` — header with Lumen balance chip | Task 5 |
| `MarketScreen` — Browse / My Listings toggle | Task 5 |
| `MarketScreen` — active listing count below toggle | Task 5 |
| `MarketScreen` — Browse error + retry | Task 5 |
| `MarketScreen` — pull-to-refresh | Task 5 |
| `MarketScreen` — FAB → opens modal, switches tab on success | Task 5 |
| `app/(tabs)/fleet/market.tsx` route | Task 5 |
| `FleetScreen` "Auction House →" button | Task 5 |
| Barrel export | Task 5 |
| Empty states (Browse + My Listings) | Task 5 (MarketScreen renders them via `ListEmptyComponent`) |
| Cancel listing — direct Supabase delete | Task 5 (`handleCancel` in MarketScreen) |

No gaps found.

### Placeholder scan

No TBDs, no "similar to Task N", no missing code blocks.

### Type consistency

- `ListingCard.onAction: (listingId: string) => Promise<{ error?: string }>` — matches `handleBuy` and `handleCancel` signatures in Task 5.
- `ListItemModal.onSuccess: () => void` — called in Task 5 as `() => { setModalVisible(false); setTab('my-listings'); fetchMyListings(); }`. ✓
- `formatTimeLeft`, `receivedAfterFee`, `formatItemTypeLabel` — imported in Tasks 3, 4, 5 exactly as exported in Task 1. ✓
- `inventory: InventoryItem[]` added in Task 2, consumed in Task 4 via `useEconomyStore`. ✓
