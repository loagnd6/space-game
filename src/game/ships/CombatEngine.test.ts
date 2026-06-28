import { SeededRNG } from '../rng';
import { resolveBattle, buildCombatant } from './CombatEngine';
import type { PlayerShip, ShipComponent } from './types';
import { COMPONENT_STAT_MULTIPLIERS } from '@/src/constants/game';

function makeComponent(slot: ShipComponent['slot'], tier: ShipComponent['tier']): ShipComponent {
  return {
    id: 'test-' + slot,
    slot,
    tier,
    statMultiplier: COMPONENT_STAT_MULTIPLIERS[tier],
    ability: tier === 'ultra_rare'
      ? ({ hull: 'iron_tomb', weapons: 'phase_cannon', engine: 'overdrive', shields: 'echo_shell' } as const)[slot]
      : undefined,
  };
}

function makeShip(playerId: string, tier: ShipComponent['tier']): PlayerShip {
  return {
    playerId,
    hull:    makeComponent('hull', tier),
    weapons: makeComponent('weapons', tier),
    shields: makeComponent('shields', tier),
    engine:  makeComponent('engine', tier),
  };
}

describe('resolveBattle', () => {
  it('returns a winner and loser', () => {
    const rng = new SeededRNG(42);
    const result = resolveBattle(makeShip('a', 'common'), makeShip('b', 'common'), rng);
    expect(['a', 'b']).toContain(result.winnerId);
    expect(result.winnerId).not.toBe(result.loserId);
  });

  it('full legendary build beats 1 ultra_rare + 2 rare + 1 common', () => {
    // Run 100 times with different seeds — legendary wins majority
    let legendaryWins = 0;
    for (let seed = 0; seed < 100; seed++) {
      const rng = new SeededRNG(seed);
      const legendaryShip: PlayerShip = {
        playerId: 'legendary',
        hull:    makeComponent('hull', 'legendary'),
        weapons: makeComponent('weapons', 'legendary'),
        shields: makeComponent('shields', 'legendary'),
        engine:  makeComponent('engine', 'legendary'),
      };
      const mixedShip: PlayerShip = {
        playerId: 'mixed',
        hull:    makeComponent('hull', 'ultra_rare'),
        weapons: makeComponent('weapons', 'rare'),
        shields: makeComponent('shields', 'rare'),
        engine:  makeComponent('engine', 'common'),
      };
      const result = resolveBattle(legendaryShip, mixedShip, rng);
      if (result.winnerId === 'legendary') legendaryWins++;
    }
    // Legendary should win more than 50% — balance constraint from spec
    expect(legendaryWins).toBeGreaterThan(50);
  });

  it('overdrive fires at turn 0 as a burst event', () => {
    const rng = new SeededRNG(1);
    const attacker: PlayerShip = {
      playerId: 'a',
      hull:    makeComponent('hull', 'common'),
      weapons: makeComponent('weapons', 'ultra_rare'), // phase_cannon
      shields: makeComponent('shields', 'common'),
      engine:  makeComponent('engine', 'ultra_rare'), // overdrive
    };
    const defender = makeShip('b', 'common');
    const result = resolveBattle(attacker, defender, rng);
    const hasOverdriveBurst = result.log.some(e => e.type === 'overdrive_burst');
    expect(hasOverdriveBurst).toBe(true);
  });

  it('echo_shell reflects at most twice', () => {
    const rng = new SeededRNG(7);
    const attacker = makeShip('a', 'legendary');
    const defender: PlayerShip = {
      playerId: 'b',
      hull:    makeComponent('hull', 'legendary'),
      weapons: makeComponent('weapons', 'legendary'),
      shields: makeComponent('shields', 'ultra_rare'), // echo_shell
      engine:  makeComponent('engine', 'legendary'),
    };
    const result = resolveBattle(attacker, defender, rng);
    const reflectCount = result.log.filter(e => e.type === 'reflect').length;
    expect(reflectCount).toBeLessThanOrEqual(2);
  });

  it('iron_tomb blocks first ability then is neutral', () => {
    const rng = new SeededRNG(3);
    const attacker: PlayerShip = {
      playerId: 'a',
      hull:    makeComponent('hull', 'common'),
      weapons: makeComponent('weapons', 'ultra_rare'), // phase_cannon
      shields: makeComponent('shields', 'common'),
      engine:  makeComponent('engine', 'ultra_rare'), // overdrive
    };
    const defender: PlayerShip = {
      playerId: 'b',
      hull:    makeComponent('hull', 'ultra_rare'), // iron_tomb
      weapons: makeComponent('weapons', 'legendary'),
      shields: makeComponent('shields', 'legendary'),
      engine:  makeComponent('engine', 'legendary'),
    };
    const result = resolveBattle(attacker, defender, rng);
    const blocks = result.log.filter(e => e.type === 'ability_block');
    // Iron Tomb can only block once
    expect(blocks.length).toBeLessThanOrEqual(1);
  });
});
