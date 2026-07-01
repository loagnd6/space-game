import React from 'react';
import {
  Modal, Pressable, ScrollView, StyleSheet, Text,
  TouchableWithoutFeedback, View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useExplorationStore } from '@/src/stores/useExplorationStore';
import { calculateFuelCost, calculateTravelTime } from '@/src/game/exploration';
import { COLORS, FONT, RADIUS, SPACING } from '@/src/constants/theme';
import type { StarSystem } from '@/src/types';
import type { FleetMission } from '@/src/types/exploration';

interface Props {
  system: StarSystem;
  onClose(): void;
}

function formatDuration(ms: number): string {
  const mins = Math.round(ms / 60_000);
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function formatEta(arrivesAt: number): string {
  const remaining = Math.max(0, arrivesAt - Date.now());
  return `Returns in ${formatDuration(remaining)}`;
}

export function SystemSheet({ system, onClose }: Props) {
  const { starSystems, activeMissions, fuel, dispatchFleet } = useExplorationStore();
  const home = starSystems.find(s => s.id === 'sol-home');

  const fuelCost = home ? calculateFuelCost(home.position, system.position) : 0;
  const travelMs = home ? calculateTravelTime(home.position, system.position) : 0;

  const activeMission: FleetMission | undefined = activeMissions.find(
    m => m.systemId === system.id && (m.status === 'in_transit' || m.status === 'arrived')
  );

  const handleDispatch = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    dispatchFleet(system.id);
    onClose();
  };

  let buttonLabel = `Send Fleet  (${fuelCost} fuel)`;
  let buttonDisabled = false;
  if (activeMission?.status === 'in_transit') {
    buttonLabel = formatEta(activeMission.arrivesAt);
    buttonDisabled = true;
  } else if (activeMission?.status === 'arrived') {
    buttonLabel = 'Fleet Returned — Collect Below';
    buttonDisabled = true;
  } else if (fuel < fuelCost) {
    buttonLabel = 'Not enough fuel';
    buttonDisabled = true;
  }

  const dangerStars = '★'.repeat(system.dangerLevel) + '☆'.repeat(5 - system.dangerLevel);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <View style={styles.sheet}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* System name + danger */}
          <View style={styles.headerRow}>
            <Text style={styles.systemName}>{system.name}</Text>
            <Text style={styles.danger}>{dangerStars}</Text>
          </View>

          {/* Travel info */}
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Travel time</Text>
            <Text style={styles.infoValue}>{formatDuration(travelMs)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Fuel cost</Text>
            <Text style={styles.infoValue}>{fuelCost} / {fuel} available</Text>
          </View>

          {/* Planet list */}
          <Text style={styles.sectionLabel}>
            {system.planets.length} planet{system.planets.length !== 1 ? 's' : ''}
          </Text>
          <ScrollView style={styles.planetList} nestedScrollEnabled>
            {system.planets.map(p => (
              <View key={p.id} style={styles.planetRow}>
                <Text style={styles.planetName}>{p.discovered ? p.name : '???'}</Text>
                {p.discovered && (
                  <Text style={styles.richness}>
                    {'▰'.repeat(Math.round(p.resourceRichness * 5))}
                    {'▱'.repeat(5 - Math.round(p.resourceRichness * 5))}
                  </Text>
                )}
              </View>
            ))}
          </ScrollView>

          {/* Action button */}
          <Pressable
            style={[styles.dispatchBtn, buttonDisabled && styles.dispatchBtnDisabled]}
            onPress={handleDispatch}
            disabled={buttonDisabled}
          >
            <Text style={styles.dispatchBtnText}>{buttonLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay:             { flex: 1, justifyContent: 'flex-end' },
  backdrop:            { flex: 1, backgroundColor: '#00000080' },
  sheet:               { backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.lg,
                         borderTopRightRadius: RADIUS.lg, padding: SPACING.lg,
                         gap: SPACING.md, maxHeight: '65%' },
  handle:              { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border,
                         alignSelf: 'center', marginBottom: SPACING.sm },
  headerRow:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  systemName:          { color: COLORS.text, fontSize: FONT.lg, fontWeight: '700' },
  danger:              { color: COLORS.accent, fontSize: FONT.sm },
  infoRow:             { flexDirection: 'row', justifyContent: 'space-between' },
  infoLabel:           { color: COLORS.muted, fontSize: FONT.sm },
  infoValue:           { color: COLORS.text, fontSize: FONT.sm },
  sectionLabel:        { color: COLORS.muted, fontSize: FONT.sm, fontWeight: '600' },
  planetList:          { maxHeight: 120 },
  planetRow:           { flexDirection: 'row', justifyContent: 'space-between',
                         paddingVertical: SPACING.xs },
  planetName:          { color: COLORS.text, fontSize: FONT.sm },
  richness:            { color: COLORS.primary, fontSize: FONT.sm },
  dispatchBtn:         { backgroundColor: COLORS.primary, borderRadius: RADIUS.md,
                         padding: SPACING.md, alignItems: 'center' },
  dispatchBtnDisabled: { opacity: 0.4 },
  dispatchBtnText:     { color: COLORS.background, fontSize: FONT.sm, fontWeight: '700' },
});
