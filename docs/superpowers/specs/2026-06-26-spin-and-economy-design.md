# Spin System, Player Economy & Ship Components Design
**Date:** 2026-06-26  
**Status:** Approved  
**Scope:** Daily Spin wheel + Auction House economy (Lumens) + Ship component system

---

## Overview

Three interlocking systems: a spin wheel (gambling hook), a player-driven auction house economy (Lumens currency), and a ship component system (4 slots × 5 tiers). All built on the hybrid server-authoritative architecture — spin results and Lumen balances are resolved server-side via Supabase Edge Functions; auction house integrity is enforced through Supabase RLS and DB constraints.

---

## 1. Spin System

### 1.1 Spin Types

| Type | Recharge | Cost | Cap |
|------|----------|------|-----|
| Free Spin | Every 4 hours | Free | 6/day if fully active |
| Spin Ticket | Earned in-game | N/A | No cap |
| Premium Spin | N/A | Real money (direct purchase) | 1 per day, server-enforced |

- **Free Spin** recharges on a 4-hour timer server-side. Client displays countdown.
- **Spin Tickets** are rare — a dedicated player earns a few per week. Sources: occasional raid drop (~10% chance per win), rare daily mission reward (not every mission), exploration milestones, and a small seasonal bonus. Stored in player inventory. Fully tradeable on the auction house — their scarcity gives them real Lumen value.
- **Premium Spin** is a direct one-time daily IAP (no middle currency). Soul-bound — cannot be traded or gifted.

### 1.2 Loot Table

| Tier | Weight | Examples |
|------|--------|---------|
| Common | 60% | Small resource bundles (Ore ×500, Crystal ×200, Gas ×150, Water ×100) |
| Uncommon | 25% | Boost Tokens, medium resource bundles, ship part fragments |
| Rare | 12% | Blueprints, large resource bundles, multi-Boost drops, Rare ship components |
| Legendary | 2.5% | Spin-exclusive cosmetic skins (tradeable), Legendary ship components |
| Ultra-Rare | 0.5% | Ultra-Rare ship components (unique abilities, see Section 3) |

Total: 100%

### 1.3 Pity System

- Every 50 spins without a Legendary or better guarantees the next spin is Legendary or better.
- Pity counter tracked server-side per player, resets on any Legendary or Ultra-Rare drop.
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
spin_state    — player_id, free_spin_available_at, premium_spin_used_date, pity_counter
spin_history  — id, player_id, spin_type, tier, item_type, item_id, spun_at
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
| Blueprints (planet buildings) | ❌ Soul-bound |
| Ship components (all tiers) | ✅ |
| Ship part fragments | ✅ |
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

## 3. Ship Component System

### 3.1 Overview

Every player starts with a base ship equipped with Common-tier components in all 4 slots. Ships and their components **carry over season to season** — players keep their collection permanently. Balance between veterans and new players is managed through matchmaking brackets and territory mechanics, not seasonal resets.

Ultra-Rare components are strong but not unbeatable. A well-composed full Legendary build (4 Legendary parts with good slot synergy) beats a mixed Ultra-Rare build (1 Ultra-Rare + 2 Rares + 1 Common). Build composition matters as much as tier.

Live balancing (buffs/nerfs to ability values) is the tuning mechanism if Ultra-Rare components become dominant in practice.

### 3.2 Component Slots

| Slot | Role |
|------|------|
| Hull | HP pool and damage mitigation |
| Weapons | Attack damage and fire rate |
| Shields | Damage absorption before hull takes hits |
| Engine | Speed, initiative, and maneuverability |

### 3.3 Component Tiers

| Tier | Stat Multiplier | Unique Ability | How Obtained |
|------|----------------|----------------|--------------|
| Common | 1.0x | None | Base ship (everyone starts here) |
| Uncommon | 1.3x | None | Spin (fragments — combine 3 to build one) |
| Rare | 1.7x | None | Spin drop / Auction House |
| Legendary | 2.2x | None | Spin drop (2.5%) / Auction House |
| Ultra-Rare | 2.5x | Yes (see below) | Spin drop (0.5%) / Auction House |

Uncommon fragments: 3 fragments of the same slot combine into one Uncommon component. Fragments are tradeable individually.

### 3.4 Ultra-Rare Abilities

Each slot has exactly one Ultra-Rare component variant with a unique ability. Ability values are stored in `src/constants/game.ts` for live tuning without a code deploy.

| Slot | Name | Ability |
|------|------|---------|
| Hull | **Iron Tomb** | Immune to all opponent ability effects — once per battle. After the block triggers, Iron Tomb becomes a standard 2.5x hull for the remainder of that battle. |
| Weapons | **Phase Cannon** | Each shot has a 20% chance to bypass shields entirely and deal damage directly to the enemy hull. |
| Engine | **Overdrive** | At battle start, sacrifice 10% of own HP to deal an immediate burst of damage to the opponent before normal combat begins. |
| Shields | **Echo Shell** | Reflects 15% of incoming damage back to the attacker. Triggers a maximum of **2 times per battle**, then functions as a standard 2.5x shield. |

### 3.5 Blueprints (Repurposed)

Blueprints are no longer tied to ships. They are now **planet building unlocks** — like Clash of Clans town hall gates. A Blueprint for a given building type must be owned before that building can be constructed on any planet, regardless of slot availability or resources.

- **Soul-bound** — Blueprints cannot be traded. Players must grind for every one they own.
- **Sources (multiple grind loops):**
  - Raid drops — chance on every raid win, scales with defender strength
  - Daily missions — occasional milestone reward, not every mission
  - Exploration discoveries — finding Anomaly, Void, Singularity, or Dark Relic worlds has a chance to drop a Blueprint
  - Seasonal placement — small Blueprint bundle awarded at season end for all ranked players
- Blueprint types map to building slot types: Mining, Shipyard, Research, Defense (advanced tiers of each)
- Scarcity is intentional — players should spend weeks grinding for a specific Blueprint they want

### 3.6 Supabase Tables

```sql
player_ships        — player_id, hull_component_id, weapons_component_id, shields_component_id, engine_component_id
ship_components     — id, player_id, slot_type, tier, is_equipped, acquired_at
component_fragments — id, player_id, slot_type, count
```

---

## 4. Integration with Existing Systems

- **Raids** → drop Lumens + chance of Spin Ticket + Blueprint drops
- **Daily missions** (not yet designed) → primary Lumen + Spin Ticket source
- **Seasonal rewards** → Lumen bonus at season end; Gold/Silver/Bronze cosmetics soul-bound; Blueprint drops
- **Inventory** → single `player_inventory` table backing spin drops, marketplace transfers, resource storage, and component fragments
- **`src/constants/game.ts`** → all tunable values: loot weights, stat multipliers, ability proc rates (Phase Cannon 20%, Echo Shell 15%/2x, Overdrive 10% HP cost), Lumen drop amounts, pity threshold (50), listing cap (5), fee (5%), listing duration (7 days)

---

## 5. What's Not In Scope

- Bidding / auction countdown (fixed price only for v1)
- Player-to-player direct trades (auction house only for v1)
- Daily missions system (referenced as Lumen/Ticket source but designed separately)
- IAP integration / app store payment flow (separate implementation)
- Multi-ship fleets (single ship per player for v1; fleet expansion is a later feature)
