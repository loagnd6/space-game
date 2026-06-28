import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { COLORS, FONT } from '@/src/constants/theme';
import type { ComponentSlot, ShipComponent } from '@/src/game/ships/types';
import { SLOT_ORDER, SLOT_LABELS, SLOT_ICONS } from './constants';
import { normalizeAxis } from './radarChart';

const SIZE = 200;
const CX = SIZE / 2;
const CY = SIZE / 2;
const RADAR_RADIUS = 65;
// Hull=top, Weapons=right, Shields=bottom, Engine=left
const ANGLES = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];

interface Props {
  equipped: Record<ComponentSlot, ShipComponent | null>;
}

export function RadarChart({ equipped }: Props) {
  const fillPath = useMemo(() => {
    const path = Skia.Path.Make();
    SLOT_ORDER.forEach((slot, i) => {
      const r = normalizeAxis(equipped[slot]?.statMultiplier ?? 0) * RADAR_RADIUS;
      const x = CX + r * Math.cos(ANGLES[i]);
      const y = CY + r * Math.sin(ANGLES[i]);
      if (i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    });
    path.close();
    return path;
  }, [equipped]);

  const gridPath = useMemo(() => {
    const path = Skia.Path.Make();
    [0.25, 0.5, 0.75, 1.0].forEach(t => {
      path.addCircle(CX, CY, t * RADAR_RADIUS);
    });
    return path;
  }, []);

  const axisPath = useMemo(() => {
    const path = Skia.Path.Make();
    ANGLES.forEach(angle => {
      path.moveTo(CX, CY);
      path.lineTo(CX + RADAR_RADIUS * Math.cos(angle), CY + RADAR_RADIUS * Math.sin(angle));
    });
    return path;
  }, []);

  return (
    <View style={styles.wrapper}>
      {/* Top label: Hull */}
      <Text style={[styles.axisLabel, styles.labelTop]}>
        {SLOT_ICONS.hull} {SLOT_LABELS.hull}
      </Text>

      <View style={styles.chartRow}>
        {/* Left label: Engine */}
        <Text style={[styles.axisLabel, styles.labelSide]}>
          {SLOT_ICONS.engine}{'\n'}{SLOT_LABELS.engine}
        </Text>

        <Canvas style={styles.canvas}>
          <Path path={gridPath} color={COLORS.border} style="stroke" strokeWidth={1} />
          <Path path={axisPath} color={COLORS.border} style="stroke" strokeWidth={1} />
          <Path path={fillPath} color="rgba(94, 200, 255, 0.25)" style="fill" />
          <Path path={fillPath} color={COLORS.primary} style="stroke" strokeWidth={2} />
        </Canvas>

        {/* Right label: Weapons */}
        <Text style={[styles.axisLabel, styles.labelSide]}>
          {SLOT_ICONS.weapons}{'\n'}{SLOT_LABELS.weapons}
        </Text>
      </View>

      {/* Bottom label: Shields */}
      <Text style={[styles.axisLabel, styles.labelBottom]}>
        {SLOT_ICONS.shields} {SLOT_LABELS.shields}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper:     { alignItems: 'center' },
  chartRow:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  canvas:      { width: SIZE, height: SIZE },
  axisLabel:   { color: COLORS.muted, fontSize: FONT.sm, textAlign: 'center' },
  labelTop:    { marginBottom: 2 },
  labelBottom: { marginTop: 2 },
  labelSide:   { width: 56 },
});
