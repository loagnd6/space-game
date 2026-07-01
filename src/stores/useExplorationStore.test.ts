import { act } from 'react';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/src/services/notifications', () => ({
  scheduleArrivalNotification: jest.fn(() => Promise.resolve('notif-1')),
  cancelNotification: jest.fn(() => Promise.resolve()),
}));

import { useExplorationStore } from './useExplorationStore';
import { cancelNotification } from '@/src/services/notifications';
import type { StarSystem } from '@/src/types';

const PLAYER_UUID = 'a1b2c3d4-0000-0000-0000-000000000000';

const solHome: StarSystem = {
  id: 'sol-home', name: 'Sol', position: { x: 1000, y: 1000 },
  dangerLevel: 1, planets: [],
};
const vegaSys: StarSystem = {
  id: 'sys-0', name: 'Vega', position: { x: 1300, y: 1000 },
  dangerLevel: 2,
  planets: [{ id: 'p0', name: 'A', position: { x: 0, y: 0 }, discovered: false, resourceRichness: 0.5 }],
};

beforeEach(() => {
  useExplorationStore.setState({
    starSystems: [], activeMissions: [], discoveries: [],
    mapInitialized: false, fuel: 100,
  });
});

describe('initMap', () => {
  it('generates systems and marks initialized', () => {
    act(() => { useExplorationStore.getState().initMap(PLAYER_UUID); });
    const { starSystems, mapInitialized } = useExplorationStore.getState();
    expect(mapInitialized).toBe(true);
    expect(starSystems.length).toBeGreaterThan(0);
  });

  it('skips re-generation if already initialized', () => {
    act(() => { useExplorationStore.getState().initMap(PLAYER_UUID); });
    const first = useExplorationStore.getState().starSystems;
    act(() => { useExplorationStore.getState().initMap('different-uuid'); });
    expect(useExplorationStore.getState().starSystems).toBe(first);
  });
});

describe('dispatchFleet', () => {
  beforeEach(() => {
    useExplorationStore.setState({ starSystems: [solHome, vegaSys], mapInitialized: true, fuel: 100 });
  });

  it('creates an in_transit mission and deducts fuel', () => {
    act(() => { useExplorationStore.getState().dispatchFleet('sys-0'); });
    const { activeMissions, fuel } = useExplorationStore.getState();
    expect(activeMissions).toHaveLength(1);
    expect(activeMissions[0]!.status).toBe('in_transit');
    expect(fuel).toBeLessThan(100);
  });

  it('blocks dispatch when fuel is 0', () => {
    useExplorationStore.setState({ fuel: 0 });
    act(() => { useExplorationStore.getState().dispatchFleet('sys-0'); });
    expect(useExplorationStore.getState().activeMissions).toHaveLength(0);
  });

  it('blocks a second dispatch to the same in-transit system', () => {
    act(() => { useExplorationStore.getState().dispatchFleet('sys-0'); });
    act(() => { useExplorationStore.getState().dispatchFleet('sys-0'); });
    expect(useExplorationStore.getState().activeMissions).toHaveLength(1);
  });
});

describe('checkArrivals', () => {
  it('flips in_transit → arrived when arrivesAt has passed', () => {
    const past = Date.now() - 1000;
    useExplorationStore.setState({
      activeMissions: [{
        id: 'm1', systemId: 'sys-0', departedAt: past - 5000,
        arrivesAt: past, fuelCost: 3, status: 'in_transit',
      }],
    });
    act(() => { useExplorationStore.getState().checkArrivals(); });
    expect(useExplorationStore.getState().activeMissions[0]!.status).toBe('arrived');
  });

  it('leaves future missions as in_transit', () => {
    useExplorationStore.setState({
      activeMissions: [{
        id: 'm2', systemId: 'sys-1', departedAt: Date.now(),
        arrivesAt: Date.now() + 999_999, fuelCost: 3, status: 'in_transit',
      }],
    });
    act(() => { useExplorationStore.getState().checkArrivals(); });
    expect(useExplorationStore.getState().activeMissions[0]!.status).toBe('in_transit');
  });
});

describe('collectMission', () => {
  it('credits fuel, marks collected, and saves discovery', () => {
    useExplorationStore.setState({
      starSystems: [solHome, vegaSys],
      activeMissions: [{
        id: 'm3', systemId: 'sys-0', departedAt: 0, arrivesAt: 0, fuelCost: 3, status: 'arrived',
      }],
      fuel: 10,
    });
    act(() => { useExplorationStore.getState().collectMission('m3'); });
    const { activeMissions, discoveries, fuel } = useExplorationStore.getState();
    expect(activeMissions[0]!.status).toBe('collected');
    expect(discoveries).toHaveLength(1);
    expect(fuel).toBeGreaterThan(10);
  });

  it('does nothing if mission is not in arrived state', () => {
    useExplorationStore.setState({
      starSystems: [solHome, vegaSys],
      activeMissions: [{
        id: 'm4', systemId: 'sys-0', departedAt: 0, arrivesAt: 999_999, fuelCost: 3, status: 'in_transit',
      }],
    });
    act(() => { useExplorationStore.getState().collectMission('m4'); });
    expect(useExplorationStore.getState().discoveries).toHaveLength(0);
  });

  it('cancels the scheduled arrival notification', () => {
    useExplorationStore.setState({
      starSystems: [solHome, vegaSys],
      activeMissions: [{
        id: 'm5', systemId: 'sys-0', departedAt: 0, arrivesAt: 0, fuelCost: 3,
        status: 'arrived', notificationId: 'notif-abc',
      }],
      fuel: 10,
    });
    act(() => { useExplorationStore.getState().collectMission('m5'); });
    expect(cancelNotification).toHaveBeenCalledWith('notif-abc');
  });

  it('does not mutate state when resolveMission throws for a missing system', () => {
    useExplorationStore.setState({
      starSystems: [solHome], // vegaSys deliberately omitted
      activeMissions: [{
        id: 'm6', systemId: 'sys-0', departedAt: 0, arrivesAt: 0, fuelCost: 3, status: 'arrived',
      }],
      fuel: 10,
    });
    act(() => { useExplorationStore.getState().collectMission('m6'); });
    const { activeMissions, discoveries, fuel } = useExplorationStore.getState();
    expect(activeMissions[0]!.status).toBe('arrived');
    expect(discoveries).toHaveLength(0);
    expect(fuel).toBe(10);
  });
});
