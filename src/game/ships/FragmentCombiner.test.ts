import { canCombine, combineFragments } from './FragmentCombiner';
import { FRAGMENT_COMBINE_COUNT } from '@/src/constants/game';

describe('canCombine', () => {
  it('returns false when fragments < FRAGMENT_COMBINE_COUNT', () => {
    expect(canCombine(FRAGMENT_COMBINE_COUNT - 1)).toBe(false);
  });

  it('returns true when fragments >= FRAGMENT_COMBINE_COUNT', () => {
    expect(canCombine(FRAGMENT_COMBINE_COUNT)).toBe(true);
    expect(canCombine(FRAGMENT_COMBINE_COUNT + 5)).toBe(true);
  });
});

describe('combineFragments', () => {
  it('throws if not enough fragments', () => {
    expect(() => combineFragments('hull', 2)).toThrow('Not enough fragments');
  });

  it('returns uncommon component and correct fragments remaining', () => {
    const result = combineFragments('weapons', FRAGMENT_COMBINE_COUNT);
    expect(result.component.tier).toBe('uncommon');
    expect(result.component.slot).toBe('weapons');
    expect(result.fragmentsRemaining).toBe(0);
  });

  it('leaves remainder when more than FRAGMENT_COMBINE_COUNT', () => {
    const result = combineFragments('engine', FRAGMENT_COMBINE_COUNT + 2);
    expect(result.fragmentsRemaining).toBe(2);
  });
});
