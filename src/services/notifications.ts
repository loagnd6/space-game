import type { FleetMission } from '@/src/types/exploration';

let Notifications: typeof import('expo-notifications') | null = null;
try {
  // Importing expo-notifications hard-throws on Android under Expo Go (SDK 53+):
  // it eagerly registers a push-token listener at module load that's unsupported
  // there. Every function below degrades to a no-op when this fails. A static
  // import can't be guarded by try/catch, so this needs to stay a require().
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Notifications = require('expo-notifications');
} catch {
  Notifications = null;
}

Notifications?.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  if (!Notifications) return false;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleArrivalNotification(
  mission: FleetMission,
  systemName: string,
): Promise<string> {
  if (!Notifications) return '';
  try {
    const { status } = await Notifications.getPermissionsAsync();
    const granted = status === 'granted' || (await requestNotificationPermission());
    if (!granted) return '';

    const secondsFromNow = Math.max(1, Math.round((mission.arrivesAt - Date.now()) / 1000));
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Fleet Returned',
        body: `Your fleet has returned from ${systemName} — tap to collect.`,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: secondsFromNow,
        repeats: false,
      },
    });
  } catch {
    return '';
  }
}

export async function cancelNotification(notificationId: string): Promise<void> {
  if (!Notifications || !notificationId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {
    // notification may have already fired
  }
}
