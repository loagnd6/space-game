/** Shared types used across game systems. */

export type UUID = string;

export interface Vec2 {
  x: number;
  y: number;
}

export interface Planet {
  id: UUID;
  name: string;
  position: Vec2;
  discovered: boolean;
  resourceRichness: number; // 0..1
}

export interface StarSystem {
  id: UUID;
  name: string;
  position: Vec2;
  planets: Planet[];
  dangerLevel: 1 | 2 | 3 | 4 | 5;
}

export interface Ship {
  id: UUID;
  name: string;
  hull: number;
  maxHull: number;
  shield: number;
  damage: number;
  speed: number;
}

export interface Fleet {
  id: UUID;
  ships: Ship[];
}

export interface Resources {
  credits: number;
  fuel: number;
  research: number;
}
