import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { COLORS } from '@/src/constants/theme';
import { CARD_STEP, REEL_CONTAINER_WIDTH, WINNER_INDEX, ANIM } from './constants';
import { ReelCard } from './ReelCard';
import type { ReelItem } from './reelData';

export interface SpinReelHandle {
  start(isFakeout: boolean, onDone: () => void): void;
}

// How many card slots from the left edge the center landing zone sits
const CENTER_SLOT = 2;

function toOffset(cardIndex: number): number {
  return -(cardIndex - CENTER_SLOT) * CARD_STEP;
}

type Props = {
  items: ReelItem[];
  centerIndex: number;
};

export const SpinReel = forwardRef<SpinReelHandle, Props>(function SpinReel(
  { items, centerIndex },
  ref,
) {
  const translateX = useRef(new Animated.Value(0)).current;

  useImperativeHandle(ref, () => ({
    start(isFakeout, onDone) {
      translateX.stopAnimation();
      translateX.setValue(0);

      // Phase 1: fast scroll to midpoint
      Animated.timing(translateX, {
        toValue: toOffset(15),
        duration: ANIM.FAST_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(() => {
        // Phase 2: decelerate toward fake-out or winner
        const phase2Target = isFakeout ? WINNER_INDEX - 1 : WINNER_INDEX;
        Animated.timing(translateX, {
          toValue: toOffset(phase2Target),
          duration: ANIM.DECEL_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(() => {
          if (!isFakeout) {
            onDone();
            return;
          }
          // Phase 3: brief pause, then a final smooth decelerate to the true winner
          // (same ease-out curve as phase 2, so the settle reads as one continuous
          // slowdown rather than a snap)
          setTimeout(() => {
            Animated.timing(translateX, {
              toValue: toOffset(WINNER_INDEX),
              duration: ANIM.LURCH_MS,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }).start(() => onDone());
          }, ANIM.PAUSE_MS);
        });
      });
    },
  }));

  return (
    <View style={styles.outer}>
      <View style={styles.pointer} />
      <View style={styles.clip}>
        <Animated.View style={[styles.track, { transform: [{ translateX }] }]}>
          {items.map((item, i) => (
            <ReelCard key={item.id} item={item} isCenter={i === centerIndex} />
          ))}
        </Animated.View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  outer: { alignItems: 'center' },
  pointer: {
    width: 0,
    height: 0,
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderTopWidth: 18,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: COLORS.primary,
    marginBottom: 20,
  },
  clip: {
    width: REEL_CONTAINER_WIDTH,
    overflow: 'hidden',
  },
  track: {
    flexDirection: 'row',
  },
});
