import { TIER_STYLES } from './tierStyles';

const ALL_TIERS = ['common', 'uncommon', 'rare', 'legendary', 'ultra_rare'] as const;

describe('TIER_STYLES', () => {
  it('has an entry for every LootTier', () => {
    for (const tier of ALL_TIERS) {
      expect(TIER_STYLES[tier]).toBeDefined();
    }
  });

  it('marks only legendary and ultra_rare as flashy', () => {
    expect(TIER_STYLES.legendary.flashy).toBe(true);
    expect(TIER_STYLES.ultra_rare.flashy).toBe(true);
    expect(TIER_STYLES.common.flashy).toBe(false);
    expect(TIER_STYLES.uncommon.flashy).toBe(false);
    expect(TIER_STYLES.rare.flashy).toBe(false);
  });

  it('every entry has a non-empty label and border', () => {
    for (const tier of ALL_TIERS) {
      expect(TIER_STYLES[tier].label.length).toBeGreaterThan(0);
      expect(TIER_STYLES[tier].border).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
