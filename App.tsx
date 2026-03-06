import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { AuthProvider } from './src/components/AuthProvider';
import { AppNavigator } from './src/navigation/AppNavigator';
import { ErrorBoundary } from './src/components/ErrorBoundary';

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

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ErrorBoundary>
          <AppNavigator />
        </ErrorBoundary>
        <StatusBar style="auto" />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
