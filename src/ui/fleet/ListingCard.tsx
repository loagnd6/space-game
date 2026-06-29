// src/ui/fleet/ListingCard.tsx
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { MarketplaceListing } from '@/src/game/economy/types';
import type { LootTier } from '@/src/game/spin/types';
import { TIER_STYLES } from '@/src/ui/spin/tierStyles';
import { COLORS, FONT, RADIUS, SPACING } from '@/src/constants/theme';
import { formatItemTypeLabel, formatTimeLeft } from './marketStyles';

interface ListingCardProps {
  listing: MarketplaceListing;
  currentUserId: string;
  lumenBalance: number;
  mode: 'browse' | 'my-listings';
  onAction: (listingId: string) => Promise<{ error?: string }>;
}

export function ListingCard({ listing, currentUserId, lumenBalance, mode, onAction }: ListingCardProps) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isBrowse = mode === 'browse';
  const tier = listing.itemType === 'ship_component'
    ? (listing.itemData.tier as LootTier)
    : null;
  const tierStyle = tier ? TIER_STYLES[tier] : null;

  const actionDisabled = isBrowse
    ? listing.sellerId === currentUserId || lumenBalance < listing.priceLumens || busy
    : busy;

  const handleAction = async () => {
    setError(null);
    setBusy(true);
    const result = await onAction(listing.id);
    setBusy(false);
    if (result?.error) setError(result.error);
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.info}>
          <Text style={styles.label}>{formatItemTypeLabel(listing.itemType)}</Text>
          {tierStyle && (
            <View style={[styles.tierBadge, { borderColor: tierStyle.border }]}>
              <Text style={[styles.tierLabel, { color: tierStyle.border }]}>{tierStyle.label}</Text>
            </View>
          )}
        </View>
        <View style={styles.right}>
          <Text style={styles.price}>⚡ {listing.priceLumens.toLocaleString()} Lumens</Text>
          <Text style={styles.timeLeft}>{formatTimeLeft(listing.expiresAt)}</Text>
          <Pressable
            style={[styles.actionBtn, actionDisabled && styles.actionBtnDisabled]}
            onPress={handleAction}
            disabled={actionDisabled}
          >
            {busy
              ? <ActivityIndicator size="small" color={COLORS.background} />
              : <Text style={styles.actionBtnText}>{isBrowse ? 'Buy' : 'Cancel'}</Text>
            }
          </Pressable>
        </View>
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  info: { flex: 1, gap: SPACING.xs },
  label: { color: COLORS.text, fontSize: FONT.sm, fontWeight: '600' },
  tierBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
  },
  tierLabel: { fontSize: 11, fontWeight: '700' },
  right: { alignItems: 'flex-end', gap: SPACING.xs },
  price: { color: COLORS.accent, fontSize: FONT.sm, fontWeight: '600' },
  timeLeft: { color: COLORS.muted, fontSize: 12 },
  actionBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    minWidth: 64,
    alignItems: 'center',
  },
  actionBtnDisabled: { opacity: 0.4 },
  actionBtnText: { color: COLORS.background, fontSize: FONT.sm, fontWeight: '700' },
  errorText: { color: COLORS.danger, fontSize: 12, marginTop: SPACING.xs },
});
