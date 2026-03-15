import { StatusBar } from 'expo-status-bar';
import { View, Platform, I18nManager } from 'react-native';

// Disable automatic RTL flipping based on system language.
// The app manages RTL entirely through languageStore's isRTL flag.
I18nManager.allowRTL(false);
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as NavigationBar from 'expo-navigation-bar';
import { useEffect, useState } from 'react';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider } from './src/components/AuthProvider';
import { AppNavigator } from './src/navigation/AppNavigator';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { ForceUpdateModal } from './src/components/ForceUpdateModal';
import { supabase } from './src/lib/supabase';

const SUGGEST_DISMISSED_KEY = 'bookloop_suggest_update_dismissed';

function BottomFill() {
  const insets = useSafeAreaInsets();
  if (!insets.bottom) return null;
  return (
    <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: insets.bottom, backgroundColor: '#ffffff' }} />
  );
}

// Must be set as early as possible so foreground notifications are shown.
// Lazy-imported to avoid a console.error in Expo Go SDK 53+.
if (Constants.appOwnership !== 'expo') {
  import('expo-notifications').then(Notifications => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  });
}

const CURRENT_VERSION = Constants.expoConfig?.android?.versionCode ?? 1;

export default function App() {
  const [updateMode, setUpdateMode] = useState<'force' | 'suggest' | 'none'>('none');

  useEffect(() => {
    if (Platform.OS === 'android') {
      NavigationBar.setButtonStyleAsync('dark');
    }
  }, []);

  useEffect(() => {
    supabase
      .from('app_config')
      .select('min_android_version, min_soft_version')
      .eq('id', 1)
      .single()
      .then(async ({ data }) => {
        if (!data) return;
        if (CURRENT_VERSION < data.min_android_version) {
          setUpdateMode('force');
        } else if (CURRENT_VERSION < data.min_soft_version) {
          const lastDismissed = await AsyncStorage.getItem(SUGGEST_DISMISSED_KEY);
          if (lastDismissed) {
            const hoursSince = (Date.now() - Number(lastDismissed)) / (1000 * 60 * 60);
            if (hoursSince < 24) return;
          }
          setUpdateMode('suggest');
        }
      });
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ErrorBoundary>
          <AppNavigator />
        </ErrorBoundary>
        <BottomFill />
        <StatusBar style="auto" />
      </AuthProvider>
      <ForceUpdateModal
        mode={updateMode}
        onDismiss={() => {
          AsyncStorage.setItem(SUGGEST_DISMISSED_KEY, String(Date.now()));
          setUpdateMode('none');
        }}
      />
    </SafeAreaProvider>
  );
}
