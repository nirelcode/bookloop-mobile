import React, { useEffect } from 'react';
import { Linking, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { useLanguageStore } from '../stores/languageStore';

/** Remove any stored Supabase tokens from localStorage without a network call. */
function clearStoredSession() {
  if (typeof window !== 'undefined') {
    try {
      Object.keys(window.localStorage)
        .filter(k => k.startsWith('sb-'))
        .forEach(k => window.localStorage.removeItem(k));
    } catch (_) {}
  }
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
      .catch((err) => {
        console.error('getSession error:', err);
        clearStoredSession();
        signOut();
        resolve();
      });

    // ── Last-resort safety net: if nothing resolves in 8 s,
    //    wipe the bad token (sync, no network) and unblock. ──
    const timeout = setTimeout(() => {
      if (!resolved) {
        console.warn('Auth timeout — clearing stored session');
        clearStoredSession();
        signOut();
        resolve();
      }
    }, 8000);

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

  return <>{children}</>;
}
