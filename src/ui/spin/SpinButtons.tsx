import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, FONT, RADIUS, SPACING } from '@/src/constants/theme';

type Props = {
  freeSpinAvailableAt: Date | null;
  ticketCount: number;
  isSpinning: boolean;
  onFreeSpin: () => void;
  onTicketSpin: () => void;
};

export function formatCountdown(availableAt: Date): string {
  const diff = Math.max(0, availableAt.getTime() - Date.now());
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1_000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function SpinButtons({
  freeSpinAvailableAt,
  ticketCount,
  isSpinning,
  onFreeSpin,
  onTicketSpin,
}: Props) {
  const [countdown, setCountdown] = useState('');
  const freeReady = !freeSpinAvailableAt || freeSpinAvailableAt.getTime() <= Date.now();

  useEffect(() => {
    if (freeReady || !freeSpinAvailableAt) return;
    setCountdown(formatCountdown(freeSpinAvailableAt));
    const id = setInterval(() => {
      setCountdown(formatCountdown(freeSpinAvailableAt));
    }, 1000);
    return () => clearInterval(id);
  }, [freeReady, freeSpinAvailableAt]);

  const freeDisabled = isSpinning || !freeReady;
  const ticketDisabled = isSpinning || ticketCount < 1;

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={[styles.btn, styles.btnFree, freeDisabled && styles.btnDisabled]}
        onPress={onFreeSpin}
        disabled={freeDisabled}
        activeOpacity={0.75}
      >
        {isSpinning ? (
          <ActivityIndicator color={COLORS.background} size="small" />
        ) : (
          <>
            <Text style={styles.btnLabel}>🎯 Free Spin</Text>
            {!freeReady && <Text style={styles.timer}>{countdown}</Text>}
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.btn, styles.btnTicket, ticketDisabled && styles.btnDisabled]}
        onPress={onTicketSpin}
        disabled={ticketDisabled}
        activeOpacity={0.75}
      >
        <Text style={styles.btnLabel}>🎫 Use Ticket</Text>
        <Text style={styles.ticketCount}>
          {ticketCount > 0 ? `${ticketCount} left` : 'No tickets'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: SPACING.md },
  btn: {
    flex: 1,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 64,
  },
  btnFree:     { backgroundColor: COLORS.primary },
  btnTicket:   { backgroundColor: COLORS.accent },
  btnDisabled: { opacity: 0.45 },
  btnLabel:    { color: COLORS.background, fontSize: FONT.md, fontWeight: '700' },
  timer:       { color: COLORS.background, fontSize: FONT.sm - 2, marginTop: 2, opacity: 0.8 },
  ticketCount: { color: COLORS.background, fontSize: FONT.sm - 2, marginTop: 2, opacity: 0.8 },
});
