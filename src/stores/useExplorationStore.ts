import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateStarSystems, calculateFuelCost, calculateTravelTime, resolveMission, hashUUID } from '@/src/game/exploration';
import { SeededRNG } from '@/src/game/rng';
import type { StarSystem, UUID } from '@/src/types';
import type { FleetMission, DiscoveryResult, MissionStatus } from '@/src/types/exploration';
import { STARTING_RESOURCES } from '@/src/constants/game';
import { scheduleArrivalNotification } from '@/src/services/notifications';

function uuidToSeed(uuid: string): number {
  const hex = uuid.replace(/-/g, '').slice(0, 8);
  return parseInt(hex, 16) || 1;
}

interface ExplorationState {
  starSystems: StarSystem[];
  activeMissions: FleetMission[];
  discoveries: DiscoveryResult[];
  mapInitialized: boolean;
  fuel: number;
  initMap(playerUUID: string): void;
  dispatchFleet(systemId: UUID): void;
  checkArrivals(): void;
  collectMission(missionId: UUID): void;
}

export const useExplorationStore = create<ExplorationState>()(
  persist(
    (set, get) => ({
      starSystems: [],
      activeMissions: [],
      discoveries: [],
      mapInitialized: false,
      fuel: STARTING_RESOURCES.fuel,

      initMap(playerUUID) {
        if (get().mapInitialized) return;
        set({ starSystems: generateStarSystems(uuidToSeed(playerUUID)), mapInitialized: true });
      },

      dispatchFleet(systemId) {
        const { starSystems, activeMissions, fuel } = get();
        const target = starSystems.find(s => s.id === systemId);
        const home = starSystems.find(s => s.id === 'sol-home');
        if (!target || !home) return;

        const fuelCost = calculateFuelCost(home.position, target.position);
        if (fuel < fuelCost) return;
        if (activeMissions.some(m => m.systemId === systemId && m.status === 'in_transit')) return;

        const now = Date.now();
        const mission: FleetMission = {
          id: `mission-${systemId}-${now}`,
          systemId,
          departedAt: now,
          arrivesAt: now + calculateTravelTime(home.position, target.position),
          fuelCost,
          status: 'in_transit',
        };

        set(s => ({ fuel: s.fuel - fuelCost, activeMissions: [...s.activeMissions, mission] }));

        scheduleArrivalNotification(mission, target.name).then(notificationId => {
          if (!notificationId) return;
          set(s => ({
            activeMissions: s.activeMissions.map(m =>
              m.id === mission.id ? { ...m, notificationId } : m
            ),
          }));
        });
      },

      checkArrivals() {
        const now = Date.now();
        set(s => ({
          activeMissions: s.activeMissions.map(m =>
            m.status === 'in_transit' && now >= m.arrivesAt
              ? { ...m, status: 'arrived' as MissionStatus }
              : m
          ),
        }));
      },

      collectMission(missionId) {
        const { activeMissions, starSystems } = get();
        const mission = activeMissions.find(m => m.id === missionId);
        if (!mission || mission.status !== 'arrived') return;

        const result = resolveMission(mission, starSystems, new SeededRNG(hashUUID(missionId)));

        set(s => ({
          fuel: s.fuel + result.resourcesGained.fuel,
          starSystems: s.starSystems.map(sys =>
            sys.id === mission.systemId ? { ...sys, planets: result.planetsFound } : sys
          ),
          activeMissions: s.activeMissions.map(m =>
            m.id === missionId ? { ...m, status: 'collected' as MissionStatus } : m
          ),
          discoveries: [...s.discoveries, result],
        }));
      },
    }),
    { name: 'exploration-store', storage: createJSONStorage(() => AsyncStorage) }
  )
);
