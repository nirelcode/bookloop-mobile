import React, { useEffect, useRef } from 'react';
import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { useLanguageStore } from '../stores/languageStore';

/** Remove any stored Supabase tokens from storage without a network call. */
async function clearStoredSession() {
  try {
    if (Platform.OS === 'web') {
      Object.keys(window.localStorage)
        .filter(k => k.startsWith('sb-'))
        .forEach(k => window.localStorage.removeItem(k));
    } else {
      const keys = await AsyncStorage.getAllKeys();
      const sbKeys = keys.filter(k => k.startsWith('sb-'));
      if (sbKeys.length > 0) await AsyncStorage.multiRemove(sbKeys);
    }
  } catch (_) {}
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setSession, setUser, setProfile, setLoading, signOut } = useAuthStore();
  const { initializeLanguage } = useLanguageStore();

  // Handle deep links on native (e.g. bookloop://auth/callback#access_token=...)
  // This fires when the OS opens the app via the custom scheme after OAuth.
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const handleUrl = async ({ url }: { url: string }) => {
      if (!url.includes('auth/callback')) return;

      // Format 1: bookloop://auth/callback#access_token=...&refresh_token=...
      // (older magic-link / OAuth flow)
      const hash = url.split('#')[1] ?? '';
      const hashParams = new URLSearchParams(hash);
      const accessToken  = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      if (accessToken) {
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken ?? '',
        });
        return;
      }

      // Format 2: bookloop://auth/callback?token_hash=...&type=email
      // (newer PKCE email-confirmation flow)
      const query = url.split('?')[1] ?? '';
      const queryParams = new URLSearchParams(query);
      const tokenHash = queryParams.get('token_hash');
      const type      = queryParams.get('type');
      if (tokenHash && type) {
        await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as any,
        });
      }
    };

    // Handle link if app was opened cold from a deep link
    Linking.getInitialURL().then(url => { if (url) handleUrl({ url }); });

    // Handle link if app was already open and brought to foreground
    const sub = Linking.addEventListener('url', handleUrl);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    initializeLanguage();

    let resolved = false;
    const resolve = () => {
      if (!resolved) {
        resolved = true;
        setLoading(false);
      }
    };

    // ── Reactive listener — keeps auth state up to date after initial load ──
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Guard: if a token refresh fires AFTER we've already signed out locally,
        // ignore it — otherwise the auto-refresh timer would restore the session.
        if (event === 'TOKEN_REFRESHED' && !useAuthStore.getState().user) return;

        setSession(session);
        setUser(session?.user ?? null);
        if (!session) {
          // Invalid refresh token triggers SIGNED_OUT — wipe bad tokens from AsyncStorage
          clearStoredSession();
          signOut();
          useDataStore.getState().invalidateMessages();
        }
        resolve();
        // Refresh profile in background on sign-in / token refresh
        if (session?.user) {
          fetchProfile(session.user.id).catch(console.error);
        }
      }
    );

    // ── Primary loader — getSession() reads from storage synchronously,
    //    so it returns fast even with an expired token.
    //    We use this to unblock the loading screen immediately. ──
    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchProfile(session.user.id);
        } else {
          signOut();
          useDataStore.getState().invalidateMessages();
        }
        resolve();
      })
      .catch(async (err) => {
        console.error('getSession error:', err);
        await clearStoredSession();
        signOut();
        resolve();
      });

    // ── Last-resort safety net: if nothing resolves in 8 s,
    //    wipe the bad token (sync, no network) and unblock. ──
    const timeout = setTimeout(async () => {
      if (!resolved) {
        console.warn('Auth timeout — clearing stored session');
        await clearStoredSession();
        signOut();
        resolve();
      }
    }, 8000);

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const didBumpActivity = useRef(false);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      setProfile(data);

      // Bump last_active_at once per session (if >1 hour stale)
      if (!didBumpActivity.current && data?.last_active_at) {
        const age = Date.now() - new Date(data.last_active_at).getTime();
        if (age > 3_600_000) {
          didBumpActivity.current = true;
          supabase.from('profiles')
            .update({ last_active_at: new Date().toISOString() })
            .eq('id', userId)
            .then(() => {});
        } else {
          didBumpActivity.current = true;
        }
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

  return <>{children}</>;
}
