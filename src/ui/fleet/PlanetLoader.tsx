import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { COLORS } from '@/src/constants/theme';

export function PlanetLoader() {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 3000, easing: Easing.linear }),
      -1,
      false,
    );
  }, [rotation]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ rotateZ: `${rotation.value}deg` }],
  }));

  return (
    <View style={styles.wrapper}>
      <View style={styles.planet} />
      <Animated.View style={[styles.ring, ringStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planet: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primary,
    opacity: 0.85,
  },
  ring: {
    position: 'absolute',
    width: 110,
    height: 40,
    borderRadius: 55,
    borderWidth: 3,
    borderColor: COLORS.accent,
    opacity: 0.7,
  },
});
