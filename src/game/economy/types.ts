export type LumenReason =
  | 'raid_win'
  | 'daily_mission'
  | 'auction_sale'
  | 'auction_purchase'
  | 'seasonal_bonus'
  | 'auction_fee';

export interface MarketplaceListing {
  id: string;
  sellerId: string;
  itemType: string;
  itemData: Record<string, unknown>;
  priceLumens: number;
  listedAt: string;
  expiresAt: string;
}

export interface LumenLedgerEntry {
  id: string;
  playerId: string;
  /** Positive = credit, negative = debit. */
  delta: number;
  reason: LumenReason;
  relatedId?: string;
  createdAt: string;
}
