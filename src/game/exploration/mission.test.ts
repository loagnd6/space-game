import { calculateFuelCost, calculateTravelTime, resolveMission, hashUUID } from './mission';
import { SeededRNG } from '@/src/game/rng';
import type { FleetMission } from '@/src/types/exploration';
import type { StarSystem } from '@/src/types';
import { EXPLORATION } from '@/src/constants/game';

const home: StarSystem = {
  id: 'sol-home', name: 'Sol', position: { x: 1000, y: 1000 },
  dangerLevel: 1, planets: [],
};
const target: StarSystem = {
  id: 'sys-0', name: 'Vega', position: { x: 1300, y: 1000 },
  dangerLevel: 2,
  planets: [
    { id: 'p0', name: 'A', position: { x: 0, y: 0 }, discovered: false, resourceRichness: 0.5 },
    { id: 'p1', name: 'B', position: { x: 0, y: 0 }, discovered: false, resourceRichness: 0.8 },
  ],
};
const mission: FleetMission = {
  id: 'mission-sys-0-1234', systemId: 'sys-0',
  departedAt: 0, arrivesAt: 600_000, fuelCost: 3, status: 'arrived',
};

describe('calculateFuelCost', () => {
  it('returns at least 1', () => {
    expect(calculateFuelCost({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeGreaterThanOrEqual(1);
  });
  it('distance 300 → 3 fuel', () => {
    expect(calculateFuelCost({ x: 0, y: 0 }, { x: 300, y: 0 })).toBe(3);
  });
  it('increases with distance', () => {
    const near = calculateFuelCost({ x: 0, y: 0 }, { x: 100, y: 0 });
    const far  = calculateFuelCost({ x: 0, y: 0 }, { x: 500, y: 0 });
    expect(far).toBeGreaterThan(near);
  });
});

describe('calculateTravelTime', () => {
  it('clamps to 5-minute minimum', () => {
    expect(calculateTravelTime({ x: 0, y: 0 }, { x: 1, y: 0 }))
      .toBe(EXPLORATION.TRAVEL_TIME_MIN_MS);
  });
  it('clamps to 20-minute maximum', () => {
    expect(calculateTravelTime({ x: 0, y: 0 }, { x: 99999, y: 0 }))
      .toBe(EXPLORATION.TRAVEL_TIME_MAX_MS);
  });
  it('grows with distance within the clamped range', () => {
    const near = calculateTravelTime({ x: 0, y: 0 }, { x: 1100, y: 0 });
    const mid  = calculateTravelTime({ x: 0, y: 0 }, { x: 2000, y: 0 });
    expect(mid).toBeGreaterThan(near);
  });
});

describe('resolveMission', () => {
  it('marks all planets discovered', () => {
    const result = resolveMission(mission, [home, target], new SeededRNG(1));
    expect(result.planetsFound).toHaveLength(2);
    result.planetsFound.forEach(p => expect(p.discovered).toBe(true));
  });
  it('awards credits and fuel', () => {
    const result = resolveMission(mission, [home, target], new SeededRNG(1));
    expect(result.resourcesGained.credits).toBeGreaterThan(0);
    expect(result.resourcesGained.fuel).toBeGreaterThan(0);
  });
  it('is deterministic for the same RNG state', () => {
    const r1 = resolveMission(mission, [home, target], new SeededRNG(42));
    const r2 = resolveMission(mission, [home, target], new SeededRNG(42));
    expect(r1.resourcesGained).toEqual(r2.resourcesGained);
    expect(r1.fragmentDrop).toEqual(r2.fragmentDrop);
  });
});

describe('hashUUID', () => {
  it('returns a number', () => {
    expect(typeof hashUUID('abc-123')).toBe('number');
  });
  it('returns different values for different inputs', () => {
    expect(hashUUID('abc')).not.toBe(hashUUID('xyz'));
  });
});
