import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/src/constants/theme';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Lost in space' }} />
      <View style={styles.container}>
        <Text style={styles.title}>This sector doesn&apos;t exist.</Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Return to the star map</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: COLORS.background,
  },
  title: { color: COLORS.text, fontSize: 20, fontWeight: '600' },
  link: { marginTop: 16, paddingVertical: 12 },
  linkText: { color: COLORS.primary, fontSize: 16 },
});
