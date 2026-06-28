import { formatCountdown } from './SpinButtons';

describe('formatCountdown', () => {
  it('formats hours, minutes, and seconds with zero-padding', () => {
    const target = new Date(Date.now() + 2 * 3_600_000 + 30 * 60_000 + 5_000);
    expect(formatCountdown(target)).toBe('02:30:05');
  });

  it('returns 00:00:00 for a date in the past', () => {
    const past = new Date(Date.now() - 1000);
    expect(formatCountdown(past)).toBe('00:00:00');
  });

  it('formats single-digit components with leading zeros', () => {
    const target = new Date(Date.now() + 1 * 3_600_000 + 1 * 60_000 + 1_000);
    expect(formatCountdown(target)).toBe('01:01:01');
  });
});
