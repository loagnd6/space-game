import * as Notifications from 'expo-notifications';
import type { FleetMission } from '@/src/types/exploration';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleArrivalNotification(
  mission: FleetMission,
  systemName: string,
): Promise<string> {
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
  if (!notificationId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {
    // notification may have already fired
  }
}
