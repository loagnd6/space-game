import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, FONT, RADIUS, SPACING } from '@/src/constants/theme';
import { FRAGMENT_COMBINE_COUNT } from '@/src/constants/game';
import type { ComponentSlot, ShipComponent } from '@/src/game/ships/types';
import { SLOT_LABELS, SLOT_ICONS } from './constants';
import { SLOT_STYLES } from './slotStyles';
import { TIER_STYLES } from '@/src/ui/spin/tierStyles';
import { ComponentCard } from './ComponentCard';
import { shouldPromptCombine, sortByTier } from './loadoutSlot';

interface Props {
  slot: ComponentSlot;
  equippedComponent: ShipComponent | null;
  ownedComponents: ShipComponent[];
  fragmentCount: number;
  onEquip: (component: ShipComponent) => Promise<void>;
  onCombine: () => Promise<ShipComponent | null>;
}

export function LoadoutSlot({
  slot, equippedComponent, ownedComponents, fragmentCount, onEquip, onCombine,
}: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const slotStyle = SLOT_STYLES[slot];
  const equippedTier = equippedComponent ? TIER_STYLES[equippedComponent.tier] : null;

  function openPicker() {
    if (shouldPromptCombine(fragmentCount)) {
      Alert.alert(
        'Combine Fragments',
        `You have ${fragmentCount} ${SLOT_LABELS[slot]} fragments — combine into an Uncommon component?`,
        [
          { text: 'No', style: 'cancel', onPress: () => setIsExpanded(e => !e) },
          {
            text: 'Yes',
            onPress: async () => {
              await onCombine();
              setIsExpanded(true);
            },
          },
        ],
      );
    } else {
      setIsExpanded(e => !e);
    }
  }

  async function handleEquip(component: ShipComponent) {
    await onEquip(component);
    setIsExpanded(false);
  }

  const sortedComponents = sortByTier(ownedComponents);

  return (
    <View style={[styles.container, isExpanded && { borderColor: slotStyle.accent }]}>
      <TouchableOpacity style={styles.header} onPress={openPicker} activeOpacity={0.7}>
        <View style={styles.headerLeft}>
          <Text style={[styles.icon, { color: slotStyle.accent }]}>
            {SLOT_ICONS[slot]}
          </Text>
          <Text style={styles.slotLabel}>{SLOT_LABELS[slot]}</Text>
        </View>

        <View style={styles.headerRight}>
          {equippedComponent && equippedTier ? (
            <View style={[styles.equippedBadge, { backgroundColor: equippedTier.glow }]}>
              <Text style={[styles.equippedText, { color: equippedTier.border }]}>
                {equippedTier.label} · {equippedComponent.statMultiplier}×
              </Text>
            </View>
          ) : (
            <Text style={styles.noneText}>None equipped</Text>
          )}
          <Text style={[styles.chevron, isExpanded && styles.chevronExpanded]}>›</Text>
        </View>
      </TouchableOpacity>

      {isExpanded ? (
        <View style={styles.pickerContainer}>
          {sortedComponents.length === 0 ? (
            <Text style={styles.emptyText}>
              No other components for this slot yet. Try spinning!
            </Text>
          ) : (
            <ScrollView
              horizontal={false}
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {sortedComponents.map(component => (
                <ComponentCard
                  key={component.id}
                  component={component}
                  isEquipped={component.id === equippedComponent?.id}
                  onEquip={handleEquip}
                />
              ))}
            </ScrollView>
          )}
          {fragmentCount > 0 && fragmentCount < FRAGMENT_COMBINE_COUNT ? (
            <Text style={styles.fragmentHint}>
              {fragmentCount}/{FRAGMENT_COMBINE_COUNT} fragments — keep spinning to combine
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
  },
  headerLeft:      { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  headerRight:     { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  icon:            { fontSize: 20 },
  slotLabel:       { color: COLORS.text, fontSize: FONT.md, fontWeight: '600' },
  equippedBadge:   { borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 2 },
  equippedText:    { fontSize: 12, fontWeight: '700' },
  noneText:        { color: COLORS.muted, fontSize: FONT.sm },
  chevron:         { color: COLORS.muted, fontSize: 20, transform: [{ rotate: '0deg' }] },
  chevronExpanded: { transform: [{ rotate: '90deg' }] },
  pickerContainer: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.md, gap: SPACING.sm },
  scroll:          { maxHeight: 320 },
  scrollContent:   { gap: SPACING.sm },
  emptyText:       { color: COLORS.muted, fontSize: FONT.sm, textAlign: 'center', paddingVertical: SPACING.md },
  fragmentHint:    { color: COLORS.muted, fontSize: 12, textAlign: 'center' },
});
