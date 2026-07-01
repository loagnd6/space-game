import type { FleetMission } from '@/src/types/exploration';

export async function requestNotificationPermission(): Promise<boolean> {
  return false;
}

export async function scheduleArrivalNotification(
  _mission: FleetMission,
  _systemName: string,
): Promise<string> {
  return '';
}

export async function cancelNotification(_notificationId: string): Promise<void> {}
