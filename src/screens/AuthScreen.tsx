import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Image, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { signInWithGoogle } from '../lib/googleAuth';
import { useLanguageStore } from '../stores/languageStore';
import { CityPickerModal } from '../components/CityPickerModal';

const C = {
  bg:           '#fafaf9',
  white:        '#ffffff',
  border:       '#e7e5e4',
  inputBg:      '#f5f5f4',
  text:         '#1c1917',
  sub:          '#78716c',
  muted:        '#a8a29e',
  primary:      '#2563eb',
  primaryLight: '#eff6ff',
  emerald:      '#059669',
  emeraldLight: '#d1fae5',
  amber:        '#d97706',
  amberLight:   '#fef3c7',
  red:          '#ef4444',
  redLight:     '#fee2e2',
};

type Mode = 'signin' | 'signup';

// ── Input row wrapper ────────────────────────────────────────────────────────
function InputRow({ icon, isRTL, children }: { icon: string; isRTL: boolean; children: React.ReactNode }) {
  return (
    <View style={[s.inputWrap, isRTL && s.inputWrapRTL]}>
      <Ionicons name={icon as any} size={18} color={C.muted} style={s.inputIcon} />
      {children}
    </View>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────
export default function AuthScreen() {
  const { isRTL } = useLanguageStore();
  const insets = useSafeAreaInsets();

  const [mode, setMode]             = useState<Mode>('signin');
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [name, setName]             = useState('');
  const [city, setCity]             = useState('');
  const [showPass, setShowPass]     = useState(false);
  const [agreeTerms, setAgreeTerms]         = useState(false);
  const [marketingEmails, setMarketingEmails] = useState(false);
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [loading, setLoading]             = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError]                 = useState('');
  const [successEmail, setSuccessEmail]   = useState('');
  const [continueLoading, setContinueLoading] = useState(false);
  const [continueError, setContinueError]     = useState('');

  const clearError = () => setError('');

  const switchMode = (m: Mode) => { setMode(m); clearError(); setAgreeTerms(false); };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    clearError();
    const result = await signInWithGoogle();
    if (!result.success) setError(result.error ?? 'Google sign-in failed');
    setGoogleLoading(false);
  };

  const handleSubmit = async () => {
    clearError();
    if (!email.trim() || !password.trim()) {
      setError(isRTL ? 'נא למלא את כל השדות' : 'Please fill in all fields');
      return;
    }
    if (mode === 'signup' && !name.trim()) {
      setError(isRTL ? 'נא להזין שם' : 'Please enter your name');
      return;
    }
    if (mode === 'signup' && !agreeTerms) {
      setError(isRTL ? 'יש לאשר את תנאי השימוש' : 'Please agree to the Terms of Service');
      return;
    }
    if (password.length < 6) {
      setError(isRTL ? 'הסיסמה חייבת להכיל לפחות 6 תווים' : 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw err;
      } else {
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            // Opens the app after email verification instead of the webapp
            emailRedirectTo: 'bookloop://auth/callback',
            // Passed to handle_new_user trigger → saved to profiles automatically
            data: {
              name: name.trim(),
              city: city || 'תל אביב',
              signup_platform: Platform.OS,
            },
          },
        });
        if (err) throw err;
        // Supabase returns a user with empty identities when the email is already registered
        if (data.user && (data.user.identities?.length ?? 1) === 0) {
          setError(
            isRTL
              ? 'כתובת האימייל כבר רשומה במערכת. נסו להתחבר במקום זאת.'
              : 'This email is already registered. Try signing in instead.',
          );
          setLoading(false);
          return;
        }
        if (data.user) {
          // Profile is created by the handle_new_user DB trigger — no upsert needed
          if (!data.session) {
            setSuccessEmail(email.trim());
          }
        }
      }
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  // ── Try to continue after registration (email may not be confirmed yet) ───
  const handleContinue = async () => {
    setContinueError('');
    setContinueLoading(true);
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email: successEmail, password });
      if (err) throw err;
      // onAuthStateChange handles navigation automatically
    } catch (err: any) {
      const msg: string = (err.message ?? '').toLowerCase();
      if (msg.includes('not confirmed') || msg.includes('email not confirmed')) {
        setContinueError(
          isRTL
            ? 'יש לאשר את האימייל תחילה — בדקו את תיבת הדואר'
            : 'Please confirm your email first — check your inbox',
        );
      } else {
        setContinueError(isRTL ? 'משהו השתבש, נסו שוב' : 'Something went wrong, please try again');
      }
    } finally {
      setContinueLoading(false);
    }
  };

  // ── Success panel (email verification sent) ──────────────────────────────
  if (successEmail) {
    return (
      <View style={[s.root, { justifyContent: 'center', paddingHorizontal: 24 }]}>
        <View style={s.successCard}>
          <View style={s.successIconWrap}>
            <Ionicons name="mail-unread-outline" size={40} color={C.emerald} />
          </View>
          <Text style={s.successTitle}>
            {isRTL ? 'נרשמת בהצלחה!' : 'Account Created!'}
          </Text>
          <Text style={s.successBody}>
            {isRTL
              ? `שלחנו אימייל לאימות החשבון אל`
              : `We sent a verification email to`}
          </Text>
          <Text style={s.successEmail}>{successEmail}</Text>
          <Text style={s.successHint}>
            {isRTL
              ? 'בדקו את תיבת הדואר הנכנס, כולל ספאם.'
              : 'Please check your inbox, including spam.'}
          </Text>

          {/* Continue button — tries to sign in immediately */}
          <TouchableOpacity
            style={s.continueBtn}
            onPress={handleContinue}
            disabled={continueLoading}
            activeOpacity={0.85}
          >
            {continueLoading ? (
              <ActivityIndicator color={C.white} size="small" />
            ) : (
              <Text style={s.continueBtnTxt}>
                {isRTL ? 'המשך' : 'Continue'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Inline error if email not yet confirmed */}
          {!!continueError && (
            <View style={s.continueError}>
              <Ionicons name="mail-outline" size={14} color={C.amber} />
              <Text style={s.continueErrorTxt}>{continueError}</Text>
            </View>
          )}

          {/* Back to sign in */}
          <TouchableOpacity
            style={s.successBtn}
            onPress={() => { setSuccessEmail(''); setContinueError(''); setMode('signin'); setPassword(''); }}
            activeOpacity={0.85}
          >
            <Ionicons name="arrow-back" size={16} color={C.primary} />
            <Text style={s.successBtnTxt}>
              {isRTL ? 'חזרה להתחברות' : 'Back to Sign In'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

        {/* ── Hero ── */}
        <View style={[s.hero, { paddingTop: insets.top + 44 }]}>
          <Image source={require('../../assets/logo.png')} style={s.logo} resizeMode="contain" />
          <Text style={s.tagline}>
            {isRTL ? 'שתפו ספרים, בנו קהילה' : 'Share books, build community'}
          </Text>
          <View style={s.featureRow}>
            {([
              { icon: 'book-outline',           label: isRTL ? 'ספרים'   : 'Books'     },
              { icon: 'heart-outline',           label: isRTL ? 'קהילה'   : 'Community' },
              { icon: 'swap-horizontal-outline', label: isRTL ? 'החלפה'  : 'Trade'     },
            ] as const).map(({ icon, label }) => (
              <View key={icon} style={s.featureChip}>
                <Ionicons name={icon} size={13} color={C.sub} />
                <Text style={s.featureChipTxt}>{label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Card ── */}
        <View style={s.card}>

          {/* Mode tabs */}
          <View style={s.tabs}>
            <TouchableOpacity
              style={[s.tab, mode === 'signin' && s.tabActive]}
              onPress={() => switchMode('signin')}
              activeOpacity={0.7}
            >
              <Text style={[s.tabTxt, mode === 'signin' && s.tabTxtActive]}>
                {isRTL ? 'התחברות' : 'Sign In'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.tab, mode === 'signup' && s.tabActive]}
              onPress={() => switchMode('signup')}
              activeOpacity={0.7}
            >
              <Text style={[s.tabTxt, mode === 'signup' && s.tabTxtActive]}>
                {isRTL ? 'הרשמה' : 'Sign Up'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Google */}
          <TouchableOpacity
            style={s.googleBtn}
            onPress={handleGoogle}
            activeOpacity={0.85}
            disabled={googleLoading}
          >
            {googleLoading ? (
              <ActivityIndicator color={C.text} size="small" />
            ) : (
              <>
                <Image
                  source={{ uri: 'https://www.google.com/favicon.ico' }}
                  style={s.googleIcon}
                />
                <Text style={s.googleTxt}>
                  {isRTL ? 'המשך עם Google' : 'Continue with Google'}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={s.divider}>
            <View style={s.dividerLine} />
            <Text style={s.dividerTxt}>{isRTL ? 'או' : 'or'}</Text>
            <View style={s.dividerLine} />
          </View>

          {/* Signup-only fields */}
          {mode === 'signup' && (
            <>
              {/* Name */}
              <InputRow icon="person-outline" isRTL={isRTL}>
                <TextInput
                  style={[s.input, isRTL && s.rAlign]}
                  placeholder={isRTL ? 'שם מלא' : 'Full name'}
                  placeholderTextColor={C.muted}
                  value={name}
                  onChangeText={t => { setName(t); clearError(); }}
                  autoCapitalize="words"
                />
              </InputRow>

              {/* City picker button */}
              <TouchableOpacity
                style={[s.inputWrap, isRTL && s.inputWrapRTL]}
                onPress={() => setShowCityPicker(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="location-outline" size={18} color={C.muted} style={s.inputIcon} />
                <Text style={[s.input, s.cityDisplay, !city && s.placeholder, isRTL && s.rAlign]}>
                  {city || (isRTL ? 'עיר (אופציונלי)' : 'City (optional)')}
                </Text>
                <Ionicons name="chevron-down" size={16} color={C.muted} />
              </TouchableOpacity>
            </>
          )}

          {/* Email */}
          <InputRow icon="mail-outline" isRTL={isRTL}>
            <TextInput
              style={[s.input, isRTL && s.rAlign]}
              placeholder={isRTL ? 'אימייל' : 'Email'}
              placeholderTextColor={C.muted}
              value={email}
              onChangeText={t => { setEmail(t); clearError(); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </InputRow>

          {/* Password */}
          <InputRow icon="lock-closed-outline" isRTL={isRTL}>
            <TextInput
              style={[s.input, s.inputFlex, isRTL && s.rAlign]}
              placeholder={isRTL ? 'סיסמה (מינימום 6 תווים)' : 'Password (min. 6 chars)'}
              placeholderTextColor={C.muted}
              value={password}
              onChangeText={t => { setPassword(t); clearError(); }}
              secureTextEntry={!showPass}
              autoCapitalize="none"
            />
            <TouchableOpacity
              onPress={() => setShowPass(p => !p)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={18} color={C.muted} />
            </TouchableOpacity>
          </InputRow>

          {/* Terms + marketing checkboxes (signup only) */}
          {mode === 'signup' && (
            <>
              {/* Required — terms */}
              <View style={[s.termsRow, isRTL && s.termsRowRTL]}>
                <TouchableOpacity
                  onPress={() => { setAgreeTerms(p => !p); clearError(); }}
                  activeOpacity={0.8}
                  style={{ flexShrink: 0 }}
                >
                  <View style={[s.checkbox, agreeTerms && s.checkboxOn]}>
                    {agreeTerms && <Ionicons name="checkmark" size={12} color={C.white} />}
                  </View>
                </TouchableOpacity>
                <Text
                  style={[s.termsTxt, isRTL && s.rAlign]}
                  onPress={() => { setAgreeTerms(p => !p); clearError(); }}
                >
                  {isRTL ? 'קראתי ואני מסכים/ה ל' : 'I agree to the '}
                  <Text
                    style={s.termsLink}
                    onPress={() => Linking.openURL('https://www.bookloop.co.il/terms')}
                    suppressHighlighting
                  >{isRTL ? 'תנאי השימוש' : 'Terms of Service'}</Text>
                  {isRTL ? ' ול' : ' and '}
                  <Text
                    style={s.termsLink}
                    onPress={() => Linking.openURL('https://www.bookloop.co.il/privacy')}
                    suppressHighlighting
                  >{isRTL ? 'מדיניות הפרטיות' : 'Privacy Policy'}</Text>
                  <Text style={s.termsRequired}> *</Text>
                </Text>
              </View>

              {/* Optional — marketing emails */}
              <TouchableOpacity
                style={[s.termsRow, isRTL && s.termsRowRTL, { marginTop: 2 }]}
                onPress={() => setMarketingEmails(p => !p)}
                activeOpacity={0.8}
              >
                <View style={[s.checkbox, marketingEmails && s.checkboxOn]}>
                  {marketingEmails && <Ionicons name="checkmark" size={12} color={C.white} />}
                </View>
                <Text style={[s.termsTxt, isRTL && s.rAlign]}>
                  {isRTL
                    ? 'אני מעוניין/ת לקבל עדכונים, טיפים ומבצעים באימייל'
                    : "I'd like to receive updates, tips and offers by email"}
                  <Text style={s.termsOptional}>
                    {isRTL ? ' (אופציונלי)' : ' (optional)'}
                  </Text>
                </Text>
              </TouchableOpacity>
            </>
          )}

          {/* Error */}
          {!!error && (
            <View style={s.errorWrap}>
              <Ionicons name="alert-circle-outline" size={15} color={C.red} />
              <Text style={s.errorTxt}>{error}</Text>
            </View>
          )}

          {/* Submit */}
          <TouchableOpacity
            style={s.submitBtn}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={C.white} />
            ) : (
              <Text style={s.submitTxt}>
                {mode === 'signin'
                  ? (isRTL ? 'התחברות' : 'Sign In')
                  : (isRTL ? 'יצירת חשבון' : 'Create Account')}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Bottom note */}
        {mode === 'signin' ? (
          <Text style={s.bottomNote}>
            {isRTL ? 'בהמשך אתם מסכימים ל' : 'By continuing you agree to our '}
            <Text
              style={s.bottomNoteLink}
              onPress={() => Linking.openURL('https://www.bookloop.co.il/terms')}
              suppressHighlighting
            >{isRTL ? 'תנאי השימוש' : 'Terms'}</Text>
            {isRTL ? ' ול' : ' & '}
            <Text
              style={s.bottomNoteLink}
              onPress={() => Linking.openURL('https://www.bookloop.co.il/privacy')}
              suppressHighlighting
            >{isRTL ? 'מדיניות הפרטיות' : 'Privacy Policy'}</Text>
          </Text>
        ) : (
          <Text style={s.bottomNote}>
            {isRTL ? 'כל הפרטים מאובטחים ומוגנים' : 'Your details are safe and secure'}
          </Text>
        )}
      </ScrollView>

      {/* City picker modal */}
      <CityPickerModal
        visible={showCityPicker}
        selected={city}
        isRTL={isRTL}
        onSelect={setCity}
        onClose={() => setShowCityPicker(false)}
      />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { flexGrow: 1, paddingBottom: 40 },

  // ── Hero ──
  hero: {
    alignItems: 'center',
    paddingBottom: 32,
    paddingHorizontal: 24,
  },
  logo:    { width: 170, height: 36, marginBottom: 12 },
  tagline: { fontSize: 15, color: C.sub, fontWeight: '500', marginBottom: 16 },
  featureRow: { flexDirection: 'row', gap: 8 },
  featureChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.white, borderWidth: 1, borderColor: C.border,
    borderRadius: 20, paddingVertical: 5, paddingHorizontal: 10,
  },
  featureChipTxt: { fontSize: 12, color: C.sub, fontWeight: '500' },

  // ── Card ──
  card: {
    marginHorizontal: 20,
    backgroundColor: C.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 16,
    elevation: 4,
  },

  // Tabs
  tabs: {
    flexDirection: 'row',
    backgroundColor: C.inputBg,
    borderRadius: 12,
    padding: 3,
    marginBottom: 20,
  },
  tab:          { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  tabActive:    {
    backgroundColor: C.white,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  tabTxt:       { fontSize: 14, fontWeight: '600', color: C.muted },
  tabTxtActive: { color: C.text },

  // Google
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderWidth: 1.5, borderColor: C.border, borderRadius: 12,
    paddingVertical: 13, marginBottom: 16, backgroundColor: C.white,
  },
  googleIcon: { width: 18, height: 18 },
  googleTxt:  { fontSize: 15, fontWeight: '600', color: C.text },

  // Divider
  divider:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  dividerTxt:  { fontSize: 12, color: C.muted, fontWeight: '500' },

  // Inputs
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.white, borderRadius: 12,
    paddingHorizontal: 14, marginBottom: 10,
    borderWidth: 1, borderColor: C.border,
  },
  inputWrapRTL: { flexDirection: 'row-reverse' },
  inputIcon:    { marginRight: 10 },
  input:        { flex: 1, paddingVertical: 13, fontSize: 14, color: C.text },
  inputFlex:    { flex: 1 },
  cityDisplay:  { paddingRight: 4 },
  placeholder:  { color: C.muted },
  rAlign:       { textAlign: 'right' },

  // Terms
  termsRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14, marginTop: 4 },
  termsRowRTL: { flexDirection: 'row-reverse' },
  checkbox: {
    width: 20, height: 20, borderRadius: 5,
    borderWidth: 1.5, borderColor: C.border,
    backgroundColor: C.white,
    justifyContent: 'center', alignItems: 'center',
    marginTop: 1, flexShrink: 0,
  },
  checkboxOn: { backgroundColor: C.primary, borderColor: C.primary },
  termsTxt:      { flex: 1, fontSize: 13, color: C.sub, lineHeight: 19 },
  termsLink:     { color: C.primary, fontWeight: '600' },
  termsRequired: { color: C.red, fontWeight: '700' },
  termsOptional: { color: C.muted },

  // Error
  errorWrap: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 12,
    backgroundColor: C.redLight, borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 12,
  },
  errorTxt: { fontSize: 13, color: C.red, flex: 1, lineHeight: 18 },

  // Submit
  submitBtn: {
    backgroundColor: C.primary, borderRadius: 12,
    paddingVertical: 15, alignItems: 'center', marginTop: 4,
    shadowColor: C.primary, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 3,
  },
  submitTxt: { color: C.white, fontSize: 16, fontWeight: '600' },

  // Bottom note
  bottomNote: {
    textAlign: 'center', fontSize: 11, color: C.muted,
    marginTop: 20, paddingHorizontal: 32, lineHeight: 16,
  },
  bottomNoteLink: { color: C.primary, fontWeight: '600' },

  // ── Success panel ──
  successCard: {
    backgroundColor: C.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 16,
    elevation: 4,
  },
  successIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: C.emeraldLight,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 20,
  },
  successTitle: { fontSize: 22, fontWeight: '700', color: C.text, marginBottom: 12, textAlign: 'center' },
  successBody:  { fontSize: 14, color: C.sub, textAlign: 'center', lineHeight: 20 },
  successEmail: { fontSize: 15, fontWeight: '700', color: C.text, marginTop: 4, textAlign: 'center' },
  successHint:  { fontSize: 13, color: C.muted, marginTop: 8, textAlign: 'center', lineHeight: 18 },
  // Continue button (primary, full-width)
  continueBtn: {
    width: '100%',
    backgroundColor: C.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
    shadowColor: C.primary, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 3,
  },
  continueBtnTxt: { color: C.white, fontSize: 16, fontWeight: '600' },

  continueError: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    marginTop: 12, paddingVertical: 10, paddingHorizontal: 14,
    backgroundColor: '#fef3c7', borderRadius: 10,
    width: '100%',
  },
  continueErrorTxt: { flex: 1, fontSize: 13, color: '#92400e', lineHeight: 18 },

  // Back to sign-in link
  successBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 16, paddingVertical: 10, paddingHorizontal: 20,
    borderWidth: 1.5, borderColor: C.border, borderRadius: 12,
  },
  successBtnTxt: { fontSize: 14, fontWeight: '600', color: C.sub },
});
