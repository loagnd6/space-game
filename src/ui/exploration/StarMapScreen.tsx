import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Canvas, Circle, Line, Path, Skia, vec } from '@shopify/react-native-skia';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useExplorationStore } from '@/src/stores/useExplorationStore';
import { EXPLORATION } from '@/src/constants/game';
import { COLORS, FONT, SPACING } from '@/src/constants/theme';
import type { StarSystem } from '@/src/types';
import type { FleetMission, DiscoveryResult } from '@/src/types/exploration';
import { MissionTracker } from './MissionTracker';
import { SystemSheet } from './SystemSheet';

const MAP = EXPLORATION.MAP_SIZE;
const LANE_MAX = EXPLORATION.TRAVEL_LANE_MAX_DIST;
const NODE_R = 12;

function nodeColor(
  systemId: string,
  missions: FleetMission[],
  discoveries: DiscoveryResult[],
): string {
  const m = missions.find(m => m.systemId === systemId);
  if (m?.status === 'in_transit') return '#F59E0B';
  if (m?.status === 'arrived')    return '#10B981';
  if (discoveries.some(d => d.systemId === systemId)) return '#3B82F6';
  return '#6B7280';
}

export function StarMapScreen() {
  const { starSystems, activeMissions, discoveries, checkArrivals } = useExplorationStore();
  const [selected, setSelected] = useState<StarSystem | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    checkArrivals();
    // Center the scroll view on Sol (1000, 1000) after first layout
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ x: 700, y: 700, animated: false });
    }, 100);
    return () => clearTimeout(timer);
  }, [checkArrivals]);

  // Build travel lanes between nearby systems
  const lanes: [StarSystem, StarSystem][] = [];
  for (let i = 0; i < starSystems.length; i++) {
    for (let j = i + 1; j < starSystems.length; j++) {
      const a = starSystems[i]!, b = starSystems[j]!;
      if (Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y) <= LANE_MAX) {
        lanes.push([a, b]);
      }
    }
  }

  // Home system ring path
  const home = starSystems.find(s => s.id === 'sol-home');
  const ringPath = home
    ? (() => {
        const p = Skia.Path.Make();
        p.addCircle(home.position.x, home.position.y, NODE_R + 5);
        return p;
      })()
    : null;

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Star Map</Text>
        <Text style={styles.fuelLabel}>⛽ {useExplorationStore.getState().fuel} fuel</Text>
      </View>

      {/* Map */}
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.mapContainer}
        minimumZoomScale={0.3}
        maximumZoomScale={2}
        pinchGestureEnabled
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        {/* Skia canvas: lanes + nodes */}
        <Canvas style={StyleSheet.absoluteFill}>
          {lanes.map(([a, b], i) => (
            <Line
              key={`lane-${i}`}
              p1={vec(a.position.x, a.position.y)}
              p2={vec(b.position.x, b.position.y)}
              color="#374151"
              strokeWidth={1}
            />
          ))}
          {starSystems.map(sys => (
            <Circle
              key={sys.id}
              cx={sys.position.x}
              cy={sys.position.y}
              r={NODE_R}
              color={nodeColor(sys.id, activeMissions, discoveries)}
            />
          ))}
          {ringPath && (
            <Path path={ringPath} color="white" style="stroke" strokeWidth={2} />
          )}
        </Canvas>

        {/* Invisible tap targets over each node */}
        {starSystems.map(sys => (
          <Pressable
            key={`tap-${sys.id}`}
            style={[
              styles.nodeTap,
              { left: sys.position.x - NODE_R * 2, top: sys.position.y - NODE_R * 2 },
            ]}
            onPress={() => setSelected(sys)}
          />
        ))}
      </ScrollView>

      <MissionTracker onSelectSystem={sys => setSelected(sys)} />

      {selected && (
        <SystemSheet system={selected} onClose={() => setSelected(null)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#000' },
  header:           { flexDirection: 'row', justifyContent: 'space-between',
                      alignItems: 'center', padding: SPACING.md,
                      backgroundColor: COLORS.surface },
  headerTitle:      { color: COLORS.text, fontSize: FONT.md, fontWeight: '700' },
  fuelLabel:        { color: COLORS.accent, fontSize: FONT.sm },
  scroll:           { flex: 1 },
  mapContainer:     { width: MAP, height: MAP },
  nodeTap:          { position: 'absolute', width: NODE_R * 4, height: NODE_R * 4 },
});
