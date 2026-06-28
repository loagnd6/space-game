import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, FONT, SPACING } from '@/src/constants/theme';
import { useShipStore } from '@/src/stores/useShipStore';
import { SLOT_ORDER } from './constants';
import { calcPowerScore } from './powerScore';
import { RadarChart } from './RadarChart.tsx';
import { PowerScore } from './PowerScore.tsx';
import { LoadoutSlot } from './LoadoutSlot.tsx';
import { PlanetLoader } from './PlanetLoader';

export function LoadoutScreen() {
  const {
    equippedComponents,
    ownedComponents,
    fragmentCounts,
    fetchShip,
    equipComponent,
    combineFragmentsForSlot,
  } = useShipStore();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchShip()
      .catch(() => {
        if (!cancelled) setError('Failed to load ship data.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [fetchShip, retryCount]);

  const load = useCallback(() => {
    setIsLoading(true);
    setError(null);
    setRetryCount(c => c + 1);
  }, []);

  const powerScore = calcPowerScore(equippedComponents);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <PlanetLoader />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={load}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Loadout</Text>

        <View style={styles.statsRow}>
          <RadarChart equipped={equippedComponents} />
          <PowerScore score={powerScore} />
        </View>

        <View style={styles.slots}>
          {SLOT_ORDER.map(slot => (
            <LoadoutSlot
              key={slot}
              slot={slot}
              equippedComponent={equippedComponents[slot]}
              ownedComponents={ownedComponents.filter(c => c.slot === slot)}
              fragmentCount={fragmentCounts[slot]}
              onEquip={equipComponent}
              onCombine={() => combineFragmentsForSlot(slot)}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: COLORS.background },
  container:      { padding: SPACING.lg, gap: SPACING.xl },
  title:          { color: COLORS.text, fontSize: FONT.xl, fontWeight: '700' },
  statsRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  slots:          { gap: SPACING.md },
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.lg },
  errorText:      { color: COLORS.danger, fontSize: FONT.md, textAlign: 'center' },
  retryButton:    { backgroundColor: COLORS.primary, borderRadius: 8, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm },
  retryText:      { color: COLORS.background, fontSize: FONT.md, fontWeight: '700' },
});
