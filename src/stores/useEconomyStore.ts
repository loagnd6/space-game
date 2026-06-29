import { create } from 'zustand';
import type { MarketplaceListing } from '@/src/game/economy/types';
import { validateListing } from '@/src/game/economy';
import type { InventoryItem } from '@/src/types/inventory';
import { supabase } from '@/src/services/supabase';

interface EconomyStore {
  lumenBalance: number;
  activeListings: MarketplaceListing[];
  marketplaceListings: MarketplaceListing[];
  fetchBalance: () => Promise<void>;
  fetchMyListings: () => Promise<void>;
  fetchMarketplace: () => Promise<void>;
  listItem: (item: InventoryItem, priceLumens: number) => Promise<{ error?: string }>;
  buyListing: (listingId: string) => Promise<{ error?: string }>;
  inventory: InventoryItem[];
  fetchInventory: () => Promise<void>;
}

export const useEconomyStore = create<EconomyStore>((set, get) => ({
  lumenBalance: 0,
  activeListings: [],
  marketplaceListings: [],
  inventory: [],

  fetchBalance: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data } = await supabase.from('player_lumens').select('balance').eq('player_id', session.user.id).single();
    if (data) set({ lumenBalance: data.balance });
  },

  fetchMyListings: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data } = await supabase.from('marketplace_listings').select('*').eq('seller_id', session.user.id);
    set({ activeListings: (data as MarketplaceListing[]) ?? [] });
  },

  fetchMarketplace: async () => {
    const { data } = await supabase
      .from('marketplace_listings')
      .select('*')
      .gt('expires_at', new Date().toISOString())
      .order('listed_at', { ascending: false })
      .limit(50);
    set({ marketplaceListings: (data as MarketplaceListing[]) ?? [] });
  },

  listItem: async (item: InventoryItem, priceLumens: number) => {
    const activeCount = get().activeListings.length;
    const validation = validateListing(item, priceLumens, activeCount);
    if (!validation.valid) return { error: validation.error };

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { error: 'Not authenticated' };

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from('marketplace_listings').insert({
      seller_id: session.user.id,
      item_type: item.itemType,
      item_data: item.itemData,
      price_lumens: priceLumens,
      expires_at: expiresAt,
    });
    if (error) return { error: error.message };
    await get().fetchMyListings();
    return {};
  },

  buyListing: async (listingId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { error: 'Not authenticated' };
    const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/marketplace-buy`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ listingId }),
    });
    if (!res.ok) {
      const body = await res.json();
      return { error: body.error ?? 'Purchase failed' };
    }
    await Promise.all([get().fetchBalance(), get().fetchMarketplace()]);
    return {};
  },

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
}));
