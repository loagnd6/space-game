import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONT, RADIUS, SPACING } from '@/src/constants/theme';
import { TIER_STYLES } from './tierStyles';
import { CARD_WIDTH, CARD_HEIGHT, CARD_MARGIN } from './constants';
import type { ReelItem } from './reelData';

type Props = {
  item: ReelItem;
  isCenter?: boolean;
};

export function ReelCard({ item, isCenter }: Props) {
  const style = TIER_STYLES[item.tier];
  // eslint-disable-next-line react-hooks/refs -- Animated.Value is a stable imperative object, not React state
  const glowOpacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (!style.flashy) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowOpacity, { toValue: 1,   duration: 700, useNativeDriver: true }),
        Animated.timing(glowOpacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [style.flashy, glowOpacity]);

  return (
    <View
      style={[
        styles.card,
        { borderColor: style.border },
        isCenter && styles.cardCenter,
      ]}
    >
      {style.flashy && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            styles.glow,
            { opacity: glowOpacity, shadowColor: style.border },
          ]}
        />
      )}
      {style.flashy && (
        <LinearGradient
          colors={['transparent', style.glow, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[StyleSheet.absoluteFill, styles.shimmer]}
          pointerEvents="none"
        />
      )}
      <Text style={styles.icon}>{item.icon}</Text>
      <Text style={styles.label} numberOfLines={2}>{item.label}</Text>
      <Text style={styles.sublabel} numberOfLines={1}>{item.sublabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    marginRight: CARD_MARGIN,
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xs,
    overflow: 'hidden',
  },
  cardCenter: {
    transform: [{ scale: 1.05 }],
  },
  glow: {
    borderRadius: RADIUS.md,
    shadowOpacity: 0.9,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  shimmer: {
    borderRadius: RADIUS.md,
  },
  icon: { fontSize: 28 },
  label: {
    color: COLORS.text,
    fontSize: FONT.sm - 2,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
  },
  sublabel: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 2,
  },
});
