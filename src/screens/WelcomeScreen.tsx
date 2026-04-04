import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguageStore } from '../stores/languageStore';
import { useAuthStore } from '../stores/authStore';
import AuthScreen from './AuthScreen';

export const WELCOME_SEEN_KEY = 'bookloop_welcome_seen';

const C = {
  bg:      '#fafaf9',
  white:   '#ffffff',
  border:  '#e7e5e4',
  text:    '#1c1917',
  sub:     '#78716c',
  muted:   '#a8a29e',
  primary: '#2563eb',
};

interface Props { onDone: () => void; }

export default function WelcomeScreen({ onDone }: Props) {
  const { isRTL }  = useLanguageStore();
  const { user }   = useAuthStore();
  const insets     = useSafeAreaInsets();

  const [showAuth, setShowAuth]   = useState(false);
  const [authMode, setAuthMode]   = useState<'signin' | 'signup'>('signup');

  // When login succeeds from embedded AuthScreen, auto-dismiss
  useEffect(() => {
    if (user) onDone();
  }, [user]);

  if (showAuth) {
    return (
      <View style={{ flex: 1 }}>
        <AuthScreen initialMode={authMode} />
        <TouchableOpacity
          style={[s.backBtn, { top: insets.top + 8 }]}
          onPress={() => setShowAuth(false)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons
            name={isRTL ? 'chevron-forward' : 'chevron-back'}
            size={26}
            color={C.text}
          />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[s.container, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 }]}>

      {/* ── Logo + tagline ── */}
      <View style={s.top}>
        <Image
          source={require('../../assets/logo.png')}
          style={s.logo}
          resizeMode="contain"
        />
        <Text style={s.tagline}>
          {isRTL ? 'שתפו ספרים, בנו קהילה' : 'Share books, build community'}
        </Text>

        {/* Feature pills */}
        <View style={[s.featureRow, isRTL && s.featureRowRTL]}>
          {([
            { icon: 'book-outline',           label: isRTL ? 'ספרים'  : 'Books'     },
            { icon: 'heart-outline',           label: isRTL ? 'קהילה'  : 'Community' },
            { icon: 'swap-horizontal-outline', label: isRTL ? 'החלפה'  : 'Trade'     },
          ] as const).map(({ icon, label }) => (
            <View key={icon} style={s.pill}>
              <Ionicons name={icon} size={13} color={C.sub} />
              <Text style={s.pillTxt}>{label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── Buttons ── */}
      <View style={s.buttons}>
        <TouchableOpacity
          style={s.primaryBtn}
          onPress={() => { setAuthMode('signup'); setShowAuth(true); }}
          activeOpacity={0.85}
        >
          <Text style={s.primaryTxt}>
            {isRTL ? 'יצירת חשבון' : 'Create Account'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.secondaryBtn}
          onPress={() => { setAuthMode('signin'); setShowAuth(true); }}
          activeOpacity={0.85}
        >
          <Text style={s.secondaryTxt}>
            {isRTL ? 'התחברות' : 'Sign In'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.guestBtn}
          onPress={onDone}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={s.guestTxt}>
            {isRTL ? 'גלישה ללא חשבון ←' : '→ Browse without an account'}
          </Text>
        </TouchableOpacity>
      </View>

    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    paddingHorizontal: 28,
    justifyContent: 'space-between',
  },

  // ── Top ──
  top: { alignItems: 'center', gap: 12 },
  logo: { width: 170, height: 36 },
  tagline: { fontSize: 15, color: C.sub, fontWeight: '500', textAlign: 'center' },
  featureRow:    { flexDirection: 'row', gap: 8, marginTop: 4 },
  featureRowRTL: { flexDirection: 'row-reverse' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.white, borderWidth: 1, borderColor: C.border,
    borderRadius: 20, paddingVertical: 5, paddingHorizontal: 10,
  },
  pillTxt: { fontSize: 12, color: C.sub, fontWeight: '500' },

  // ── Buttons ──
  buttons: { gap: 12 },

  primaryBtn: {
    backgroundColor: C.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryTxt: { color: C.white, fontSize: 16, fontWeight: '600' },

  secondaryBtn: {
    backgroundColor: C.white,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: C.border,
  },
  secondaryTxt: { color: C.text, fontSize: 16, fontWeight: '600' },

  guestBtn:  { alignItems: 'center', paddingVertical: 6 },
  guestTxt:  { fontSize: 14, color: C.muted, fontWeight: '500' },

  // ── Back button (over AuthScreen) ──
  backBtn: {
    position: 'absolute',
    left: 16,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
