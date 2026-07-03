import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { COLORS, FONT, SPACING } from '@/src/constants/theme';
import { useSpinStore } from '@/src/stores/useSpinStore';
import { buildReelData, spinResultToReelItem } from './reelData';
import { SpinReel, SpinReelHandle } from './SpinReel';
import { SpinResult } from './SpinResult';
import { SpinButtons } from './SpinButtons';
import { WINNER_INDEX, REEL_TOTAL } from './constants';
import type { ReelItem } from './reelData';
import type { SpinType } from '@/src/game/spin/types';

const PLACEHOLDER_ITEMS: ReelItem[] = Array.from({ length: REEL_TOTAL }, (_, i) => ({
  id: `placeholder-${i}`,
  tier: 'common',
  label: '?',
  sublabel: '',
  icon: '❓',
}));

export function SpinScreen() {
  const { freeSpinAvailableAt, isSpinning, fetchSpinState, spin } = useSpinStore();
  const reelRef = useRef<SpinReelHandle>(null);
  const isMountedRef = useRef(true);
  const [reelItems, setReelItems] = useState<ReelItem[]>(PLACEHOLDER_ITEMS);
  const [resultItem, setResultItem] = useState<ReelItem | null>(null);
  const [centerIndex, setCenterIndex] = useState(2);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    fetchSpinState();
  }, [fetchSpinState]);

  async function handleSpin(spinType: SpinType) {
    setError(null);
    setResultItem(null);
    try {
      const result = await spin(spinType);
      const items = buildReelData(result);
      setReelItems(items);
      setCenterIndex(2); // no highlight during animation

      const isFakeout = result.tier !== 'common';
      reelRef.current?.start(isFakeout, async () => {
        if (!isMountedRef.current) return;
        setCenterIndex(WINNER_INDEX);
        setResultItem(spinResultToReelItem(result));
        await Haptics.notificationAsync(
          result.tier === 'ultra_rare' || result.tier === 'legendary'
            ? Haptics.NotificationFeedbackType.Success
            : Haptics.NotificationFeedbackType.Warning,
        );
        await fetchSpinState();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Spin failed — try again');
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        <Text style={styles.title}>Spin</Text>

        <View style={styles.content}>
          <View style={styles.reelSection}>
            <SpinReel ref={reelRef} items={reelItems} centerIndex={centerIndex} />
          </View>

          <View style={styles.resultSection}>
            <SpinResult item={resultItem} />
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        </View>

        <View style={styles.buttonsSection}>
          <SpinButtons
            freeSpinAvailableAt={freeSpinAvailableAt}
            ticketCount={0} // TODO: wire to inventory store when built
            isSpinning={isSpinning}
            onFreeSpin={() => handleSpin('free')}
            onTicketSpin={() => handleSpin('ticket')}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  container: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    gap: SPACING.xl,
  },
  title: { color: COLORS.text, fontSize: FONT.xl, fontWeight: '700' },
  content: { flex: 1, justifyContent: 'center', gap: SPACING.xl },
  reelSection: { alignItems: 'center' },
  resultSection: {},
  buttonsSection: { paddingBottom: SPACING.lg },
  error: { color: COLORS.danger, fontSize: FONT.sm, marginTop: SPACING.sm, textAlign: 'center' },
});
