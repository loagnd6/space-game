export type ResourceType = 'ore' | 'crystal' | 'gas' | 'water';

export type ItemType =
  | 'resource_bundle'
  | 'boost_token'
  | 'blueprint'
  | 'ship_component'
  | 'component_fragment'
  | 'spin_ticket'
  | 'cosmetic_skin';

export interface InventoryItem {
  id: string;
  playerId: string;
  itemType: ItemType;
  /** Slot for ship_component/fragment; resource kind for resource_bundle; etc. */
  itemData: Record<string, unknown>;
  quantity: number;
  isSoulBound: boolean;
  acquiredAt: string; // ISO 8601
}
