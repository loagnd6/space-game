-- ============================================================
-- Inventory
-- ============================================================
CREATE TABLE player_inventory (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_type    TEXT NOT NULL,
  item_data    JSONB NOT NULL DEFAULT '{}',
  quantity     INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  is_soul_bound BOOLEAN NOT NULL DEFAULT FALSE,
  acquired_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE player_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players see own inventory" ON player_inventory
  FOR ALL USING (auth.uid() = player_id);

-- ============================================================
-- Spin System
-- ============================================================
CREATE TABLE spin_state (
  player_id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  free_spin_available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  premium_spin_used_date DATE,
  pity_counter           INT NOT NULL DEFAULT 0 CHECK (pity_counter >= 0)
);

ALTER TABLE spin_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players see own spin state" ON spin_state
  FOR SELECT USING (auth.uid() = player_id);

CREATE TABLE spin_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  spin_type   TEXT NOT NULL CHECK (spin_type IN ('free', 'ticket', 'premium')),
  tier        TEXT NOT NULL CHECK (tier IN ('common','uncommon','rare','legendary','ultra_rare')),
  item_type   TEXT NOT NULL,
  item_data   JSONB NOT NULL DEFAULT '{}',
  spun_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE spin_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players see own spin history" ON spin_history
  FOR SELECT USING (auth.uid() = player_id);

-- ============================================================
-- Economy / Lumens
-- ============================================================
CREATE TABLE player_lumens (
  player_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance   BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0)
);

ALTER TABLE player_lumens ENABLE ROW LEVEL SECURITY;
-- Players read own balance; writes only via service role (Edge Functions)
CREATE POLICY "Players read own lumens" ON player_lumens
  FOR SELECT USING (auth.uid() = player_id);

CREATE TABLE lumen_ledger (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta      BIGINT NOT NULL,
  reason     TEXT NOT NULL,
  related_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE lumen_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players read own ledger" ON lumen_ledger
  FOR SELECT USING (auth.uid() = player_id);

CREATE TABLE marketplace_listings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_type    TEXT NOT NULL,
  item_data    JSONB NOT NULL DEFAULT '{}',
  price_lumens BIGINT NOT NULL CHECK (price_lumens > 0),
  listed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days'
);

ALTER TABLE marketplace_listings ENABLE ROW LEVEL SECURITY;
-- Anyone can read listings; only seller can create; deletes via service role only
CREATE POLICY "Anyone can view listings" ON marketplace_listings
  FOR SELECT USING (TRUE);
CREATE POLICY "Sellers create own listings" ON marketplace_listings
  FOR INSERT WITH CHECK (auth.uid() = seller_id);

-- ============================================================
-- Ship Components
-- ============================================================
CREATE TABLE ship_components (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slot_type   TEXT NOT NULL CHECK (slot_type IN ('hull','weapons','shields','engine')),
  tier        TEXT NOT NULL CHECK (tier IN ('common','uncommon','rare','legendary','ultra_rare')),
  is_equipped BOOLEAN NOT NULL DEFAULT FALSE,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ship_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players manage own components" ON ship_components
  FOR ALL USING (auth.uid() = player_id);

CREATE TABLE component_fragments (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slot_type TEXT NOT NULL CHECK (slot_type IN ('hull','weapons','shields','engine')),
  count     INT NOT NULL DEFAULT 0 CHECK (count >= 0),
  UNIQUE (player_id, slot_type)
);

ALTER TABLE component_fragments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players manage own fragments" ON component_fragments
  FOR ALL USING (auth.uid() = player_id);

CREATE TABLE player_ships (
  player_id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hull_component_id    UUID REFERENCES ship_components(id),
  weapons_component_id UUID REFERENCES ship_components(id),
  shields_component_id UUID REFERENCES ship_components(id),
  engine_component_id  UUID REFERENCES ship_components(id)
);

ALTER TABLE player_ships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players manage own ship" ON player_ships
  FOR ALL USING (auth.uid() = player_id);

-- ============================================================
-- SQL Helper Functions (Task 7 requirement)
-- ============================================================
CREATE OR REPLACE FUNCTION increment_lumens(p_player_id UUID, p_amount BIGINT)
RETURNS VOID LANGUAGE sql AS $$
  INSERT INTO player_lumens (player_id, balance) VALUES (p_player_id, p_amount)
  ON CONFLICT (player_id) DO UPDATE SET balance = player_lumens.balance + p_amount;
$$;
