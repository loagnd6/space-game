import { SafeAreaView } from 'react-native-safe-area-context';

import { Screen } from '@/src/ui/Screen';

export default function TechScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <Screen title="Tech Tree" subtitle="Spend research to unlock new ships and weapons." />
    </SafeAreaView>
  );
}
