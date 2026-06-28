import { calcPowerScore, MAX_POWER_SCORE } from './powerScore';
import type { ShipComponent, ComponentSlot } from '@/src/game/ships/types';

function makeComponent(slot: ComponentSlot, statMultiplier: number): ShipComponent {
  return { id: 'test', slot, tier: 'common', statMultiplier };
}

const empty = { hull: null, weapons: null, shields: null, engine: null };

describe('calcPowerScore', () => {
  it('returns 0 when all slots are unequipped', () => {
    expect(calcPowerScore(empty)).toBe(0);
  });

  it('returns sum of all multipliers', () => {
    expect(calcPowerScore({
      hull:    makeComponent('hull', 1.0),
      weapons: makeComponent('weapons', 1.7),
      shields: makeComponent('shields', 2.2),
      engine:  makeComponent('engine', 2.5),
    })).toBeCloseTo(7.4);
  });

  it('handles partial loadout (3 empty slots)', () => {
    expect(calcPowerScore({ ...empty, hull: makeComponent('hull', 2.5) })).toBe(2.5);
  });

  it('MAX_POWER_SCORE equals 10.0', () => {
    expect(MAX_POWER_SCORE).toBeCloseTo(10.0);
  });
});
