import { SeededRNG } from '@/src/game/rng';
import type { StarSystem, Planet, Vec2 } from '@/src/types';
import { EXPLORATION } from '@/src/constants/game';

const SYSTEM_NAMES = [
  'Vega', 'Lyra', 'Cygni', 'Orion', 'Hydra', 'Draco', 'Perseus', 'Aquila',
  'Corvus', 'Lupus', 'Ara', 'Mensa', 'Pyxis', 'Norma', 'Pavo', 'Tucana',
  'Grus', 'Phoenix', 'Sculptor',
];

function placeSystem(existing: Vec2[], rng: SeededRNG): Vec2 {
  const margin = 50;
  const size = EXPLORATION.MAP_SIZE;
  let pos: Vec2 = { x: 0, y: 0 };
  for (let attempt = 0; attempt < 100; attempt++) {
    pos = { x: rng.int(margin, size - margin), y: rng.int(margin, size - margin) };
    if (!existing.some(p => Math.hypot(p.x - pos.x, p.y - pos.y) < EXPLORATION.MIN_SYSTEM_SPACING)) {
      break;
    }
  }
  return pos;
}

function makePlanets(rng: SeededRNG, count: number, systemId: string): Planet[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${systemId}-p${i}`,
    name: `Planet ${String.fromCharCode(65 + i)}`,
    position: { x: 0, y: 0 },
    discovered: false,
    resourceRichness: Math.round(rng.next() * 100) / 100,
  }));
}

export function generateStarSystems(seed: number, count = EXPLORATION.SYSTEM_COUNT): StarSystem[] {
  const rng = new SeededRNG(seed);
  const center = EXPLORATION.MAP_SIZE / 2;

  const home: StarSystem = {
    id: 'sol-home',
    name: 'Sol',
    position: { x: center, y: center },
    dangerLevel: 1,
    planets: makePlanets(rng, 3, 'sol-home'),
  };

  const systems: StarSystem[] = [home];
  const positions: Vec2[] = [home.position];

  for (let i = 0; i < count - 1; i++) {
    const pos = placeSystem(positions, rng);
    positions.push(pos);
    const dist = Math.hypot(pos.x - center, pos.y - center);
    const danger = Math.max(1, Math.min(5, Math.ceil(dist / 300))) as 1 | 2 | 3 | 4 | 5;
    const id = `sys-${i}`;
    systems.push({
      id,
      name: SYSTEM_NAMES[i] ?? `System ${i + 1}`,
      position: pos,
      dangerLevel: danger,
      planets: makePlanets(rng, rng.int(1, 4), id),
    });
  }
  return systems;
}
