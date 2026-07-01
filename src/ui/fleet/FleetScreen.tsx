import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { COLORS, FONT, SPACING, RADIUS } from '@/src/constants/theme';
import { ShipCard } from './ShipCard';
import { useShipStore } from '@/src/stores/useShipStore';
import type { ComponentSlot } from '@/src/game/ships/types';

const SLOT_ORDER: ComponentSlot[] = ['hull', 'weapons', 'shields', 'engine'];

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function FleetScreen() {
  const router = useRouter();
  const equippedComponents = useShipStore(s => s.equippedComponents);

  const tierSummary = SLOT_ORDER
    .map(slot => {
      const c = equippedComponents[slot];
      return c ? capitalize(c.tier) : '-';
    })
    .join(' · ');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        <Text style={styles.title}>Ship Fleet</Text>
        <ShipCard
          name="Your Ship"
          subtitle={tierSummary}
          onPress={() => router.push('/fleet/player-ship')}
        />
        <Pressable style={styles.marketBtn} onPress={() => router.push('/fleet/market')}>
          <Text style={styles.marketBtnText}>Auction House →</Text>
        </Pressable>
        <Pressable style={styles.marketBtn} onPress={() => router.push('/fleet/explore')}>
          <Text style={styles.marketBtnText}>Star Map →</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1, paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, gap: SPACING.lg },
  title: { color: COLORS.text, fontSize: FONT.xl, fontWeight: '700' },
  marketBtn: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
  },
  marketBtnText: { color: COLORS.primary, fontSize: FONT.sm, fontWeight: '700' },
});
