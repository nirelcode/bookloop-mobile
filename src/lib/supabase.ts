import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Web uses browser localStorage (sync) so sessions restore correctly on refresh.
    // Native (iOS/Android) uses AsyncStorage.
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // On web, detect the access_token in the URL hash after OAuth redirect.
    // On native, tokens are extracted manually from the WebBrowser result.
    detectSessionInUrl: Platform.OS === 'web',
  },
});
