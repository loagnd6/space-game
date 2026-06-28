import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { COLORS, FONT, SPACING } from '@/src/constants/theme';
import { ShipCard } from './ShipCard';

export function FleetScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        <Text style={styles.title}>Ship Fleet</Text>
        <ShipCard
          name="Your Ship"
          subtitle="Tap to manage loadout"
          onPress={() => router.push('/fleet/player-ship')}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1, paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, gap: SPACING.lg },
  title: { color: COLORS.text, fontSize: FONT.xl, fontWeight: '700' },
});
