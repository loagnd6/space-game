import { MARKETPLACE } from '@/src/constants/game';
import type { InventoryItem } from '@/src/types/inventory';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateListing(
  item: InventoryItem,
  priceLumens: number,
  activeListingCount: number,
): ValidationResult {
  if (item.isSoulBound) {
    return { valid: false, error: 'Soul-bound items cannot be listed on the auction house' };
  }
  if (activeListingCount >= MARKETPLACE.MAX_ACTIVE_LISTINGS) {
    return { valid: false, error: `Listing limit reached (max ${MARKETPLACE.MAX_ACTIVE_LISTINGS})` };
  }
  if (priceLumens <= 0) {
    return { valid: false, error: 'Price must be greater than 0 Lumens' };
  }
  return { valid: true };
}

export function calculateFee(priceLumens: number): number {
  return Math.floor(priceLumens * MARKETPLACE.LISTING_FEE_PERCENT);
}
