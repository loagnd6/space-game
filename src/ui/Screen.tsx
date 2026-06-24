import { StyleSheet, Text, View } from 'react-native';

import { COLORS, FONT, SPACING } from '@/src/constants/theme';

type ScreenProps = {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
};

/** Simple placeholder screen scaffold. Replace with real system UI as it's built. */
export function Screen({ title, subtitle, children }: ScreenProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
  },
  title: { color: COLORS.text, fontSize: FONT.xl, fontWeight: '700' },
  subtitle: { color: COLORS.muted, fontSize: FONT.md, marginTop: SPACING.sm },
  body: { flex: 1, marginTop: SPACING.lg },
});
