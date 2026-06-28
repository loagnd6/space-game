import { SeededRNG } from '../rng';
import { rollTier, rollItemForTier } from './lootTable';

describe('rollTier', () => {
  it('returns a valid tier', () => {
    const rng = new SeededRNG(1);
    const valid = ['common', 'uncommon', 'rare', 'legendary', 'ultra_rare'];
    expect(valid).toContain(rollTier(rng, 0));
  });

  it('guarantees legendary or better when pity >= 50', () => {
    for (let seed = 0; seed < 20; seed++) {
      const rng = new SeededRNG(seed);
      const tier = rollTier(rng, 50);
      expect(['legendary', 'ultra_rare']).toContain(tier);
    }
  });

  it('common is most frequent over 1000 rolls', () => {
    const rng = new SeededRNG(99);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) {
      const t = rollTier(rng, 0);
      counts[t] = (counts[t] ?? 0) + 1;
    }
    expect(counts['common']).toBeGreaterThan(counts['rare']);
    expect(counts['rare']).toBeGreaterThan(counts['legendary'] ?? 0);
  });

  it('does not return ultra_rare under pity more than ~2% of the time', () => {
    const rng = new SeededRNG(42);
    let ultraCount = 0;
    for (let i = 0; i < 10000; i++) {
      if (rollTier(rng, 0) === 'ultra_rare') ultraCount++;
    }
    // Should be ~0.5% ± noise; definitely under 2%
    expect(ultraCount).toBeLessThan(200);
  });
});

describe('rollItemForTier', () => {
  it('returns an item with itemType and itemData', () => {
    const rng = new SeededRNG(5);
    const item = rollItemForTier(rng, 'common');
    expect(item).toHaveProperty('itemType');
    expect(item).toHaveProperty('itemData');
  });

  it('ultra_rare always returns a ship_component', () => {
    const rng = new SeededRNG(5);
    const item = rollItemForTier(rng, 'ultra_rare');
    expect(item.itemType).toBe('ship_component');
    expect(item.itemData).toHaveProperty('tier', 'ultra_rare');
  });
});
