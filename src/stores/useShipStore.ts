import { create } from 'zustand';
import type { ShipComponent, ComponentSlot } from '@/src/game/ships/types';
import { canCombine, combineFragments } from '@/src/game/ships';
import { supabase } from '@/src/services/supabase';

interface ShipStore {
  equippedComponents: Record<ComponentSlot, ShipComponent | null>;
  ownedComponents: ShipComponent[];
  fragmentCounts: Record<ComponentSlot, number>;
  fetchShip: () => Promise<void>;
  equipComponent: (component: ShipComponent) => Promise<void>;
  combineFragmentsForSlot: (slot: ComponentSlot) => Promise<ShipComponent | null>;
}

export const useShipStore = create<ShipStore>((set, get) => ({
  equippedComponents: { hull: null, weapons: null, shields: null, engine: null },
  ownedComponents: [],
  fragmentCounts: { hull: 0, weapons: 0, shields: 0, engine: 0 },

  fetchShip: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const playerId = session.user.id;

    const [{ data: ship }, { data: components }, { data: fragments }] = await Promise.all([
      supabase.from('player_ships').select('*').eq('player_id', playerId).single(),
      supabase.from('ship_components').select('*').eq('player_id', playerId),
      supabase.from('component_fragments').select('*').eq('player_id', playerId),
    ]);

    const fragmentCounts: Record<ComponentSlot, number> = { hull: 0, weapons: 0, shields: 0, engine: 0 };
    fragments?.forEach(f => { fragmentCounts[f.slot_type as ComponentSlot] = f.count; });

    set({ ownedComponents: components ?? [], fragmentCounts });
  },

  equipComponent: async (component: ShipComponent) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await supabase.from('player_ships').upsert({
      player_id: session.user.id,
      [`${component.slot}_component_id`]: component.id,
    }, { onConflict: 'player_id' });
    set(state => ({
      equippedComponents: { ...state.equippedComponents, [component.slot]: component },
    }));
  },

  combineFragmentsForSlot: async (slot: ComponentSlot) => {
    const count = get().fragmentCounts[slot];
    if (!canCombine(count)) return null;
    const { component, fragmentsRemaining } = combineFragments(slot, count);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    await Promise.all([
      supabase.from('ship_components').insert({ ...component, player_id: session.user.id }),
      supabase.from('component_fragments')
        .upsert({ player_id: session.user.id, slot_type: slot, count: fragmentsRemaining }, { onConflict: 'player_id,slot_type' }),
    ]);
    set(state => ({
      ownedComponents: [...state.ownedComponents, component],
      fragmentCounts: { ...state.fragmentCounts, [slot]: fragmentsRemaining },
    }));
    return component;
  },
}));
