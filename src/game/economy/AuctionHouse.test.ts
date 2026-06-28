import { validateListing, calculateFee } from './AuctionHouse';
import { MARKETPLACE } from '@/src/constants/game';
import type { InventoryItem } from '@/src/types/inventory';

function makeItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'item-1',
    playerId: 'player-1',
    itemType: 'ship_component',
    itemData: { tier: 'rare', slot: 'hull' },
    quantity: 1,
    isSoulBound: false,
    acquiredAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('validateListing', () => {
  it('rejects soul-bound items', () => {
    const result = validateListing(makeItem({ isSoulBound: true }), 100, 0);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/soul-bound/i);
  });

  it('rejects when at listing cap', () => {
    const result = validateListing(makeItem(), 100, MARKETPLACE.MAX_ACTIVE_LISTINGS);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/listing limit/i);
  });

  it('rejects zero or negative price', () => {
    expect(validateListing(makeItem(), 0, 0).valid).toBe(false);
    expect(validateListing(makeItem(), -1, 0).valid).toBe(false);
  });

  it('accepts valid tradeable item under cap', () => {
    const result = validateListing(makeItem(), 500, 2);
    expect(result.valid).toBe(true);
  });
});

describe('calculateFee', () => {
  it('returns 5% of price', () => {
    expect(calculateFee(1000)).toBe(50);
    expect(calculateFee(100)).toBe(5);
  });

  it('rounds down', () => {
    expect(calculateFee(101)).toBe(5); // 5.05 → 5
  });
});
