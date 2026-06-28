import { StyleSheet, Text, View } from 'react-native';
import { COLORS, FONT, SPACING } from '@/src/constants/theme';
import { MAX_POWER_SCORE } from './powerScore';

interface Props {
  score: number;
}

export function PowerScore({ score }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Power</Text>
      <Text style={styles.score}>{score.toFixed(1)}</Text>
      <Text style={styles.max}>/ {MAX_POWER_SCORE.toFixed(1)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: SPACING.xs },
  label:     { color: COLORS.muted, fontSize: FONT.sm, fontWeight: '600', letterSpacing: 1 },
  score:     { color: COLORS.primary, fontSize: FONT.xl, fontWeight: '700' },
  max:       { color: COLORS.muted, fontSize: FONT.sm },
});
