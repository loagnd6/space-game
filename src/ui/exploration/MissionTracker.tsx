import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useExplorationStore } from '@/src/stores/useExplorationStore';
import { COLORS, RADIUS, SPACING } from '@/src/constants/theme';
import type { StarSystem } from '@/src/types';

interface Props {
  onSelectSystem(sys: StarSystem): void;
}

export function MissionTracker({ onSelectSystem }: Props) {
  const { activeMissions, starSystems, checkArrivals } = useExplorationStore();
  const [now, setNow] = useState<number>(() => Date.now());

  // Refresh every 10 s so progress bars animate
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      checkArrivals();
    }, 10_000);
    return () => clearInterval(id);
  }, [checkArrivals]);

  const active = activeMissions.filter(m => m.status === 'in_transit' || m.status === 'arrived');
  if (active.length === 0) return null;

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {active.map(mission => {
          const sys = starSystems.find(s => s.id === mission.systemId);
          if (!sys) return null;

          const progress = mission.status === 'arrived'
            ? 1
            : Math.min(1, (now - mission.departedAt) / (mission.arrivesAt - mission.departedAt));
          const arrived = mission.status === 'arrived';

          return (
            <Pressable key={mission.id} style={styles.chip} onPress={() => onSelectSystem(sys)}>
              <Text style={styles.chipName} numberOfLines={1}>{sys.name}</Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` },
                              arrived && styles.progressArrived]} />
              </View>
              <Text style={styles.chipStatus}>{arrived ? 'Collect!' : `${Math.round(progress * 100)}%`}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { backgroundColor: COLORS.surface, borderTopWidth: 1,
                     borderTopColor: COLORS.border },
  row:             { padding: SPACING.sm, gap: SPACING.sm },
  chip:            { backgroundColor: COLORS.background, borderRadius: RADIUS.sm,
                     padding: SPACING.sm, minWidth: 100, gap: 4 },
  chipName:        { color: COLORS.text, fontSize: 12, fontWeight: '600' },
  progressTrack:   { height: 4, backgroundColor: COLORS.border, borderRadius: 2, overflow: 'hidden' },
  progressFill:    { height: '100%', backgroundColor: COLORS.primary, borderRadius: 2 },
  progressArrived: { backgroundColor: '#10B981' },
  chipStatus:      { color: COLORS.muted, fontSize: 11 },
});
