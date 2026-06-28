import { SLOT_STYLES } from './slotStyles';

const SLOTS = ['hull', 'weapons', 'shields', 'engine'] as const;

describe('SLOT_STYLES', () => {
  it.each(SLOTS)('%s has a defined accent and accentFaded color', (slot) => {
    expect(SLOT_STYLES[slot].accent).toBeDefined();
    expect(SLOT_STYLES[slot].accentFaded).toBeDefined();
  });
});
