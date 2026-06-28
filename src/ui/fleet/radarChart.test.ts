import { normalizeAxis } from './radarChart';

describe('normalizeAxis', () => {
  it('returns 0.4 for Common (1.0×)', () => {
    expect(normalizeAxis(1.0)).toBeCloseTo(0.4);
  });

  it('returns 1.0 for Ultra-Rare (2.5×)', () => {
    expect(normalizeAxis(2.5)).toBeCloseTo(1.0);
  });

  it('returns 0 for unequipped (0)', () => {
    expect(normalizeAxis(0)).toBe(0);
  });

  it('returns intermediate value for Rare (1.7×)', () => {
    expect(normalizeAxis(1.7)).toBeCloseTo(0.68);
  });
});
