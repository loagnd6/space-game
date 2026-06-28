import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FRAGMENT_COMBINE_COUNT = 3;
const COMPONENT_STAT_MULTIPLIERS: Record<string, number> = {
  common: 1.0, uncommon: 1.3, rare: 1.7, legendary: 2.2, ultra_rare: 2.5,
};
const SLOTS = ['hull', 'weapons', 'shields', 'engine'] as const;
type ComponentSlot = typeof SLOTS[number];

function randomUUID(): string {
  // Deno has crypto.randomUUID() natively
  return crypto.randomUUID();
}

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('Unauthorized', { status: 401 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', ''),
  );
  if (authError || !user) return new Response('Unauthorized', { status: 401 });

  const { slot }: { slot: ComponentSlot } = await req.json();
  if (!SLOTS.includes(slot)) {
    return new Response(JSON.stringify({ error: 'Invalid slot' }), { status: 400 });
  }

  const playerId = user.id;

  // Fetch current fragment count
  const { data: fragmentRow, error: fragError } = await supabase
    .from('component_fragments')
    .select('count')
    .eq('player_id', playerId)
    .eq('slot_type', slot)
    .single();

  if (fragError || !fragmentRow) {
    return new Response(JSON.stringify({ error: 'No fragments found' }), { status: 400 });
  }

  if (fragmentRow.count < FRAGMENT_COMBINE_COUNT) {
    return new Response(
      JSON.stringify({ error: `Not enough fragments: need ${FRAGMENT_COMBINE_COUNT}, have ${fragmentRow.count}` }),
      { status: 400 },
    );
  }

  const newCount = fragmentRow.count - FRAGMENT_COMBINE_COUNT;
  const componentId = randomUUID();

  // Decrement fragments first — if this fails, no component is created
  const { error: decrementError } = await supabase
    .from('component_fragments')
    .update({ count: newCount })
    .eq('player_id', playerId)
    .eq('slot_type', slot)
    .eq('count', fragmentRow.count); // optimistic lock: fails if count changed

  if (decrementError) {
    return new Response(JSON.stringify({ error: 'Fragment count changed — retry' }), { status: 409 });
  }

  // Insert new uncommon component — only after fragments are decremented
  const { error: insertError } = await supabase
    .from('ship_components')
    .insert({
      id: componentId,
      player_id: playerId,
      slot_type: slot,
      tier: 'uncommon',
      is_equipped: false,
    });

  if (insertError) {
    // Rollback: restore fragment count
    await supabase
      .from('component_fragments')
      .update({ count: fragmentRow.count })
      .eq('player_id', playerId)
      .eq('slot_type', slot);
    return new Response(JSON.stringify({ error: 'Failed to create component' }), { status: 500 });
  }

  return new Response(JSON.stringify({
    component: {
      id: componentId,
      slot,
      tier: 'uncommon',
      statMultiplier: COMPONENT_STAT_MULTIPLIERS.uncommon,
    },
    fragmentsRemaining: newCount,
  }), { headers: { 'Content-Type': 'application/json' } });
});
