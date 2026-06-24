import { SafeAreaView } from 'react-native-safe-area-context';

import { Screen } from '@/src/ui/Screen';

export default function StarMapScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <Screen
        title="Star Map"
        subtitle="Chart a course. Discover new systems. Find what's worth fighting for."
      />
    </SafeAreaView>
  );
}
