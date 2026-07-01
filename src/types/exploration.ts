import type { UUID, Planet, Resources } from '@/src/types';
import type { ComponentTier } from '@/src/game/ships/types';

export type MissionStatus = 'in_transit' | 'arrived' | 'collected';

export interface FleetMission {
  id: UUID;
  systemId: UUID;
  departedAt: number;      // ms UTC
  arrivesAt: number;       // ms UTC
  fuelCost: number;
  status: MissionStatus;
  notificationId?: string;
}

export interface DiscoveryResult {
  missionId: UUID;
  systemId: UUID;
  planetsFound: Planet[];
  resourcesGained: Resources;
  fragmentDrop?: ComponentTier;
}
