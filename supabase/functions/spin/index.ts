import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// --- Inlined from src/game/spin/lootTable.ts (Deno can't import from src/) ---
const SPIN_LOOT_WEIGHTS = { common: 0.600, uncommon: 0.250, rare: 0.120, legendary: 0.025, ultra_rare: 0.005 };
const PITY_THRESHOLD = 50;
const FREE_SPIN_INTERVAL_HOURS = 4;
const SLOTS = ['hull', 'weapons', 'shields', 'engine'] as const;
type LootTier = 'common' | 'uncommon' | 'rare' | 'legendary' | 'ultra_rare';
type SpinType = 'free' | 'ticket' | 'premium';

class SeededRNG {
  private state: number;
  constructor(seed: number) { this.state = seed >>> 0; }
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min: number, max: number): number { return min + Math.floor(this.next() * (max - min + 1)); }
}

function rollTier(rng: SeededRNG, pityCounter: number): LootTier {
  if (pityCounter >= PITY_THRESHOLD) {
    const total = SPIN_LOOT_WEIGHTS.ultra_rare + SPIN_LOOT_WEIGHTS.legendary;
    return rng.next() < SPIN_LOOT_WEIGHTS.ultra_rare / total ? 'ultra_rare' : 'legendary';
  }
  const roll = rng.next();
  let c = 0;
  if (roll < (c += SPIN_LOOT_WEIGHTS.ultra_rare)) return 'ultra_rare';
  if (roll < (c += SPIN_LOOT_WEIGHTS.legendary))  return 'legendary';
  if (roll < (c += SPIN_LOOT_WEIGHTS.rare))        return 'rare';
  if (roll < (c += SPIN_LOOT_WEIGHTS.uncommon))    return 'uncommon';
  return 'common';
}

function pickSlot(rng: SeededRNG) { return SLOTS[rng.int(0, 3)]; }

function rollItem(rng: SeededRNG, tier: LootTier) {
  const abilityMap: Record<string, string> = { hull: 'iron_tomb', weapons: 'phase_cannon', engine: 'overdrive', shields: 'echo_shell' };
  switch (tier) {
    case 'common':    return { itemType: 'resource_bundle', itemData: { resourceType: ['ore','crystal','gas','water'][rng.int(0,3)], amount: [500,200,150,100][rng.int(0,3)] } };
    case 'uncommon':  return rng.next() < 0.5 ? { itemType: 'boost_token', itemData: { quantity: 1 } } : { itemType: 'component_fragment', itemData: { slot: pickSlot(rng) } };
    case 'rare':      return rng.next() < 0.4 ? { itemType: 'ship_component', itemData: { tier: 'rare', slot: pickSlot(rng) } } : { itemType: 'blueprint', itemData: { buildingTier: 'advanced' } };
    case 'legendary': return rng.next() < 0.6 ? { itemType: 'ship_component', itemData: { tier: 'legendary', slot: pickSlot(rng) } } : { itemType: 'cosmetic_skin', itemData: { skinId: `spin_legendary_${rng.int(1,10)}` } };
    case 'ultra_rare': { const slot = pickSlot(rng); return { itemType: 'ship_component', itemData: { tier: 'ultra_rare', slot, ability: abilityMap[slot] } }; }
  }
}
// --- End inlined logic ---

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('Unauthorized', { status: 401 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Get caller's user ID from JWT
  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', ''),
  );
  if (authError || !user) return new Response('Unauthorized', { status: 401 });

  const { spinType }: { spinType: SpinType } = await req.json();

  const VALID_SPIN_TYPES = ['free', 'ticket', 'premium'] as const;
  if (!VALID_SPIN_TYPES.includes(spinType)) {
    return new Response(JSON.stringify({ error: 'Invalid spinType' }), { status: 400 });
  }

  const playerId = user.id;
  const now = new Date();

  // Fetch or create spin_state
  const { data: spinState, error: stateError } = await supabase
    .from('spin_state')
    .upsert({ player_id: playerId }, { onConflict: 'player_id' })
    .select()
    .single();
  if (stateError) return new Response(stateError.message, { status: 500 });

  // Validate spin availability
  if (spinType === 'free') {
    const availableAt = new Date(spinState.free_spin_available_at);
    if (now < availableAt) {
      return new Response(JSON.stringify({ error: 'Free spin not ready', availableAt }), { status: 429 });
    }
  } else if (spinType === 'premium') {
    const today = now.toISOString().slice(0, 10);
    if (spinState.premium_spin_used_date === today) {
      return new Response(JSON.stringify({ error: 'Premium spin already used today' }), { status: 429 });
    }
  } else if (spinType === 'ticket') {
    // Deduct one spin_ticket from inventory
    const { data: ticket } = await supabase
      .from('player_inventory')
      .select('id, quantity')
      .eq('player_id', playerId)
      .eq('item_type', 'spin_ticket')
      .limit(1)
      .single();
    if (!ticket) return new Response(JSON.stringify({ error: 'No spin tickets' }), { status: 400 });
    if (ticket.quantity <= 1) {
      await supabase.from('player_inventory').delete().eq('id', ticket.id);
    } else {
      await supabase.from('player_inventory').update({ quantity: ticket.quantity - 1 }).eq('id', ticket.id);
    }
  }

  // Roll result
  const seed = Math.floor(Math.random() * 2 ** 32); // server entropy — safe here, not battle math
  const rng = new SeededRNG(seed);
  const tier = rollTier(rng, spinState.pity_counter);
  const { itemType, itemData } = rollItem(rng, tier);
  const newPity = ['legendary', 'ultra_rare'].includes(tier) ? 0 : spinState.pity_counter + 1;

  // Determine soul-bound status (check if itemData has skinCategory field — currently unused)
  const isSoulBound = itemData && typeof itemData === 'object' && 'skinCategory' in itemData
    ? ['seasonal_cosmetic', 'hall_of_fame_cosmetic'].includes((itemData as any).skinCategory)
    : false;

  // Persist — all in one go (best-effort; Edge Functions don't support true multi-statement transactions via JS client)
  const nextFreeSpinAt = spinType === 'free'
    ? new Date(now.getTime() + FREE_SPIN_INTERVAL_HOURS * 60 * 60 * 1000).toISOString()
    : spinState.free_spin_available_at;

  await supabase.from('spin_state').update({
    pity_counter: newPity,
    free_spin_available_at: nextFreeSpinAt,
    ...(spinType === 'premium' ? { premium_spin_used_date: now.toISOString().slice(0, 10) } : {}),
  }).eq('player_id', playerId);

  await supabase.from('player_inventory').insert({
    player_id: playerId,
    item_type: itemType,
    item_data: itemData,
    quantity: 1,
    is_soul_bound: isSoulBound,
  });

  await supabase.from('spin_history').insert({
    player_id: playerId,
    spin_type: spinType,
    tier,
    item_type: itemType,
    item_data: itemData,
  });

  return new Response(JSON.stringify({ tier, itemType, itemData, pityCount: newPity }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
