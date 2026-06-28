export type ComponentSlot = 'hull' | 'weapons' | 'shields' | 'engine';
export type ComponentTier = 'common' | 'uncommon' | 'rare' | 'legendary' | 'ultra_rare';
export type UltraRareAbility = 'iron_tomb' | 'phase_cannon' | 'overdrive' | 'echo_shell';

export interface ShipComponent {
  id: string;
  slot: ComponentSlot;
  tier: ComponentTier;
  /** Stat multiplier from COMPONENT_STAT_MULTIPLIERS. */
  statMultiplier: number;
  /** Only present for ultra_rare tier. */
  ability?: UltraRareAbility;
}

export interface PlayerShip {
  playerId: string;
  hull: ShipComponent;
  weapons: ShipComponent;
  shields: ShipComponent;
  engine: ShipComponent;
}

export interface Combatant {
  playerId: string;
  /** Current HP. Starts at hull.statMultiplier × 1000 base. */
  hp: number;
  maxHp: number;
  ship: PlayerShip;
  ironTombUsed: boolean;
  echoShellCharges: number; // counts down from ECHO_SHELL_MAX_CHARGES
}

export type BattleEventType = 'attack' | 'ability_block' | 'phase_bypass' | 'reflect' | 'overdrive_burst';

export interface BattleEvent {
  turn: number;
  type: BattleEventType;
  actorId: string;
  targetId: string;
  value: number;
  description: string;
}

export interface BattleResult {
  winnerId: string;
  loserId: string;
  log: BattleEvent[];
  turns: number;
}
