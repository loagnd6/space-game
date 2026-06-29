// src/ui/fleet/MarketScreen.tsx
import React from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/src/services/supabase';
import type { MarketplaceListing } from '@/src/game/economy/types';
import { useEconomyStore } from '@/src/stores/useEconomyStore';
import { MARKETPLACE } from '@/src/constants/game';
import { COLORS, FONT, RADIUS, SPACING } from '@/src/constants/theme';
import { ListingCard } from './ListingCard';
import { ListItemModal } from './ListItemModal';

type Tab = 'browse' | 'my-listings';

export function MarketScreen() {
  const {
    lumenBalance, fetchBalance,
    marketplaceListings, fetchMarketplace,
    activeListings, fetchMyListings,
    buyListing,
  } = useEconomyStore();

  const [currentUserId, setCurrentUserId] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<Tab>('browse');
  const [refreshing, setRefreshing] = React.useState(false);
  const [browseError, setBrowseError] = React.useState<string | null>(null);
  const [modalVisible, setModalVisible] = React.useState(false);

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUserId(session?.user.id ?? null);
    });
    fetchBalance();
    fetchMarketplace().catch(() => setBrowseError('Failed to load listings.'));
    fetchMyListings();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    if (tab === 'browse') {
      setBrowseError(null);
      await fetchMarketplace().catch(() => setBrowseError('Failed to load listings.'));
      await fetchBalance();
    } else {
      await fetchMyListings();
    }
    setRefreshing(false);
  };

  const handleBuy = async (listingId: string): Promise<{ error?: string }> => {
    return buyListing(listingId);
  };

  const handleCancel = async (listingId: string): Promise<{ error?: string }> => {
    const { error } = await supabase.from('marketplace_listings').delete().eq('id', listingId);
    if (error) return { error: error.message };
    await fetchMyListings();
    return {};
  };

  const handleRetryBrowse = () => {
    setBrowseError(null);
    fetchMarketplace().catch(() => setBrowseError('Failed to load listings.'));
  };

  const renderListing = ({ item }: { item: MarketplaceListing }) => (
    <ListingCard
      listing={item}
      currentUserId={currentUserId ?? ''}
      lumenBalance={lumenBalance}
      mode={tab}
      onAction={tab === 'browse' ? handleBuy : handleCancel}
    />
  );

  const listings = tab === 'browse' ? marketplaceListings : activeListings;
  const emptyText = tab === 'browse'
    ? 'No listings yet — be the first to sell!'
    : 'You have no active listings.';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Auction House</Text>
        <View style={styles.balanceChip}>
          <Text style={styles.balanceText}>⚡ {lumenBalance.toLocaleString()}</Text>
        </View>
      </View>

      {/* Segmented Control */}
      <View style={styles.segmented}>
        {(['browse', 'my-listings'] as Tab[]).map(t => (
          <Pressable
            key={t}
            style={[styles.segment, tab === t && styles.segmentActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.segmentText, tab === t && styles.segmentTextActive]}>
              {t === 'browse' ? 'Browse' : 'My Listings'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Active listing count (My Listings tab only) */}
      {tab === 'my-listings' && (
        <Text style={styles.listingCount}>
          {activeListings.length} / {MARKETPLACE.MAX_ACTIVE_LISTINGS} active listings
        </Text>
      )}

      {/* Browse fetch error */}
      {tab === 'browse' && browseError && (
        <View style={styles.errorRow}>
          <Text style={styles.errorText}>{browseError}</Text>
          <Pressable onPress={handleRetryBrowse}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {/* Listings */}
      <FlatList
        data={listings}
        keyExtractor={item => item.id}
        renderItem={renderListing}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !browseError ? <Text style={styles.emptyText}>{emptyText}</Text> : null
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.primary}
          />
        }
      />

      {/* FAB */}
      <Pressable style={styles.fab} onPress={() => setModalVisible(true)}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      <ListItemModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSuccess={() => {
          setModalVisible(false);
          setTab('my-listings');
          fetchMyListings();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  title: { color: COLORS.text, fontSize: FONT.xl, fontWeight: '700' },
  balanceChip: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  balanceText: { color: COLORS.accent, fontSize: FONT.sm, fontWeight: '700' },
  segmented: {
    flexDirection: 'row',
    marginHorizontal: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: 4,
  },
  segment: { flex: 1, paddingVertical: SPACING.xs, alignItems: 'center', borderRadius: RADIUS.sm },
  segmentActive: { backgroundColor: COLORS.primary },
  segmentText: { color: COLORS.muted, fontSize: FONT.sm, fontWeight: '600' },
  segmentTextActive: { color: COLORS.background },
  listingCount: {
    color: COLORS.muted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  errorRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  errorText: { color: COLORS.danger, fontSize: FONT.sm },
  retryText: { color: COLORS.primary, fontSize: FONT.sm },
  list: { padding: SPACING.lg, paddingBottom: 80 },
  emptyText: { color: COLORS.muted, textAlign: 'center', paddingTop: SPACING.xl },
  fab: {
    position: 'absolute',
    bottom: SPACING.xl,
    right: SPACING.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fabText: { color: COLORS.background, fontSize: FONT.lg, fontWeight: '700', lineHeight: 28 },
});
