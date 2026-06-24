import { SafeAreaView } from 'react-native-safe-area-context';

import { Screen } from '@/src/ui/Screen';

export default function SettingsScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <Screen title="Settings" subtitle="Audio, haptics, cloud save, and account." />
    </SafeAreaView>
  );
}
