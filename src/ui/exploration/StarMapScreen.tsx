import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Canvas, Circle, Line, Path, Skia, vec } from '@shopify/react-native-skia';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useExplorationStore } from '@/src/stores/useExplorationStore';
import { EXPLORATION } from '@/src/constants/game';
import { COLORS, FONT, SPACING } from '@/src/constants/theme';
import type { StarSystem } from '@/src/types';
import type { FleetMission, DiscoveryResult } from '@/src/types/exploration';
import { MissionTracker } from './MissionTracker';
import { SystemSheet } from './SystemSheet';
import { DiscoveryCard } from './DiscoveryCard';

const MAP = EXPLORATION.MAP_SIZE;
const LANE_MAX = EXPLORATION.TRAVEL_LANE_MAX_DIST;
const NODE_R = 12;
const MIN_SCALE = 0.3;
const MAX_SCALE = 2;

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

function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(max, Math.max(min, value));
}

export function StarMapScreen() {
  const { starSystems, activeMissions, discoveries, checkArrivals, fuel } = useExplorationStore();
  const [selected, setSelected] = useState<StarSystem | null>(null);
  const [pendingResult, setPendingResult] = useState<
    { result: DiscoveryResult; systemName: string } | null
  >(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const insets = useSafeAreaInsets();

  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const centered = useSharedValue(false);

  useEffect(() => {
    checkArrivals();
  }, [checkArrivals]);

  // Center on Sol (MAP/2, MAP/2) once the viewport has been measured.
  useEffect(() => {
    if (viewport.width === 0 || viewport.height === 0 || centered.value) return;
    translateX.value = viewport.width / 2 - MAP / 2;
    translateY.value = viewport.height / 2 - MAP / 2;
    savedTranslateX.value = translateX.value;
    savedTranslateY.value = translateY.value;
    centered.value = true;
    // Shared values are mutable refs, not reactive state — intentionally omitted from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport.width, viewport.height]);

  // Reanimated SharedValues are intentionally mutable refs (`.value = x`), which the
  // React Compiler's immutability check doesn't recognize as safe once the same ref is
  // read inside the centering useEffect above — false positive, not a real bug.
  /* eslint-disable react-hooks/immutability */
  const panGesture = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1)
    .onStart(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .onUpdate(e => {
      const minX = Math.min(0, viewport.width - MAP * scale.value);
      const minY = Math.min(0, viewport.height - MAP * scale.value);
      translateX.value = clamp(savedTranslateX.value + e.translationX, minX, 0);
      translateY.value = clamp(savedTranslateY.value + e.translationY, minY, 0);
    });

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      savedScale.value = scale.value;
    })
    .onUpdate(e => {
      scale.value = clamp(savedScale.value * e.scale, MIN_SCALE, MAX_SCALE);
    });
  /* eslint-enable react-hooks/immutability */

  const composedGesture = Gesture.Simultaneous(panGesture, pinchGesture);

  const mapAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

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
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Star Map</Text>
        <Text style={styles.fuelLabel}>⛽ {fuel} fuel</Text>
      </View>

      {/* Map */}
      <View
        style={styles.scroll}
        onLayout={e => setViewport({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      >
        <GestureDetector gesture={composedGesture}>
          <Animated.View style={[styles.mapContainer, mapAnimatedStyle]}>
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
          </Animated.View>
        </GestureDetector>
      </View>

      <MissionTracker onSelectSystem={sys => setSelected(sys)} />

      {selected && (
        <SystemSheet
          system={selected}
          onClose={() => setSelected(null)}
          onCollect={(result, systemName) => {
            setSelected(null);
            setPendingResult({ result, systemName });
          }}
        />
      )}

      {pendingResult && (
        <DiscoveryCard
          result={pendingResult.result}
          systemName={pendingResult.systemName}
          onClose={() => setPendingResult(null)}
        />
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
  scroll:           { flex: 1, overflow: 'hidden' },
  mapContainer:     { position: 'absolute', width: MAP, height: MAP },
  nodeTap:          { position: 'absolute', width: NODE_R * 4, height: NODE_R * 4 },
});
