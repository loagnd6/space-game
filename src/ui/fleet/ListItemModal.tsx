// src/ui/fleet/ListItemModal.tsx
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import type { InventoryItem } from '@/src/types/inventory';
import type { LootTier } from '@/src/game/spin/types';
import { useEconomyStore } from '@/src/stores/useEconomyStore';
import { TIER_STYLES } from '@/src/ui/spin/tierStyles';
import { MARKETPLACE } from '@/src/constants/game';
import { COLORS, FONT, RADIUS, SPACING } from '@/src/constants/theme';
import { formatItemTypeLabel, receivedAfterFee } from './marketStyles';

interface ListItemModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ListItemModal({ visible, onClose, onSuccess }: ListItemModalProps) {
  const { inventory, fetchInventory, listItem } = useEconomyStore();
  const [step, setStep] = React.useState<1 | 2>(1);
  const [selectedItem, setSelectedItem] = React.useState<InventoryItem | null>(null);
  const [priceInput, setPriceInput] = React.useState('');
  const [loadingInventory, setLoadingInventory] = React.useState(false);
  const [inventoryError, setInventoryError] = React.useState<string | null>(null);
  const [listingBusy, setListingBusy] = React.useState(false);
  const [listingError, setListingError] = React.useState<string | null>(null);

  const loadInventory = React.useCallback(() => {
    setLoadingInventory(true);
    setInventoryError(null);
    fetchInventory()
      .catch(() => setInventoryError('Failed to load inventory. Tap Retry.'))
      .finally(() => setLoadingInventory(false));
  }, [fetchInventory]);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (visible) loadInventory();
  }, [visible, loadInventory]);

  const reset = () => {
    setStep(1);
    setSelectedItem(null);
    setPriceInput('');
    setListingError(null);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleBack = () => {
    if (step === 2) {
      setStep(1);
      setPriceInput('');
      setListingError(null);
    } else {
      handleClose();
    }
  };

  const handleSelectItem = (item: InventoryItem) => {
    setSelectedItem(item);
    setStep(2);
  };

  const handleConfirm = async () => {
    if (!selectedItem) return;
    const price = parseInt(priceInput, 10);
    setListingBusy(true);
    setListingError(null);
    const result = await listItem(selectedItem, price);
    setListingBusy(false);
    if (result.error) { setListingError(result.error); return; }
    reset();
    onSuccess();
    Alert.alert('Listed!', 'Your item is now on the auction house.');
  };

  const price = parseInt(priceInput, 10);
  const received = !isNaN(price) && price > 0 ? receivedAfterFee(price) : null;
  const feePercent = Math.round(MARKETPLACE.LISTING_FEE_PERCENT * 100);
  const confirmDisabled = listingBusy || !priceInput || isNaN(price) || price <= 0;

  const tradeable = inventory.filter(i => !i.isSoulBound);
  const soulBound = inventory.filter(i => i.isSoulBound);
  const allItems = [...tradeable, ...soulBound];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.container}>
        <TouchableWithoutFeedback onPress={handleClose}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
        <KeyboardAvoidingView
          style={styles.sheet}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={handleBack} style={styles.backBtn}>
              <Text style={styles.backText}>← Back</Text>
            </Pressable>
            <Text style={styles.headerTitle}>{step === 1 ? 'Select Item' : 'Set Price'}</Text>
            <View style={styles.backBtn} />
          </View>

          {/* Step 1: Item Picker */}
          {step === 1 && (
            loadingInventory ? (
              <ActivityIndicator color={COLORS.primary} style={styles.centered} />
            ) : inventoryError ? (
              <View style={styles.centered}>
                <Text style={styles.errorText}>{inventoryError}</Text>
                <Pressable onPress={loadInventory}>
                  <Text style={styles.retryText}>Retry</Text>
                </Pressable>
              </View>
            ) : allItems.length === 0 ? (
              <View style={styles.centered}>
                <Text style={styles.emptyText}>
                  Nothing to list — earn tradeable items from Spin and raids.
                </Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={styles.list}>
                {allItems.map(item => {
                  const tier = item.itemType === 'ship_component'
                    ? (item.itemData.tier as LootTier)
                    : null;
                  const tierStyle = tier ? TIER_STYLES[tier] : null;
                  return (
                    <Pressable
                      key={item.id}
                      style={[styles.inventoryRow, item.isSoulBound && styles.soulBoundRow]}
                      onPress={() => !item.isSoulBound && handleSelectItem(item)}
                      disabled={item.isSoulBound}
                    >
                      <View style={styles.inventoryInfo}>
                        <Text style={[styles.inventoryLabel, item.isSoulBound && styles.mutedText]}>
                          {item.isSoulBound ? '🔒 ' : ''}{formatItemTypeLabel(item.itemType)}
                        </Text>
                        {tierStyle && (
                          <View style={[styles.tierBadge, { borderColor: tierStyle.border }]}>
                            <Text style={[styles.tierLabel, { color: tierStyle.border }]}>
                              {tierStyle.label}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.quantityText, item.isSoulBound && styles.mutedText]}>
                        ×{item.quantity}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )
          )}

          {/* Step 2: Price Setter */}
          {step === 2 && (
            <View style={styles.priceSetter}>
              {selectedItem && (
                <View style={styles.selectedSummary}>
                  <Text style={styles.selectedLabel}>{formatItemTypeLabel(selectedItem.itemType)}</Text>
                </View>
              )}
              <TextInput
                style={styles.priceInput}
                placeholder="Price in Lumens"
                placeholderTextColor={COLORS.muted}
                keyboardType="numeric"
                value={priceInput}
                onChangeText={setPriceInput}
              />
              {received !== null && (
                <Text style={styles.feePreview}>
                  {feePercent}% fee — you receive {received.toLocaleString()} Lumens
                </Text>
              )}
              {listingError && <Text style={styles.errorText}>{listingError}</Text>}
              <Pressable
                style={[styles.confirmBtn, confirmDisabled && styles.confirmBtnDisabled]}
                onPress={handleConfirm}
                disabled={confirmDisabled}
              >
                {listingBusy
                  ? <ActivityIndicator size="small" color={COLORS.background} />
                  : <Text style={styles.confirmBtnText}>Confirm</Text>
                }
              </Pressable>
            </View>
          )}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { flex: 1, backgroundColor: '#00000080' },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    maxHeight: '75%',
    paddingBottom: SPACING.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: { width: 60 },
  backText: { color: COLORS.primary, fontSize: FONT.sm },
  headerTitle: { color: COLORS.text, fontSize: FONT.md, fontWeight: '700' },
  centered: { padding: SPACING.xl, alignItems: 'center', gap: SPACING.sm },
  emptyText: { color: COLORS.muted, textAlign: 'center', fontSize: FONT.sm },
  errorText: { color: COLORS.danger, fontSize: FONT.sm, textAlign: 'center' },
  retryText: { color: COLORS.primary, fontSize: FONT.sm },
  list: { padding: SPACING.md, gap: SPACING.sm },
  inventoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
  },
  soulBoundRow: { opacity: 0.5 },
  inventoryInfo: { gap: SPACING.xs },
  inventoryLabel: { color: COLORS.text, fontSize: FONT.sm },
  mutedText: { color: COLORS.muted },
  tierBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
  },
  tierLabel: { fontSize: 11, fontWeight: '700' },
  quantityText: { color: COLORS.accent, fontSize: FONT.sm },
  priceSetter: { padding: SPACING.lg, gap: SPACING.md },
  selectedSummary: { backgroundColor: COLORS.background, borderRadius: RADIUS.sm, padding: SPACING.sm },
  selectedLabel: { color: COLORS.text, fontSize: FONT.sm, fontWeight: '600' },
  priceInput: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    color: COLORS.text,
    fontSize: FONT.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  feePreview: { color: COLORS.muted, fontSize: FONT.sm },
  confirmBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
  },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmBtnText: { color: COLORS.background, fontSize: FONT.md, fontWeight: '700' },
});
