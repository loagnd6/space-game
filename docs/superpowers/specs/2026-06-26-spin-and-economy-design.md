# Spin System & Player Economy Design
**Date:** 2026-06-26  
**Status:** Approved  
**Scope:** Daily Spin wheel + Auction House economy using Lumens currency

---

## Overview

Two interlocking systems that add a gambling hook (spin wheel) and a player-driven economy (auction house). Both are built on the hybrid server-authoritative architecture: spin results and Lumen balances are resolved server-side via Supabase Edge Functions; auction house integrity is enforced through Supabase RLS and DB constraints.

---

## 1. Spin System

### 1.1 Spin Types

| Type | Recharge | Cost | Cap |
|------|----------|------|-----|
| Free Spin | Every 4 hours | Free | 6/day if fully active |
| Spin Ticket | Earned in-game | N/A | No cap |
| Premium Spin | N/A | Real money (direct purchase) | 1 per day, server-enforced |

- **Free Spin** recharges on a 4-hour timer server-side. Client displays countdown.
- **Spin Tickets** drop from raids, daily missions, and seasonal rewards. Stored in player inventory. Fully tradeable on the auction house.
- **Premium Spin** is a direct one-time daily IAP (no middle currency). Soul-bound — cannot be traded or gifted.

### 1.2 Loot Table

| Tier | Weight | Examples |
|------|--------|---------|
| Common | 60% | Small resource bundles (Ore ×500, Crystal ×200, Gas ×150, Water ×100) |
| Uncommon | 25% | Boost Tokens, medium resource bundles, ship part fragments |
| Rare | 12% | Full Blueprints, large resource bundles, multi-Boost drops |
| Legendary | 3% | Spin-exclusive cosmetic skins (tradeable), rare complete ship parts |

### 1.3 Pity System

- Every 50 spins without a Legendary guarantees the next spin is Legendary.
- Pity counter is tracked server-side per player and resets on each Legendary drop.
- Counter is shared across Free, Ticket, and Premium spins — all spins count toward pity.

### 1.4 Spin Resolution Flow

```
Client taps Spin
  → POST /spin (Edge Function)
    → Validate spin availability (free timer / ticket in inventory / daily premium cap)
    → Roll result: SeededRNG + weighted loot table + pity counter
    → Update pity counter
    → Insert item into player inventory (DB transaction)
    → Return { tier, item, pityCount }
  → Client plays wheel animation
  → Wheel lands on returned item
```

The client never knows the result before the server returns it. Animation plays against the server response, not a pre-rolled client result.

### 1.5 Supabase Tables

```sql
spin_state         — player_id, free_spin_available_at, premium_spin_used_date, pity_counter
spin_history       — id, player_id, spin_type, tier, item_type, item_id, spun_at
```

---

## 2. Economy & Auction House

### 2.1 Currency: Lumens

Lumens are the sole marketplace currency. They are:
- **Earned through gameplay only** — never purchasable directly with real money
- **Server-side only** — client never writes to the Lumen balance directly
- Every change appended to `lumen_ledger` for audit/anti-cheat

**Lumen sources:**
| Source | Amount (tunable in `src/constants/game.ts`) |
|--------|---------------------------------------------|
| Winning a raid | 50–200 Lumens (scales with defender strength) |
| Daily missions | 25–100 Lumens per mission |
| Auction house sale | Sale price minus 5% fee |
| Seasonal placement bonus | 500–2000 Lumens at season end |

### 2.2 Tradeable vs. Soul-Bound

| Item | Tradeable |
|------|-----------|
| Resources (Ore, Crystal, Gas, Water) | ✅ |
| Boost Tokens | ✅ |
| Blueprints | ✅ |
| Ship parts / fragments | ✅ |
| Spin Tickets | ✅ |
| Spin-won cosmetic skins | ✅ |
| Seasonal reward cosmetics (Gold/Silver/Bronze) | ❌ Soul-bound |
| Hall of Fame cosmetics | ❌ Soul-bound |
| Premium Spin (IAP) | ❌ Soul-bound |

### 2.3 Auction House Mechanics

- Players list any tradeable item at a fixed Lumen price they set.
- Listings expire after **7 days**. Unsold items return to seller inventory automatically.
- **5% Lumen fee** deducted from seller on successful sale (currency sink to slow inflation).
- **Max 5 active listings per player** at any time (prevents spam).
- Purchases are atomic: buyer Lumens deducted + item transferred in a single DB transaction. No partial states possible.
- Seller receives Lumens immediately on purchase (minus fee).

### 2.4 Auction House Flow

```
Seller lists item
  → POST /marketplace/list (RLS-validated)
    → Check: item in seller inventory, under listing cap
    → Insert into marketplace_listings
    → Remove item from seller inventory

Buyer purchases listing
  → POST /marketplace/buy (Edge Function — atomic)
    → Validate buyer Lumen balance ≥ price
    → Deduct Lumens from buyer
    → Credit Lumens to seller (minus 5% fee)
    → Transfer item to buyer inventory
    → Delete listing
    → Append to lumen_ledger (both sides)

Expiry (Supabase scheduled function / cron)
  → Find listings where expires_at < now()
  → Return items to seller inventory
  → Delete expired listings
```

### 2.5 Supabase Tables

```sql
player_lumens        — player_id, balance  (never client-writable; RLS: read own only)
lumen_ledger         — id, player_id, delta, reason, related_id, created_at  (append-only)
marketplace_listings — id, seller_id, item_type, item_data jsonb, price_lumens, listed_at, expires_at
```

---

## 3. Integration with Existing Systems

- **Raids** → drop Lumens + chance of Spin Ticket reward
- **Daily missions** (new system, not yet designed) → primary Lumen + Spin Ticket source
- **Seasonal rewards** → Lumen bonus at season end; Gold/Silver/Bronze cosmetics soul-bound
- **Inventory** → single `player_inventory` table backing spin drops, marketplace transfers, and resource storage
- **`src/constants/game.ts`** → all tunable values: loot weights, Lumen drop amounts, pity threshold (50), listing cap (5), fee (5%), listing duration (7 days)

---

## 4. What's Not In Scope

- Bidding / auction countdown (fixed price only for v1)
- Player-to-player direct trades (auction house only for v1)
- Daily missions system (referenced as Lumen source but designed separately)
- IAP integration / app store payment flow (separate implementation)
