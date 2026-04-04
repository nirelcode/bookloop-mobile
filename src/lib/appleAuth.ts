import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from './supabase';

export async function signInWithApple(): Promise<{ success: boolean; error?: string }> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      return { success: false, error: 'No identity token received from Apple' };
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });

    if (error) return { success: false, error: error.message };

    // Apple only provides name on the very first sign-in — save it if available
    const givenName  = credential.fullName?.givenName;
    const familyName = credential.fullName?.familyName;
    if (data.user && givenName) {
      const name = [givenName, familyName].filter(Boolean).join(' ');
      await supabase.from('profiles').update({ name }).eq('id', data.user.id);
    }

    return { success: true };
  } catch (e: any) {
    if (e.code === 'ERR_REQUEST_CANCELED') {
      return { success: false, error: 'canceled' };
    }
    return { success: false, error: e.message ?? 'Apple sign-in failed' };
  }
}
