import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { TIER_STYLES } from '@/src/ui/spin/tierStyles';
import { COLORS, FONT, RADIUS, SPACING } from '@/src/constants/theme';
import type { DiscoveryResult } from '@/src/types/exploration';
import type { ComponentTier } from '@/src/game/ships/types';

interface Props {
  result: DiscoveryResult;
  systemName: string;
  onClose(): void;
}

function TierBadge({ tier }: { tier: ComponentTier }) {
  const s = TIER_STYLES[tier];
  return (
    <View style={[styles.tierBadge, { borderColor: s.border }]}>
      <Text style={[styles.tierLabel, { color: s.border }]}>{s.label}</Text>
    </View>
  );
}

export function DiscoveryCard({ result, systemName, onClose }: Props) {
  const { credits, fuel, research } = result.resourcesGained;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Fleet Returned</Text>
          <Text style={styles.subtitle}>from {systemName}</Text>

          {/* Planets discovered */}
          <Text style={styles.section}>Planets Discovered</Text>
          {result.planetsFound.map(p => (
            <Text key={p.id} style={styles.planetName}>· {p.name}</Text>
          ))}

          {/* Resources */}
          <Text style={styles.section}>Resources Gained</Text>
          <View style={styles.resources}>
            {credits > 0  && <Text style={styles.resource}>💰 {credits.toLocaleString()} credits</Text>}
            {fuel > 0     && <Text style={styles.resource}>⛽ {fuel} fuel</Text>}
            {research > 0 && <Text style={styles.resource}>🔬 {research} research</Text>}
          </View>

          {/* Fragment drop */}
          {result.fragmentDrop && (
            <>
              <Text style={styles.section}>Loot</Text>
              <View style={styles.lootRow}>
                <Text style={styles.resource}>Component Fragment</Text>
                <TierBadge tier={result.fragmentDrop} />
              </View>
            </>
          )}

          <Pressable style={styles.collectBtn} onPress={onClose}>
            <Text style={styles.collectBtnText}>Collect</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay:       { flex: 1, backgroundColor: '#000000CC', justifyContent: 'center',
                   alignItems: 'center', padding: SPACING.lg },
  card:          { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
                   padding: SPACING.lg, width: '100%', gap: SPACING.sm },
  title:         { color: COLORS.text, fontSize: FONT.lg, fontWeight: '700', textAlign: 'center' },
  subtitle:      { color: COLORS.muted, fontSize: FONT.sm, textAlign: 'center' },
  section:       { color: COLORS.muted, fontSize: 12, fontWeight: '600',
                   marginTop: SPACING.sm, textTransform: 'uppercase', letterSpacing: 1 },
  planetName:    { color: COLORS.text, fontSize: FONT.sm },
  resources:     { gap: 4 },
  resource:      { color: COLORS.text, fontSize: FONT.sm },
  lootRow:       { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  tierBadge:     { borderWidth: 1, borderRadius: RADIUS.sm,
                   paddingHorizontal: SPACING.xs, paddingVertical: 2 },
  tierLabel:     { fontSize: 11, fontWeight: '700' },
  collectBtn:    { backgroundColor: COLORS.primary, borderRadius: RADIUS.md,
                   padding: SPACING.md, alignItems: 'center', marginTop: SPACING.sm },
  collectBtnText:{ color: COLORS.background, fontSize: FONT.sm, fontWeight: '700' },
});
