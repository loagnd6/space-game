import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { COLORS, FONT, RADIUS, SPACING } from '@/src/constants/theme';
import { TIER_STYLES } from './tierStyles';
import type { ReelItem } from './reelData';

type Props = { item: ReelItem | null };

export function SpinResult({ item }: Props) {
  // eslint-disable-next-line react-hooks/refs -- Animated.Value is a stable imperative object, not React state
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!item) {
      opacity.setValue(0);
      return;
    }
    Animated.timing(opacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [item, opacity]);

  if (!item) return <View style={styles.placeholder} />;

  const tierStyle = TIER_STYLES[item.tier];

  return (
    <Animated.View style={[styles.row, { opacity }]}>
      <Text style={styles.icon}>{item.icon}</Text>
      <View style={styles.text}>
        <Text style={styles.label}>{item.label}</Text>
        <Text style={styles.sublabel}>{item.sublabel}</Text>
      </View>
      <View
        style={[
          styles.badge,
          { backgroundColor: tierStyle.border + '30', borderColor: tierStyle.border },
        ]}
      >
        <Text style={[styles.badgeText, { color: tierStyle.border }]}>{tierStyle.label}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  placeholder: { height: 56 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  icon: { fontSize: 28 },
  text: { flex: 1 },
  label: { color: COLORS.text, fontSize: FONT.md, fontWeight: '600' },
  sublabel: { color: COLORS.muted, fontSize: FONT.sm - 2 },
  badge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
});
