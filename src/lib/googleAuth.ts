import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';
import { Platform } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

// Must match exactly what is added to Supabase Redirect URLs
const redirectUrl = Platform.OS === 'web'
  ? (typeof window !== 'undefined' && window.location?.origin
      ? `${window.location.origin}/auth/callback`
      : 'http://localhost:8081/auth/callback')
  : 'bookloop://auth/callback';

export async function signInWithGoogle() {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: Platform.OS !== 'web',
      },
    });

    if (error) throw error;

    if (data?.url) {
      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectUrl
      );

      if (result.type === 'success') {
        // Use exchangeCodeForSession — handles PKCE (code param) and implicit (hash tokens)
        const { data: sessionData, error: sessionError } = await supabase.auth.exchangeCodeForSession(result.url);
        if (sessionError) throw sessionError;

        // Check if profile exists, create if not
        if (sessionData.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', sessionData.user.id)
            .single();

          if (!profile) {
            await supabase.from('profiles').insert({
              id:   sessionData.user.id,
              name: sessionData.user.user_metadata?.full_name || sessionData.user.email?.split('@')[0] || 'User',
              city: 'תל אביב',
            });
          }
        }

        return { success: true };
      }
    }

    return { success: false, error: 'Authentication cancelled' };
  } catch (error: any) {
    console.error('Google sign-in error:', error);
    return { success: false, error: error.message };
  }
}
