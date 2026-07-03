import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { COLORS, FONT, RADIUS, SPACING } from '@/src/constants/theme';
import { TIER_STYLES } from './tierStyles';
import type { ReelItem } from './reelData';
import type { LootTier } from '@/src/game/spin/types';

type Props = { item: ReelItem | null };

// How elaborate the reveal celebration is per tier — rings pulse outward from the
// icon, sparks fly outward and fade. Common stays plain so rarer drops stand out.
const TIER_FX: Record<LootTier, { rings: number; sparks: number; bounce: boolean }> = {
  common:     { rings: 0, sparks: 0, bounce: false },
  uncommon:   { rings: 1, sparks: 0, bounce: true },
  rare:       { rings: 1, sparks: 4, bounce: true },
  legendary:  { rings: 2, sparks: 6, bounce: true },
  ultra_rare: { rings: 3, sparks: 8, bounce: true },
};

const SPARK_GLYPHS = ['✨', '⭐', '💫', '✦'];

function Ring({ trigger, index, color }: { trigger: string; index: number; color: string }) {
  const scale = useSharedValue(0.4);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = 0.4;
    opacity.value = 0.8;
    scale.value = withDelay(index * 150, withTiming(2, { duration: 700, easing: Easing.out(Easing.quad) }));
    opacity.value = withDelay(index * 150, withTiming(0, { duration: 700, easing: Easing.out(Easing.quad) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return <Animated.View pointerEvents="none" style={[styles.ring, { borderColor: color }, style]} />;
}

function Spark({ trigger, index, total, glyph }: { trigger: string; index: number; total: number; glyph: string }) {
  const progress = useSharedValue(0);
  const angle = (index / total) * Math.PI * 2;

  useEffect(() => {
    progress.value = 0;
    progress.value = withDelay(60, withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  const style = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [
      { translateX: Math.cos(angle) * 34 * progress.value },
      { translateY: Math.sin(angle) * 34 * progress.value },
      { scale: 1 - progress.value * 0.4 },
    ],
  }));

  return <Animated.Text pointerEvents="none" style={[styles.spark, style]}>{glyph}</Animated.Text>;
}

export function SpinResult({ item }: Props) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.85);

  useEffect(() => {
    if (!item) {
      opacity.value = 0;
      scale.value = 0.85;
      return;
    }
    const fx = TIER_FX[item.tier];
    opacity.value = withTiming(1, { duration: 250 });
    scale.value = fx.bounce
      ? withSequence(
          withTiming(1.12, { duration: 220, easing: Easing.out(Easing.quad) }),
          withTiming(1, { duration: 160, easing: Easing.inOut(Easing.quad) }),
        )
      : withTiming(1, { duration: 250 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  if (!item) return <View style={styles.placeholder} />;

  const tierStyle = TIER_STYLES[item.tier];
  const fx = TIER_FX[item.tier];
  const triggerKey = item.id;

  return (
    <Animated.View style={[styles.row, containerStyle]}>
      <View style={styles.iconWrap}>
        {Array.from({ length: fx.rings }, (_, i) => (
          <Ring key={`ring-${triggerKey}-${i}`} trigger={triggerKey} index={i} color={tierStyle.border} />
        ))}
        {Array.from({ length: fx.sparks }, (_, i) => (
          <Spark
            key={`spark-${triggerKey}-${i}`}
            trigger={triggerKey}
            index={i}
            total={fx.sparks}
            glyph={SPARK_GLYPHS[i % SPARK_GLYPHS.length]!}
          />
        ))}
        <Text style={styles.icon}>{item.icon}</Text>
      </View>
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
  iconWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
  },
  spark: {
    position: 'absolute',
    fontSize: 16,
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
