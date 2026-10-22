/*
 * The bits of expo-notifications we use (local notifications only), loaded file by file.
 * Importing the package's index pulls in push "topic subscription", whose native module Expo Go
 * on Android doesn't ship — that crashed the app at start. If anything here is missing, `Notify`
 * is null and the app simply runs without notifications.
 */
import type * as Types from 'expo-notifications';

type NotifyApi = {
  scheduleNotificationAsync: typeof Types.scheduleNotificationAsync;
  getAllScheduledNotificationsAsync: typeof Types.getAllScheduledNotificationsAsync;
  cancelScheduledNotificationAsync: typeof Types.cancelScheduledNotificationAsync;
  setNotificationChannelAsync: typeof Types.setNotificationChannelAsync;
  getPermissionsAsync: typeof Types.getPermissionsAsync;
  requestPermissionsAsync: typeof Types.requestPermissionsAsync;
  setNotificationHandler: typeof Types.setNotificationHandler;
  addNotificationResponseReceivedListener: typeof Types.addNotificationResponseReceivedListener;
  SchedulableTriggerInputTypes: typeof Types.SchedulableTriggerInputTypes;
  AndroidImportance: typeof Types.AndroidImportance;
};

function load(): NotifyApi | null {
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    return {
      scheduleNotificationAsync: require('expo-notifications/build/scheduleNotificationAsync').scheduleNotificationAsync,
      getAllScheduledNotificationsAsync: require('expo-notifications/build/getAllScheduledNotificationsAsync').getAllScheduledNotificationsAsync,
      cancelScheduledNotificationAsync: require('expo-notifications/build/cancelScheduledNotificationAsync').cancelScheduledNotificationAsync,
      setNotificationChannelAsync: require('expo-notifications/build/setNotificationChannelAsync').setNotificationChannelAsync,
      ...(require('expo-notifications/build/NotificationPermissions') as Pick<NotifyApi, 'getPermissionsAsync' | 'requestPermissionsAsync'>),
      setNotificationHandler: require('expo-notifications/build/NotificationsHandler').setNotificationHandler,
      addNotificationResponseReceivedListener: require('expo-notifications/build/NotificationsEmitter').addNotificationResponseReceivedListener,
      SchedulableTriggerInputTypes: require('expo-notifications/build/Notifications.types').SchedulableTriggerInputTypes,
      AndroidImportance: require('expo-notifications/build/NotificationChannelManager.types').AndroidImportance,
    };
    /* eslint-enable @typescript-eslint/no-require-imports */
  } catch {
    return null;
  }
}

export const Notify = load();
