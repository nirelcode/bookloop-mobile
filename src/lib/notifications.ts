import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

export const NOTIFICATIONS_PROMPTED_KEY = 'notifications_prompted';
export const NOTIFICATIONS_ENABLED_KEY  = 'notifications_enabled';

/**
 * Request push notification permission, get an Expo push token, and save it
 * to the user's profile row in Supabase.
 * Returns true if the token was successfully registered.
 */
export async function registerForPushNotificationsAsync(userId: string): Promise<boolean> {
  // expo-notifications doesn't work in Expo Go
  if (Constants.appOwnership === 'expo') return false;

  try {
    const Notifications = await import('expo-notifications');

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return false;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId as string | undefined
      ?? '570be636-8f56-4a9e-8998-5021696fdcf2';

    let token = await Notifications.getExpoPushTokenAsync({ projectId }).catch(() => null);

    // On first enable after a disable, the device registration can take a moment — retry once
    if (!token?.data) {
      await new Promise(r => setTimeout(r, 1500));
      token = await Notifications.getExpoPushTokenAsync({ projectId }).catch(() => null);
    }

    if (!token?.data) return false;

    await supabase.from('profiles').update({ push_token: token.data }).eq('id', userId);
    await AsyncStorage.setItem(NOTIFICATIONS_ENABLED_KEY, 'true');

    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('messages', {
        name: 'Messages',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Remove the push token from Supabase so the user stops receiving
 * push notifications. Stores the disabled preference locally.
 */
export async function unregisterPushNotificationsAsync(userId: string): Promise<void> {
  await supabase.from('profiles').update({ push_token: null }).eq('id', userId);
  await AsyncStorage.setItem(NOTIFICATIONS_ENABLED_KEY, 'false');
}

/**
 * Returns the current OS-level notification permission status.
 * Returns 'undetermined' if expo-notifications is unavailable (Expo Go).
 */
export async function checkPushPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
  if (Constants.appOwnership === 'expo') return 'undetermined';
  try {
    const Notifications = await import('expo-notifications');
    const { status } = await Notifications.getPermissionsAsync();
    return status as 'granted' | 'denied' | 'undetermined';
  } catch {
    return 'undetermined';
  }
}

/**
 * Whether the user has actively disabled notifications.
 * Defaults to enabled (true) if the preference has never been set.
 */
export async function getNotificationsEnabled(): Promise<boolean> {
  const val = await AsyncStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
  return val !== 'false';
}
