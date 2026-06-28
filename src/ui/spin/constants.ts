export const REEL_TOTAL = 40;
export const WINNER_INDEX = 34;
export const VISIBLE_CARDS = 5;

export const CARD_WIDTH = 88;
export const CARD_HEIGHT = 110;
export const CARD_MARGIN = 8;
export const CARD_STEP = CARD_WIDTH + CARD_MARGIN; // px per card slot

export const REEL_CONTAINER_WIDTH = VISIBLE_CARDS * CARD_STEP;

export const ANIM = {
  FAST_MS: 500,
  DECEL_MS: 600,
  PAUSE_MS: 150,
  LURCH_MS: 300,
} as const;
