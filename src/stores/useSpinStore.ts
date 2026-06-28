import { create } from 'zustand';
import type { SpinResult, SpinType } from '@/src/game/spin/types';
import { supabase } from '@/src/services/supabase';

interface SpinStore {
  freeSpinAvailableAt: Date | null;
  premiumSpinUsedToday: boolean;
  lastResult: SpinResult | null;
  isSpinning: boolean;
  fetchSpinState: () => Promise<void>;
  spin: (spinType: SpinType) => Promise<SpinResult>;
}

export const useSpinStore = create<SpinStore>((set) => ({
  freeSpinAvailableAt: null,
  premiumSpinUsedToday: false,
  lastResult: null,
  isSpinning: false,

  fetchSpinState: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data } = await supabase
      .from('spin_state')
      .select('free_spin_available_at, premium_spin_used_date')
      .eq('player_id', session.user.id)
      .single();
    if (!data) return;
    const today = new Date().toISOString().slice(0, 10);
    set({
      freeSpinAvailableAt: new Date(data.free_spin_available_at),
      premiumSpinUsedToday: data.premium_spin_used_date === today,
    });
  },

  spin: async (spinType: SpinType) => {
    set({ isSpinning: true });
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      set({ isSpinning: false });
      throw new Error('Not authenticated');
    }
    const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/spin`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ spinType }),
    });
    if (!res.ok) {
      set({ isSpinning: false });
      throw new Error(await res.text());
    }
    const result: SpinResult = await res.json();
    set({ lastResult: result, isSpinning: false });
    return result;
  },
}));
