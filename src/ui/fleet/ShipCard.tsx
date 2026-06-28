import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, FONT, RADIUS, SPACING } from '@/src/constants/theme';

interface Props {
  name: string;
  subtitle: string;
  onPress: () => void;
}

export function ShipCard({ name, subtitle, onPress }: Props) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>🚀</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    gap: SPACING.md,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 26 },
  info: { flex: 1, gap: 2 },
  name: { color: COLORS.text, fontSize: FONT.md, fontWeight: '700' },
  subtitle: { color: COLORS.muted, fontSize: FONT.sm },
  chevron: { color: COLORS.muted, fontSize: 22 },
});
