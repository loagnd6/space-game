/**
 * Progression system — tech tree, unlocks.
 * See game-design agent for unlock-curve reviews.
 */

export interface TechNode {
  id: string;
  name: string;
  cost: number;
  requires: string[];
  unlocked: boolean;
}

/** TODO: define the tech tree and unlock logic. */
export const TECH_TREE: TechNode[] = [];
