import type { Vec2, StarSystem } from '@/src/types';
import type { FleetMission, DiscoveryResult } from '@/src/types/exploration';
import type { ComponentTier } from '@/src/game/ships/types';
import { SeededRNG } from '@/src/game/rng';
import { EXPLORATION } from '@/src/constants/game';

export function hashUUID(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function calculateFuelCost(from: Vec2, to: Vec2): number {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  return Math.max(1, Math.ceil(dist / EXPLORATION.FUEL_COST_DIVISOR));
}

export function calculateTravelTime(from: Vec2, to: Vec2): number {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const raw = Math.round(dist * EXPLORATION.TRAVEL_TIME_SCALE);
  return Math.max(EXPLORATION.TRAVEL_TIME_MIN_MS, Math.min(EXPLORATION.TRAVEL_TIME_MAX_MS, raw));
}

const TIERS_BY_DANGER: Record<number, ComponentTier[]> = {
  1: ['common', 'common', 'uncommon'],
  2: ['common', 'uncommon', 'uncommon'],
  3: ['uncommon', 'uncommon', 'rare'],
  4: ['uncommon', 'rare', 'rare'],
  5: ['rare', 'rare', 'legendary'],
};

export function resolveMission(
  mission: FleetMission,
  systems: StarSystem[],
  rng: SeededRNG,
): DiscoveryResult {
  const system = systems.find(s => s.id === mission.systemId)!;
  const avgRichness =
    system.planets.reduce((sum, p) => sum + p.resourceRichness, 0) /
    Math.max(1, system.planets.length);

  const credits = Math.round(50 + avgRichness * 450 * (0.5 + rng.next() * 0.5));
  const fuelRefund = Math.round(mission.fuelCost * (0.2 + rng.next() * 0.4));
  const research = Math.round(rng.next() * 50);

  const dropChance =
    EXPLORATION.FRAGMENT_BASE_CHANCE +
    Math.max(0, system.dangerLevel - 2) * EXPLORATION.FRAGMENT_DANGER_BONUS;

  let fragmentDrop: ComponentTier | undefined;
  if (rng.next() < dropChance) {
    const tiers = TIERS_BY_DANGER[system.dangerLevel] ?? (['common'] as ComponentTier[]);
    fragmentDrop = tiers[rng.int(0, tiers.length - 1)];
  }

  return {
    missionId: mission.id,
    systemId: mission.systemId,
    planetsFound: system.planets.map(p => ({ ...p, discovered: true })),
    resourcesGained: { credits, fuel: fuelRefund, research },
    fragmentDrop,
  };
}
