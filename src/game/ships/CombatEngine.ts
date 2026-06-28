import { SeededRNG } from '../rng';
import {
  COMPONENT_STAT_MULTIPLIERS,
  ULTRA_RARE_ABILITIES,
} from '@/src/constants/game';
import type { PlayerShip, Combatant, BattleResult, BattleEvent, BattleEventType } from './types';

const BASE_HP = 1000;
const BASE_DAMAGE = 100;
const BASE_SHIELD = 500;
const MAX_TURNS = 50; // safety cap — prevents infinite loops

export function buildCombatant(ship: PlayerShip): Combatant {
  const maxHp = Math.round(BASE_HP * ship.hull.statMultiplier);
  return {
    playerId: ship.playerId,
    hp: maxHp,
    maxHp,
    ship,
    ironTombUsed: false,
    echoShellCharges: ULTRA_RARE_ABILITIES.ECHO_SHELL_MAX_CHARGES,
  };
}

function shieldPool(ship: PlayerShip): number {
  return Math.round(BASE_SHIELD * ship.shields.statMultiplier);
}

function baseDamage(ship: PlayerShip): number {
  return Math.round(BASE_DAMAGE * ship.weapons.statMultiplier);
}

function makeEvent(
  turn: number,
  type: BattleEventType,
  actorId: string,
  targetId: string,
  value: number,
  description: string,
): BattleEvent {
  return { turn, type, actorId, targetId, value, description };
}

export function resolveBattle(
  attackerShip: PlayerShip,
  defenderShip: PlayerShip,
  rng: SeededRNG,
): BattleResult {
  const a = buildCombatant(attackerShip);
  const d = buildCombatant(defenderShip);
  const events: BattleEvent[] = [];

  // Mutable shield pools — deplete as they absorb damage
  const shields = {
    [attackerShip.playerId]: shieldPool(attackerShip),
    [defenderShip.playerId]: shieldPool(defenderShip),
  };

  // Overdrive: attacker engine fires burst before turn 1 (bypasses shields)
  if (attackerShip.engine.ability === 'overdrive') {
    const hpCost = Math.round(a.maxHp * ULTRA_RARE_ABILITIES.OVERDRIVE_HP_COST_PERCENT);
    const burst = Math.round(baseDamage(attackerShip) * ULTRA_RARE_ABILITIES.OVERDRIVE_BURST_MULTIPLIER);
    a.hp -= hpCost;
    d.hp -= burst;
    events.push(makeEvent(0, 'overdrive_burst', a.playerId, d.playerId, burst,
      `Overdrive: sacrificed ${hpCost} HP for ${burst} burst damage`));
  }

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    if (a.hp <= 0 || d.hp <= 0) break;

    // Attacker attacks defender — pass shield refs so they deplete
    applyAttack(a, d, shields, turn, rng, events);
    if (d.hp <= 0) break;

    // Defender attacks attacker
    applyAttack(d, a, shields, turn, rng, events);
  }

  const winnerId = a.hp > d.hp ? a.playerId : d.playerId;
  const loserId  = a.hp > d.hp ? d.playerId : a.playerId;

  return { winnerId, loserId, log: events, turns: events.length };
}

function applyAttack(
  actor: Combatant,
  target: Combatant,
  shields: Record<string, number>,
  turn: number,
  rng: SeededRNG,
  events: BattleEvent[],
): void {
  let damage = baseDamage(actor.ship);
  let bypassShield = false;

  // Phase Cannon: 20% chance to bypass shields
  if (actor.ship.weapons.ability === 'phase_cannon') {
    if (rng.next() < ULTRA_RARE_ABILITIES.PHASE_CANNON_BYPASS_CHANCE) {
      bypassShield = true;
      events.push(makeEvent(turn, 'phase_bypass', actor.playerId, target.playerId, damage,
        'Phase Cannon bypasses shields'));
    }
  }

  // Iron Tomb: block first ability proc against this target
  if (bypassShield && target.ship.hull.ability === 'iron_tomb' && !target.ironTombUsed) {
    target.ironTombUsed = true;
    bypassShield = false;
    events.push(makeEvent(turn, 'ability_block', target.playerId, actor.playerId, 0,
      'Iron Tomb blocks Phase Cannon bypass'));
    return;
  }

  if (bypassShield) {
    // Damage goes directly to HP, skipping shields
    target.hp -= damage;
    events.push(makeEvent(turn, 'attack', actor.playerId, target.playerId, damage,
      `Direct hull hit: ${damage} damage`));
  } else {
    // Shields absorb first and deplete permanently
    const targetShield = shields[target.playerId] ?? 0;
    const shieldAbsorb = Math.min(targetShield, damage);
    const hullDamage = damage - shieldAbsorb;
    shields[target.playerId] = targetShield - shieldAbsorb;
    target.hp -= hullDamage;
    if (hullDamage > 0) {
      events.push(makeEvent(turn, 'attack', actor.playerId, target.playerId, hullDamage,
        `${shieldAbsorb} absorbed by shields, ${hullDamage} to hull`));
    } else {
      events.push(makeEvent(turn, 'attack', actor.playerId, target.playerId, 0,
        `${shieldAbsorb} fully absorbed by shields`));
    }
  }

  // Echo Shell: reflect 15% back, max 2 times
  if (
    target.ship.shields.ability === 'echo_shell' &&
    target.echoShellCharges > 0 &&
    damage > 0
  ) {
    const reflected = Math.round(damage * ULTRA_RARE_ABILITIES.ECHO_SHELL_REFLECT_PERCENT);
    actor.hp -= reflected;
    target.echoShellCharges -= 1;
    events.push(makeEvent(turn, 'reflect', target.playerId, actor.playerId, reflected,
      `Echo Shell reflects ${reflected} damage (${target.echoShellCharges} charges left)`));
  }
}
