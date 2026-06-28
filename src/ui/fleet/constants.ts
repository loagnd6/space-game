import type { ComponentSlot, UltraRareAbility } from '@/src/game/ships/types';

export const SLOT_ORDER: ComponentSlot[] = ['hull', 'weapons', 'shields', 'engine'];

export const SLOT_LABELS: Record<ComponentSlot, string> = {
  hull:    'Hull',
  weapons: 'Weapons',
  shields: 'Shields',
  engine:  'Engine',
};

export const SLOT_ICONS: Record<ComponentSlot, string> = {
  hull:    '🛸',
  weapons: '⚡',
  shields: '🛡',
  engine:  '🔥',
};

export const ABILITY_NAMES: Record<UltraRareAbility, string> = {
  iron_tomb:    'Iron Tomb',
  phase_cannon: 'Phase Cannon',
  overdrive:    'Overdrive',
  echo_shell:   'Echo Shell',
};

export const ABILITY_DESCRIPTIONS: Record<UltraRareAbility, string> = {
  iron_tomb:    'Blocks the first opponent ability proc per battle, then becomes neutral.',
  phase_cannon: '20% chance per shot to bypass shields entirely.',
  overdrive:    'Sacrifice 10% own HP at battle start for 1.5× burst damage.',
  echo_shell:   'Reflects 15% damage back to attacker, maximum 2 times per battle.',
};
