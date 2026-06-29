# Auction House UI — Design Spec

**Date:** 2026-06-28
**Status:** Approved

---

## Overview

A marketplace screen where players browse listings, buy items with Lumens, manage their own listings, and post new items for sale. Lives under the Ship Fleet tab as a stack-pushed screen from FleetScreen.

---

## Navigation

- **Entry point:** "Auction House →" button on `FleetScreen` pushes `app/(tabs)/fleet/market.tsx`
- **Stack:** `app/(tabs)/fleet/_layout.tsx` already defines a Stack — no layout changes needed
- **Back:** Standard stack back button returns to FleetScreen

---

## File Structure

**Create:**
```
src/ui/fleet/marketStyles.ts          — listing card color helpers + time-left formatter
src/ui/fleet/marketStyles.test.ts     — unit tests for pure helpers
src/ui/fleet/ListingCard.tsx          — single card (Browse and My Listings share this)
src/ui/fleet/ListItemModal.tsx        — two-step bottom sheet: item picker → price setter
src/ui/fleet/MarketScreen.tsx         — main screen (toggle + FAB + modal wiring)
app/(tabs)/fleet/market.tsx           — thin route wrapper
```

**Modify:**
```
src/stores/useEconomyStore.ts         — add inventory: InventoryItem[] + fetchInventory()
src/ui/fleet/FleetScreen.tsx          — add "Auction House →" button
src/ui/fleet/index.ts                 — export MarketScreen
```

---

## Store Changes

`useEconomyStore` gains two additions:

```typescript
inventory: InventoryItem[];
fetchInventory: () => Promise<void>;
```

`fetchInventory` queries `player_inventory` filtered to the authenticated player, ordered by `acquired_at` descending. All other store methods (`listItem`, `buyListing`, `fetchMarketplace`, `fetchMyListings`, `fetchBalance`) are already implemented.

---

## MarketScreen

### Header
- Title: "Auction House"
- Right side: Lumen balance chip — `⚡ 1,250` — sourced from `lumenBalance` in store, fetched on mount

### Segmented Control
Two segments: **Browse** | **My Listings**. Standard toggle — active segment highlighted with `COLORS.primary`.

### Browse Tab
FlatList of `ListingCard` (all active marketplace listings from `fetchMarketplace()`).

Each card shows:
- Item type label (human-readable, e.g. "Ship Component", "Boost Token")
- Tier badge if `itemType === 'ship_component'` — reuses `TIER_STYLES`
- Price: `⚡ 500 Lumens`
- Time remaining: `5d 3h left` (derived from `expiresAt`)
- **Buy** button — disabled if `listing.sellerId === currentUserId` or `lumenBalance < listing.priceLumens`; calls `buyListing(listingId)` then refreshes balance + marketplace

Empty state: "No listings yet — be the first to sell!"

Pull-to-refresh re-runs `fetchMarketplace()`.

### My Listings Tab
FlatList of `ListingCard` for the player's own listings (`fetchMyListings()`).

Same card layout but **Cancel** button instead of Buy. Cancel calls a direct Supabase delete on the listing row then re-runs `fetchMyListings()`. Requires a new migration (`20260628000000_seller_can_delete_listing.sql`) adding `FOR DELETE USING (auth.uid() = seller_id)` to `marketplace_listings` — the existing policy only allows service_role deletes. The purchase Edge Function runs as service_role and bypasses RLS, so there is no race condition risk.

Active listing count shown below the toggle: `2 / 5 active listings`.

Empty state: "You have no active listings."

### Floating "+" FAB
Fixed position, bottom-right, always visible regardless of active tab. Opens `ListItemModal` as a bottom sheet. Tapping opens the modal; after successful listing, switches to My Listings tab.

---

## ListItemModal

Bottom sheet modal, two steps.

### Step 1 — Item Picker
- Fetches `inventory` from store (`fetchInventory()` on open if not already loaded)
- Scrollable list of inventory items
- Each row: item type label, quantity, tier badge if component
- Soul-bound items: greyed out, lock icon `🔒`, not selectable
- Tapping a selectable row advances to Step 2
- If inventory is empty or all items are soul-bound: "Nothing to list — earn tradeable items from Spin and raids."

### Step 2 — Price Setter
- Shows selected item summary at top
- Numeric input for Lumen price (keyboard type `numeric`)
- Live fee preview: `"5% fee — you receive X Lumens"` updates as user types
- **Confirm** button: calls `listItem(item, price)`
  - On success: modal closes, My Listings tab refreshes, `Alert.alert('Listed!', 'Your item is now on the auction house.')` shown
  - On error: inline error text below input, modal stays open
- Back arrow in modal header returns to Step 1

### Dismissal
- Tapping backdrop dismisses entirely
- Back button in header (Step 2 → Step 1, Step 1 → dismiss)

---

## Pure Logic Helpers (`marketStyles.ts`)

Two exported pure functions, both unit-tested:

```typescript
formatTimeLeft(expiresAt: string): string
// "5d 3h left" | "2h 14m left" | "Expired"

receivedAfterFee(priceLumens: number): number
// Math.floor(price * (1 - MARKETPLACE.LISTING_FEE_PERCENT))
```

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| `fetchMarketplace` fails | Inline error + retry button on Browse tab |
| `buyListing` fails | Toast/inline error; balance not deducted (atomic Edge Function) |
| `listItem` validation fails | Inline error in modal (soul-bound, max listings, price ≤ 0) |
| `fetchInventory` fails | Modal shows error state + retry |
| Cancel listing fails | Inline error on My Listings card |

---

## Testing

Pure logic in `marketStyles.ts` is unit-tested (consistent with Spin/Fleet pattern). Components are not render-tested.

**`marketStyles.test.ts` cases:**
- `formatTimeLeft`: future > 1 day → "Xd Yh left"; future < 1 day → "Xh Ym left"; past → "Expired"
- `receivedAfterFee`: correctly applies 5% fee; floors result

**Expected test count after this feature:** 51 existing + ~6 new = ~57 total

---

## Constraints

- No new npm packages
- Reuse `TIER_STYLES` from `src/ui/spin/tierStyles.ts`
- Reuse `MARKETPLACE` constants from `src/constants/game.ts`
- TypeScript strict mode — no `any`
- Cancel listing uses direct Supabase delete (RLS allows seller to delete own listing per migration policy)
- All lint + type-check must pass after each task
