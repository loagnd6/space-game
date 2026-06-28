import type { ComponentSlot } from '@/src/game/ships/types';

export interface SlotStyle {
  accent: string;
  accentFaded: string;
}

export const SLOT_STYLES: Record<ComponentSlot, SlotStyle> = {
  hull:    { accent: '#FF9800', accentFaded: '#FF980030' },
  weapons: { accent: '#FF5E7A', accentFaded: '#FF5E7A30' },
  shields: { accent: '#5EC8FF', accentFaded: '#5EC8FF30' },
  engine:  { accent: '#4CAF50', accentFaded: '#4CAF5030' },
};
