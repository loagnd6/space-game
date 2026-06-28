import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, FONT, RADIUS, SPACING } from '@/src/constants/theme';
import { TIER_STYLES } from '@/src/ui/spin/tierStyles';
import { ABILITY_NAMES, ABILITY_DESCRIPTIONS } from './constants';
import type { ShipComponent } from '@/src/game/ships/types';

interface Props {
  component: ShipComponent;
  isEquipped: boolean;
  onEquip: (component: ShipComponent) => void;
}

export function ComponentCard({ component, isEquipped, onEquip }: Props) {
  const tier = TIER_STYLES[component.tier];

  return (
    <View style={[styles.card, isEquipped && { borderColor: tier.border, borderWidth: 2 }]}>
      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: tier.glow }]}>
          <Text style={[styles.badgeText, { color: tier.border }]}>{tier.label}</Text>
        </View>
        <Text style={styles.multiplier}>{component.statMultiplier}×</Text>
      </View>

      {component.ability ? (
        <View style={styles.abilitySection}>
          <Text style={styles.abilityName}>{ABILITY_NAMES[component.ability]}</Text>
          <Text style={styles.abilityDesc}>{ABILITY_DESCRIPTIONS[component.ability]}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.button, isEquipped && styles.buttonEquipped]}
        onPress={() => onEquip(component)}
        disabled={isEquipped}
        accessibilityRole="button"
        accessibilityLabel={isEquipped ? 'Already equipped' : `Equip ${tier.label} component`}
      >
        <Text style={[styles.buttonText, isEquipped && styles.buttonTextEquipped]}>
          {isEquipped ? 'Equipped' : 'Equip'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.sm,
    minWidth: 160,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  multiplier: { color: COLORS.text, fontSize: FONT.md, fontWeight: '700' },
  abilitySection: { gap: 2 },
  abilityName: { color: COLORS.accent, fontSize: FONT.sm, fontWeight: '600' },
  abilityDesc: { color: COLORS.muted, fontSize: 12, lineHeight: 16 },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.xs,
    alignItems: 'center',
  },
  buttonEquipped: { backgroundColor: COLORS.border },
  buttonText: { color: COLORS.background, fontSize: FONT.sm, fontWeight: '700' },
  buttonTextEquipped: { color: COLORS.muted },
});
