import { Stack } from 'expo-router';

import { COLORS } from '@/src/constants/theme';

export default function FleetLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.background },
      }}
    />
  );
}
