import { MARKETPLACE } from '@/src/constants/game';

export function formatTimeLeft(expiresAt: string): string {
  const msLeft = new Date(expiresAt).getTime() - Date.now();
  if (msLeft <= 0) return 'Expired';
  const totalMinutes = Math.floor(msLeft / 60_000);
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours >= 24) {
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    return `${days}d ${hours}h left`;
  }
  return `${totalHours}h ${totalMinutes % 60}m left`;
}

export function receivedAfterFee(priceLumens: number): number {
  return Math.floor(priceLumens * (1 - MARKETPLACE.LISTING_FEE_PERCENT));
}

const ITEM_TYPE_LABELS: Record<string, string> = {
  resource_bundle: 'Resource Bundle',
  boost_token: 'Boost Token',
  blueprint: 'Blueprint',
  ship_component: 'Ship Component',
  component_fragment: 'Fragment',
  spin_ticket: 'Spin Ticket',
  cosmetic_skin: 'Cosmetic Skin',
};

export function formatItemTypeLabel(itemType: string): string {
  return ITEM_TYPE_LABELS[itemType] ?? itemType;
}
