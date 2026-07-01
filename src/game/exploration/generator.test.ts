import { generateStarSystems } from './generator';
import { EXPLORATION } from '@/src/constants/game';

describe('generateStarSystems', () => {
  it('returns the requested system count', () => {
    expect(generateStarSystems(42, 10)).toHaveLength(10);
  });

  it('places Sol at the map center', () => {
    const home = generateStarSystems(42).find(s => s.id === 'sol-home');
    expect(home).toBeDefined();
    expect(home!.position).toEqual({
      x: EXPLORATION.MAP_SIZE / 2,
      y: EXPLORATION.MAP_SIZE / 2,
    });
  });

  it('is deterministic — same seed, same map', () => {
    const a = generateStarSystems(99);
    const b = generateStarSystems(99);
    expect(a.map(s => s.position)).toEqual(b.map(s => s.position));
  });

  it('different seeds produce different positions', () => {
    const a = generateStarSystems(1).filter(s => s.id !== 'sol-home').map(s => s.position.x);
    const b = generateStarSystems(2).filter(s => s.id !== 'sol-home').map(s => s.position.x);
    expect(a).not.toEqual(b);
  });

  it('every system has 1–4 planets', () => {
    generateStarSystems(42).forEach(s => {
      expect(s.planets.length).toBeGreaterThanOrEqual(1);
      expect(s.planets.length).toBeLessThanOrEqual(4);
    });
  });

  it('every system has dangerLevel 1–5', () => {
    generateStarSystems(42).forEach(s => {
      expect(s.dangerLevel).toBeGreaterThanOrEqual(1);
      expect(s.dangerLevel).toBeLessThanOrEqual(5);
    });
  });

  it('all planets start undiscovered', () => {
    generateStarSystems(42).forEach(s =>
      s.planets.forEach(p => expect(p.discovered).toBe(false))
    );
  });
});
