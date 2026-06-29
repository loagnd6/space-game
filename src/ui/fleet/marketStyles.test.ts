import { formatTimeLeft, receivedAfterFee } from './marketStyles';

describe('formatTimeLeft', () => {
  it('returns "Xd Yh left" when more than one day remains', () => {
    const future = new Date(
      Date.now() + 5 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000
    ).toISOString();
    expect(formatTimeLeft(future)).toBe('5d 3h left');
  });

  it('returns "Xh Ym left" when less than one day remains', () => {
    const future = new Date(
      Date.now() + 2 * 60 * 60 * 1000 + 14 * 60 * 1000
    ).toISOString();
    expect(formatTimeLeft(future)).toBe('2h 14m left');
  });

  it('returns "Expired" when date is in the past', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(formatTimeLeft(past)).toBe('Expired');
  });
});

describe('receivedAfterFee', () => {
  it('applies 5% fee correctly', () => {
    expect(receivedAfterFee(500)).toBe(475);
    expect(receivedAfterFee(100)).toBe(95);
  });

  it('floors the result for non-integer amounts', () => {
    // 101 * 0.95 = 95.95 → 95
    expect(receivedAfterFee(101)).toBe(95);
  });
});
