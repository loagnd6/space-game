import { buildReelData, spinResultToReelItem } from './reelData';
import { REEL_TOTAL, WINNER_INDEX } from './constants';
import type { SpinResult } from '@/src/game/spin/types';

const shipResult: SpinResult = {
  tier: 'rare',
  itemType: 'ship_component',
  itemData: { tier: 'rare', slot: 'hull' },
  pityCount: 5,
};

const resourceResult: SpinResult = {
  tier: 'common',
  itemType: 'resource_bundle',
  itemData: { resourceType: 'ore', amount: 500 },
  pityCount: 1,
};

describe('buildReelData', () => {
  it('returns exactly REEL_TOTAL items', () => {
    expect(buildReelData(shipResult)).toHaveLength(REEL_TOTAL);
  });

  it('places winner at WINNER_INDEX with id "winner"', () => {
    const items = buildReelData(shipResult);
    expect(items[WINNER_INDEX].id).toBe('winner');
    expect(items[WINNER_INDEX].tier).toBe('rare');
  });

  it('does not place winner at any other index', () => {
    const items = buildReelData(shipResult);
    items.forEach((item, i) => {
      if (i !== WINNER_INDEX) expect(item.id).not.toBe('winner');
    });
  });

  it('all filler items have non-empty labels', () => {
    const items = buildReelData(resourceResult);
    items.forEach((item, i) => {
      if (i !== WINNER_INDEX) expect(item.label.length).toBeGreaterThan(0);
    });
  });
});

describe('spinResultToReelItem', () => {
  it('maps ship_component correctly', () => {
    const item = spinResultToReelItem(shipResult);
    expect(item.id).toBe('winner');
    expect(item.tier).toBe('rare');
    expect(item.label).toBe('Rare Hull');
    expect(item.sublabel).toBe('Component');
  });

  it('maps resource_bundle correctly', () => {
    const item = spinResultToReelItem(resourceResult);
    expect(item.label).toBe('500 Ore');
    expect(item.sublabel).toBe('Resource');
  });
});
