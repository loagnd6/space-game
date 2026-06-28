import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LISTING_FEE_PERCENT = 0.05;

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

  const { listingId }: { listingId: string } = await req.json();
  const buyerId = user.id;

  // Fetch listing
  const { data: listing, error: listingError } = await supabase
    .from('marketplace_listings')
    .select('*')
    .eq('id', listingId)
    .single();
  if (listingError || !listing) return new Response(JSON.stringify({ error: 'Listing not found' }), { status: 404 });
  if (listing.seller_id === buyerId) return new Response(JSON.stringify({ error: 'Cannot buy your own listing' }), { status: 400 });
  if (new Date(listing.expires_at) < new Date()) return new Response(JSON.stringify({ error: 'Listing expired' }), { status: 410 });

  const price: number = listing.price_lumens;
  const fee = Math.floor(price * LISTING_FEE_PERCENT);
  const sellerReceives = price - fee;

  // Check buyer balance
  const { data: buyerLumens } = await supabase
    .from('player_lumens')
    .select('balance')
    .eq('player_id', buyerId)
    .single();
  if (!buyerLumens || buyerLumens.balance < price) {
    return new Response(JSON.stringify({ error: 'Insufficient Lumens' }), { status: 400 });
  }

  // --- Atomic sequence (Supabase JS doesn't support true transactions; use RPC for true atomicity in production) ---
  // Deduct from buyer
  const { error: deductError } = await supabase
    .from('player_lumens')
    .update({ balance: buyerLumens.balance - price })
    .eq('player_id', buyerId)
    .gte('balance', price); // optimistic lock — fails if balance changed
  if (deductError) return new Response(JSON.stringify({ error: 'Balance changed — retry' }), { status: 409 });

  // Credit seller
  await supabase.rpc('increment_lumens', { p_player_id: listing.seller_id, p_amount: sellerReceives });

  // Transfer item to buyer
  await supabase.from('player_inventory').insert({
    player_id: buyerId,
    item_type: listing.item_type,
    item_data: listing.item_data,
    quantity: 1,
    is_soul_bound: false,
  });

  // Delete listing
  await supabase.from('marketplace_listings').delete().eq('id', listingId);

  // Append ledger entries
  await supabase.from('lumen_ledger').insert([
    { player_id: buyerId,          delta: -price,          reason: 'auction_purchase', related_id: listingId },
    { player_id: listing.seller_id, delta: sellerReceives,  reason: 'auction_sale',     related_id: listingId },
    { player_id: listing.seller_id, delta: -fee,            reason: 'auction_fee',      related_id: listingId },
  ]);

  return new Response(JSON.stringify({ success: true, itemType: listing.item_type }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
