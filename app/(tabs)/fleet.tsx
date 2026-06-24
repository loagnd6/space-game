import { SafeAreaView } from 'react-native-safe-area-context';

import { Screen } from '@/src/ui/Screen';

export default function FleetScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <Screen title="Fleet" subtitle="Manage your ships, loadouts, and crew." />
    </SafeAreaView>
  );
}
