import { shouldPromptCombine, sortByTier } from './loadoutSlot';
import type { ShipComponent, ComponentTier } from '@/src/game/ships/types';

function makeComponent(tier: ComponentTier): ShipComponent {
  return { id: tier, slot: 'hull', tier, statMultiplier: 1.0 };
}

describe('shouldPromptCombine', () => {
  it('returns false for fewer than 3 fragments', () => {
    expect(shouldPromptCombine(0)).toBe(false);
    expect(shouldPromptCombine(2)).toBe(false);
  });

  it('returns true at exactly 3 fragments', () => {
    expect(shouldPromptCombine(3)).toBe(true);
  });

  it('returns true for more than 3 fragments', () => {
    expect(shouldPromptCombine(10)).toBe(true);
  });
});

describe('sortByTier', () => {
  it('sorts ultra_rare before common', () => {
    const components = [makeComponent('common'), makeComponent('ultra_rare')];
    const sorted = sortByTier(components);
    expect(sorted[0].tier).toBe('ultra_rare');
    expect(sorted[1].tier).toBe('common');
  });

  it('preserves full tier order: ultra_rare > legendary > rare > uncommon > common', () => {
    const input: ComponentTier[] = ['common', 'rare', 'ultra_rare', 'uncommon', 'legendary'];
    const sorted = sortByTier(input.map(makeComponent));
    expect(sorted.map(c => c.tier)).toEqual([
      'ultra_rare', 'legendary', 'rare', 'uncommon', 'common',
    ]);
  });
});
