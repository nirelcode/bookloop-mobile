import React, { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Switch,
  Linking,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useToast, Toast } from '../components/Toast';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useLanguageStore } from '../stores/languageStore';
import { useAuthStore } from '../stores/authStore';
import { supabase } from '../lib/supabase';
import i18n from '../lib/i18n';
import {
  registerForPushNotificationsAsync,
  unregisterPushNotificationsAsync,
  getNotificationsEnabled,
  checkPushPermissionStatus,
} from '../lib/notifications';

const C = {
  bg: '#fafaf9',
  white: '#ffffff',
  border: '#e7e5e4',
  text: '#1c1917',
  sub: '#78716c',
  muted: '#a8a29e',
  primary: '#2563eb',
  primaryLight: '#eff6ff',
  emerald: '#059669',
  red: '#ef4444',
  redLight: '#fee2e2',
  amber: '#d97706',
};

interface RowProps {
  icon: string;
  iconColor: string;
  iconBg: string;
  label: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  last?: boolean;
}

function Row({ icon, iconColor, iconBg, label, value, onPress, destructive, last }: RowProps) {
  const { isRTL } = useLanguageStore();
  const textColor = destructive ? C.red : C.text;
  const chevron = isRTL ? 'chevron-back' : 'chevron-forward';

  const inner = (
    <View style={[s.row, !last && s.rowBorder, isRTL && s.rowRTL]}>
      <View style={[s.iconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={icon as any} size={18} color={iconColor} />
      </View>
      <Text style={[s.rowLabel, { color: textColor }]}>{label}</Text>
      {value ? (
        <Text style={s.rowValue}>{value}</Text>
      ) : onPress ? (
        <Ionicons name={chevron} size={16} color={destructive ? C.red : C.muted} />
      ) : null}
    </View>
  );

  if (!onPress) return inner;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      {inner}
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const navigation = useNavigation<any>();
  const insets     = useSafeAreaInsets();
  const { language, setLanguage, isRTL } = useLanguageStore();
  const { user, profile } = useAuthStore();
  const { showToast, toast } = useToast();

  // Delete account modal state
  const [deleteVisible,  setDeleteVisible]  = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteLoading,  setDeleteLoading]  = useState(false);
  const [deleteError,    setDeleteError]    = useState('');

  // Change password modal state
  const [pwVisible,    setPwVisible]    = useState(false);
  const [pwCurrent,    setPwCurrent]    = useState('');
  const [pwNew,        setPwNew]        = useState('');
  const [pwConfirm,    setPwConfirm]    = useState('');
  const [pwLoading,    setPwLoading]    = useState(false);
  const [pwError,      setPwError]      = useState('');
  const [showCurrent,  setShowCurrent]  = useState(false);
  const [showNew,      setShowNew]      = useState(false);
  const [showConfirm,  setShowConfirm]  = useState(false);

  // Contact modal state
  const [contactVisible, setContactVisible] = useState(false);
  const [contactReason,  setContactReason]  = useState('general');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSending, setContactSending] = useState(false);

  // Notification toggle state
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const isExpoGo = Constants.appOwnership === 'expo';

  useEffect(() => {
    if (!user || isExpoGo) return;
    getNotificationsEnabled().then(setNotifEnabled);
  }, [user, isExpoGo]);

  const handleNotifToggle = async (value: boolean) => {
    if (!user || isExpoGo) return;
    // Optimistic update — prevents the switch snapping back mid-animation
    setNotifEnabled(value);
    setNotifLoading(true);
    try {
      if (value) {
        const status = await checkPushPermissionStatus();
        if (status === 'denied') {
          setNotifEnabled(false); // revert
          Alert.alert(
            i18n.t('notifications.permissionRequired'),
            i18n.t('notifications.permissionMessage'),
            [
              { text: isRTL ? 'ביטול' : 'Cancel', style: 'cancel' },
              { text: isRTL ? 'פתח הגדרות' : 'Open Settings', onPress: () => Linking.openSettings() },
            ],
          );
          setNotifLoading(false);
          return;
        }
        const ok = await registerForPushNotificationsAsync(user.id);
        if (!ok) {
          setNotifEnabled(false); // revert
          showToast(
            isRTL ? 'לא ניתן להפעיל הודעות. נסו שוב.' : 'Could not enable notifications. Please try again.',
            'error',
          );
        } else {
          showToast(isRTL ? 'הודעות הופעלו' : 'Notifications enabled');
        }
      } else {
        await unregisterPushNotificationsAsync(user.id);
        showToast(isRTL ? 'הודעות כובו' : 'Notifications disabled');
      }
    } catch (e: any) {
      setNotifEnabled(!value); // revert
      Alert.alert('Error', e?.message ?? 'Unknown error toggling notifications');
    }
    setNotifLoading(false);
  };

  const handleLanguageChange = (lang: string) => {
    setLanguage(lang);
    // no alert needed — tab bar and screens react immediately via Zustand
  };

  const handleChangePassword = () => {
    setPwCurrent(''); setPwNew(''); setPwConfirm(''); setPwError('');
    setShowCurrent(false); setShowNew(false); setShowConfirm(false);
    setPwVisible(true);
  };

  const confirmChangePassword = async () => {
    if (!user?.email) return;
    if (!pwCurrent) { setPwError(isRTL ? 'הזן את הסיסמה הנוכחית' : 'Enter your current password'); return; }
    if (pwNew.length < 6)  { setPwError(isRTL ? 'הסיסמה החדשה חייבת להכיל לפחות 6 תווים' : 'New password must be at least 6 characters'); return; }
    if (pwNew !== pwConfirm) { setPwError(isRTL ? 'הסיסמאות אינן תואמות' : "Passwords don't match"); return; }

    setPwLoading(true); setPwError('');
    try {
      // Verify current password
      const { error: authErr } = await supabase.auth.signInWithPassword({ email: user.email, password: pwCurrent });
      if (authErr) { setPwError(isRTL ? 'הסיסמה הנוכחית שגויה' : 'Current password is incorrect'); setPwLoading(false); return; }

      // Update to new password
      const { error: updateErr } = await supabase.auth.updateUser({ password: pwNew });
      if (updateErr) throw updateErr;

      setPwVisible(false);
      showToast(isRTL ? 'הסיסמה עודכנה בהצלחה' : 'Password updated successfully', 'success');
    } catch (e: any) {
      setPwError(e.message || (isRTL ? 'שגיאה' : 'Something went wrong'));
    } finally {
      setPwLoading(false);
    }
  };

  const isOAuthUser = user?.app_metadata?.provider === 'google';

  const handleDeleteAccount = () => {
    setDeletePassword('');
    setDeleteError('');
    setDeleteVisible(true);
  };

  const confirmDeleteAccount = async () => {
    if (!user) return;
    setDeleteLoading(true);
    setDeleteError('');
    try {
      // For email users — verify password first
      if (!isOAuthUser) {
        const { error: authErr } = await supabase.auth.signInWithPassword({
          email: user.email!,
          password: deletePassword,
        });
        if (authErr) {
          setDeleteError(isRTL ? 'סיסמה שגויה. נסו שוב.' : 'Wrong password. Please try again.');
          setDeleteLoading(false);
          return;
        }
      }

      // Final confirmation before permanent deletion
      setDeleteLoading(false);
      Alert.alert(
        isRTL ? 'בטוחים?' : 'Are you sure?',
        isRTL
          ? 'כל הנתונים שלך יימחקו לצמיתות. לא ניתן לשחזר.'
          : 'All your data will be permanently deleted. This cannot be undone.',
        [
          { text: isRTL ? 'ביטול' : 'Cancel', style: 'cancel' },
          {
            text: isRTL ? 'מחק לצמיתות' : 'Delete Forever',
            style: 'destructive',
            onPress: async () => {
              setDeleteLoading(true);
              try {
                // Delete all data + auth user in one RPC (SECURITY DEFINER runs as postgres)
                const { error: rpcErr } = await supabase.rpc('delete_my_account');
                if (rpcErr) throw rpcErr;

                // Clear local flags so re-registration starts fresh
                await AsyncStorage.removeItem('bookloop_setup_done');
                // Sign out locally
                useAuthStore.getState().signOut();
                supabase.auth.signOut();
              } catch (e: any) {
                setDeleteError(e?.message ?? (isRTL ? 'שגיאה, נסו שוב.' : 'Something went wrong.'));
                setDeleteLoading(false);
              }
            },
          },
        ],
      );
    } catch (e: any) {
      setDeleteError(e?.message ?? (isRTL ? 'שגיאה, נסו שוב.' : 'Something went wrong.'));
      setDeleteLoading(false);
    }
  };

  const handleTerms   = () => Linking.openURL('https://www.bookloop.co.il/terms');
  const handlePrivacy = () => Linking.openURL('https://www.bookloop.co.il/privacy');

  const handleContact = async () => {
    if (!contactMessage.trim()) return;
    setContactSending(true);
    try {
      const { error } = await supabase.from('contact_messages').insert({
        name:    profile?.name ?? (isRTL ? 'משתמש' : 'User'),
        email:   user?.email ?? '',
        reason:  contactReason,
        message: contactMessage.trim(),
        user_id: user?.id ?? null,
      });
      if (error) throw error;
      setContactVisible(false);
      setContactMessage('');
      setContactReason('general');
      showToast(isRTL ? 'הודעתכם נשלחה, תודה!' : 'Message sent, thank you!');
    } catch {
      showToast(isRTL ? 'שגיאה בשליחה, נסו שוב' : 'Failed to send, please try again', 'error');
    } finally {
      setContactSending(false);
    }
  };

  const CONTACT_REASONS = isRTL
    ? [
        { key: 'general',  label: 'שאלה כללית' },
        { key: 'bug',      label: 'דיווח על תקלה' },
        { key: 'feedback', label: 'משוב / הצעה' },
        { key: 'other',    label: 'אחר' },
      ]
    : [
        { key: 'general',  label: 'General question' },
        { key: 'bug',      label: 'Bug report' },
        { key: 'feedback', label: 'Feedback / Suggestion' },
        { key: 'other',    label: 'Other' },
      ];

  return (
    <View style={{ flex: 1 }}>
    <ScrollView style={s.container} contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 48 }]}>

      {/* ── Language ── */}
      <Text style={[s.sectionLabel, isRTL && s.rAlign]}>{i18n.t('settings.language')}</Text>
      <View style={s.card}>
        {(['en', 'he'] as const).map((lang, i) => {
          const active = language === lang;
          const label = lang === 'en' ? 'English' : 'עברית';
          return (
            <TouchableOpacity
              key={lang}
              style={[s.langRow, i === 0 && s.rowBorder ? {} : {}, active && s.langActive, i > 0 && s.rowBorder]}
              onPress={() => handleLanguageChange(lang)}
              activeOpacity={0.7}
            >
              <Text style={[s.langLabel, active && { color: C.primary, fontWeight: '700' }]}>{label}</Text>
              {active && <Ionicons name="checkmark-circle" size={20} color={C.primary} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Notifications ── */}
      {user && (
        <>
          <Text style={[s.sectionLabel, isRTL && s.rAlign]}>{i18n.t('notifications.sectionTitle')}</Text>
          <View style={s.card}>
            <View style={[s.row, isRTL && s.rowRTL]}>
              <View style={[s.iconWrap, { backgroundColor: '#eff6ff' }]}>
                <Ionicons name="notifications-outline" size={18} color={C.primary} />
              </View>
              <Text style={s.rowLabel}>{i18n.t('notifications.messages')}</Text>
              <Switch
                value={notifEnabled}
                onValueChange={handleNotifToggle}
                disabled={notifLoading || isExpoGo}
                trackColor={{ false: C.border, true: '#93c5fd' }}
                thumbColor={notifEnabled ? C.primary : C.muted}
              />
            </View>
          </View>
        </>
      )}

      {/* ── Account ── */}
      {user && (
        <>
          <Text style={[s.sectionLabel, isRTL && s.rAlign]}>{i18n.t('settings.account')}</Text>
          <View style={s.card}>
            {!isOAuthUser && (
              <Row
                icon="lock-closed-outline"
                iconColor={C.amber}
                iconBg="#fef3c7"
                label={i18n.t('settings.changePassword')}
                onPress={handleChangePassword}
              />
            )}
            <Row
              icon="person-remove-outline"
              iconColor={C.red}
              iconBg={C.redLight}
              label={isRTL ? 'משתמשים חסומים' : 'Blocked users'}
              onPress={() => navigation.navigate('BlockedUsers')}
            />
            <Row
              icon="trash-outline"
              iconColor={C.red}
              iconBg={C.redLight}
              label={isRTL ? 'מחיקת חשבון' : 'Delete Account'}
              onPress={handleDeleteAccount}
              destructive
              last
            />
          </View>
        </>
      )}

      {/* ── About ── */}
      <Text style={[s.sectionLabel, isRTL && s.rAlign]}>{i18n.t('settings.about')}</Text>
      <View style={s.card}>
        <Row
          icon="information-circle-outline"
          iconColor={C.sub}
          iconBg="#f5f5f4"
          label={i18n.t('settings.version')}
          value="1.0.0"
        />
        <Row
          icon="document-text-outline"
          iconColor={C.sub}
          iconBg="#f5f5f4"
          label={i18n.t('settings.termsOfService')}
          onPress={handleTerms}
        />
        <Row
          icon="shield-checkmark-outline"
          iconColor={C.emerald}
          iconBg="#d1fae5"
          label={i18n.t('settings.privacyPolicy')}
          onPress={handlePrivacy}
        />
        <Row
          icon="chatbubble-ellipses-outline"
          iconColor={C.primary}
          iconBg={C.primaryLight}
          label={isRTL ? 'צרו קשר' : 'Contact Us'}
          onPress={() => setContactVisible(true)}
          last
        />
      </View>

      {/* ── Follow us ── */}
      <Text style={[s.sectionLabel, isRTL && s.rAlign]}>
        {isRTL ? 'עקבו אחרינו' : 'Follow Us'}
      </Text>
      <View style={[s.card, s.socialCard]}>
        <TouchableOpacity
          style={s.socialBtn}
          onPress={() => Linking.openURL('https://www.instagram.com/bookloop.co.il?igsh=MWoxZmYxOXJxcnBvZg==')}
          activeOpacity={0.75}
        >
          <View style={[s.socialIconWrap, { backgroundColor: '#fce4ec' }]}>
            <Ionicons name="logo-instagram" size={26} color="#E1306C" />
          </View>
          <Text style={s.socialLabel}>Instagram</Text>
        </TouchableOpacity>

        <View style={s.socialDivider} />

        <TouchableOpacity
          style={s.socialBtn}
          onPress={() => Linking.openURL('https://www.tiktok.com/@bookloop.co.il?_r=1&_t=ZS-94StOFijAKS')}
          activeOpacity={0.75}
        >
          <View style={[s.socialIconWrap, { backgroundColor: '#010101' }]}>
            <Ionicons name="logo-tiktok" size={24} color="#ffffff" />
          </View>
          <Text style={s.socialLabel}>TikTok</Text>
        </TouchableOpacity>
      </View>

      {/* ── Delete account modal ── */}
      <Modal visible={deleteVisible} transparent animationType="fade" onRequestClose={() => setDeleteVisible(false)}>
        <KeyboardAvoidingView style={s.modalKAV} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={s.modalOverlay} onPress={() => !deleteLoading && setDeleteVisible(false)}>
            <Pressable style={s.modalCard} onPress={e => e.stopPropagation()}>

              <View style={[s.modalHeader, isRTL && s.rowRTL]}>
                <Text style={[s.modalTitle, { color: C.red }]}>
                  {isRTL ? 'מחיקת חשבון' : 'Delete Account'}
                </Text>
                <TouchableOpacity onPress={() => setDeleteVisible(false)} disabled={deleteLoading} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={22} color={C.muted} />
                </TouchableOpacity>
              </View>

              <Text style={[s.modalSub, { marginBottom: 16, lineHeight: 20 }, isRTL && { textAlign: 'right' }]}>
                {isRTL
                  ? 'פעולה זו תמחק לצמיתות את כל הנתונים שלך — פרופיל, ספרים, ורשימות מועדפות. לא ניתן לשחזר.'
                  : 'This will permanently delete your profile, listings, and all your data. This cannot be undone.'}
              </Text>

              <Text style={[s.deleteLabel, isRTL && { textAlign: 'right' }]}>
                {isOAuthUser
                  ? (isRTL ? 'הקלידו "password" לאישור' : 'Type "password" to confirm')
                  : (isRTL ? 'הזינו סיסמה לאישור' : 'Enter your password to confirm')}
              </Text>
              <TextInput
                style={[s.modalInput, { minHeight: 48 }, isRTL && { textAlign: 'right' }]}
                placeholder={isOAuthUser ? 'password' : (isRTL ? 'סיסמה' : 'Password')}
                placeholderTextColor={C.muted}
                secureTextEntry={!isOAuthUser}
                autoCapitalize="none"
                value={deletePassword}
                onChangeText={t => { setDeletePassword(t); setDeleteError(''); }}
                editable={!deleteLoading}
              />

              {!!deleteError && (
                <Text style={s.deleteErrTxt}>{deleteError}</Text>
              )}

              <TouchableOpacity
                style={[s.deleteConfirmBtn, (deleteLoading || (isOAuthUser ? deletePassword.trim().toLowerCase() !== 'password' : !deletePassword)) && { opacity: 0.5 }]}
                onPress={confirmDeleteAccount}
                disabled={deleteLoading || (isOAuthUser ? deletePassword.trim().toLowerCase() !== 'password' : !deletePassword)}
                activeOpacity={0.85}
              >
                {deleteLoading
                  ? <ActivityIndicator color={C.white} size="small" />
                  : <Text style={s.modalSendTxt}>{isRTL ? 'מחק את חשבוני' : 'Delete My Account'}</Text>
                }
              </TouchableOpacity>

            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Change password modal ── */}
      <Modal visible={pwVisible} transparent animationType="fade" onRequestClose={() => !pwLoading && setPwVisible(false)}>
        <KeyboardAvoidingView style={s.modalKAV} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={s.modalOverlay} onPress={() => !pwLoading && setPwVisible(false)}>
            <Pressable style={s.modalCard} onPress={e => e.stopPropagation()}>

              <View style={[s.modalHeader, isRTL && s.rowRTL]}>
                <Text style={s.modalTitle}>{isRTL ? 'שינוי סיסמה' : 'Change Password'}</Text>
                <TouchableOpacity onPress={() => setPwVisible(false)} disabled={pwLoading} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={22} color={C.muted} />
                </TouchableOpacity>
              </View>

              <View style={[s.pwInputWrap, { marginBottom: 10 }]}>
                <TextInput
                  style={[s.modalInput, { minHeight: 48, marginBottom: 0 }, isRTL ? { textAlign: 'right', paddingLeft: 48 } : { paddingRight: 48 }]}
                  placeholder={isRTL ? 'סיסמה נוכחית' : 'Current password'}
                  placeholderTextColor={C.muted}
                  secureTextEntry={!showCurrent}
                  value={pwCurrent}
                  onChangeText={t => { setPwCurrent(t); setPwError(''); }}
                  editable={!pwLoading}
                />
                <TouchableOpacity style={[s.eyeBtn, isRTL && s.eyeBtnRTL]} onPress={() => setShowCurrent(v => !v)}>
                  <Ionicons name={showCurrent ? 'eye' : 'eye-off-outline'} size={18} color={C.muted} />
                </TouchableOpacity>
              </View>
              <View style={[s.pwInputWrap, { marginBottom: 10 }]}>
                <TextInput
                  style={[s.modalInput, { minHeight: 48, marginBottom: 0 }, isRTL ? { textAlign: 'right', paddingLeft: 48 } : { paddingRight: 48 }]}
                  placeholder={isRTL ? 'סיסמה חדשה' : 'New password'}
                  placeholderTextColor={C.muted}
                  secureTextEntry={!showNew}
                  value={pwNew}
                  onChangeText={t => { setPwNew(t); setPwError(''); }}
                  editable={!pwLoading}
                />
                <TouchableOpacity style={[s.eyeBtn, isRTL && s.eyeBtnRTL]} onPress={() => setShowNew(v => !v)}>
                  <Ionicons name={showNew ? 'eye' : 'eye-off-outline'} size={18} color={C.muted} />
                </TouchableOpacity>
              </View>
              <View style={s.pwInputWrap}>
                <TextInput
                  style={[s.modalInput, { minHeight: 48, marginBottom: 0 }, isRTL ? { textAlign: 'right', paddingLeft: 48 } : { paddingRight: 48 }]}
                  placeholder={isRTL ? 'אימות סיסמה חדשה' : 'Confirm new password'}
                  placeholderTextColor={C.muted}
                  secureTextEntry={!showConfirm}
                  value={pwConfirm}
                  onChangeText={t => { setPwConfirm(t); setPwError(''); }}
                  editable={!pwLoading}
                />
                <TouchableOpacity style={[s.eyeBtn, isRTL && s.eyeBtnRTL]} onPress={() => setShowConfirm(v => !v)}>
                  <Ionicons name={showConfirm ? 'eye' : 'eye-off-outline'} size={18} color={C.muted} />
                </TouchableOpacity>
              </View>

              {!!pwError && <Text style={s.deleteErrTxt}>{pwError}</Text>}

              <TouchableOpacity
                style={[s.modalSendBtn, (!pwCurrent || !pwNew || !pwConfirm || pwLoading) && { opacity: 0.5 }]}
                onPress={confirmChangePassword}
                disabled={!pwCurrent || !pwNew || !pwConfirm || pwLoading}
                activeOpacity={0.85}
              >
                {pwLoading
                  ? <ActivityIndicator color={C.white} size="small" />
                  : <Text style={s.modalSendTxt}>{isRTL ? 'עדכן סיסמה' : 'Update Password'}</Text>
                }
              </TouchableOpacity>

            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Contact modal ── */}
      <Modal visible={contactVisible} transparent animationType="fade" onRequestClose={() => setContactVisible(false)}>
        <KeyboardAvoidingView
          style={s.modalKAV}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={s.modalOverlay} onPress={() => setContactVisible(false)}>
            <Pressable style={[s.modalCard, isRTL && { direction: 'rtl' }]} onPress={e => e.stopPropagation()}>

              {/* Header */}
              <View style={[s.modalHeader, isRTL && s.rowRTL]}>
                <Text style={s.modalTitle}>{isRTL ? 'צרו קשר' : 'Contact Us'}</Text>
                <TouchableOpacity onPress={() => setContactVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={22} color={C.muted} />
                </TouchableOpacity>
              </View>

              <Text style={[s.modalSub, isRTL && { textAlign: 'right' }]}>
                {isRTL
                  ? `שולח מ: ${user?.email ?? ''}`
                  : `Sending from: ${user?.email ?? ''}`}
              </Text>

              {/* Reason chips */}
              <View style={[s.reasonRow, isRTL && { flexDirection: 'row-reverse' }]}>
                {CONTACT_REASONS.map(r => (
                  <TouchableOpacity
                    key={r.key}
                    style={[s.reasonChip, contactReason === r.key && s.reasonChipActive]}
                    onPress={() => setContactReason(r.key)}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.reasonChipTxt, contactReason === r.key && s.reasonChipTxtActive]}>
                      {r.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Message */}
              <TextInput
                style={[s.modalInput, isRTL && { textAlign: 'right' }]}
                placeholder={isRTL ? 'כתבו את הודעתכם כאן...' : 'Write your message here...'}
                placeholderTextColor={C.muted}
                value={contactMessage}
                onChangeText={setContactMessage}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                maxLength={1000}
              />

              {/* Send */}
              <TouchableOpacity
                style={[s.modalSendBtn, (!contactMessage.trim() || contactSending) && { opacity: 0.5 }]}
                onPress={handleContact}
                disabled={!contactMessage.trim() || contactSending}
                activeOpacity={0.85}
              >
                {contactSending
                  ? <ActivityIndicator color={C.white} size="small" />
                  : <Text style={s.modalSendTxt}>{isRTL ? 'שלחו' : 'Send'}</Text>
                }
              </TouchableOpacity>

            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <View style={s.footer}>
        <Text style={s.footerLogo}>BookLoop</Text>
        <Text style={s.footerSub}>v1.0.0 · {isRTL ? 'שיתוף ספרים, בניית קהילה' : 'Share books, build community'}</Text>
      </View>
    </ScrollView>
    <Toast {...toast} />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { paddingTop: 24, paddingBottom: 48, paddingHorizontal: 16 },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 24,
    paddingHorizontal: 4,
  },

  card: {
    backgroundColor: C.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },

  // Language rows
  langRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  langActive: { backgroundColor: C.primaryLight },
  langLabel: { fontSize: 16, color: C.text },

  // Generic rows
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  rowRTL:    { flexDirection: 'row-reverse' },
  rowBorder: { borderTopWidth: 1, borderTopColor: C.border },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: C.text },
  rowValue: { fontSize: 14, color: C.muted },

  rAlign: { textAlign: 'right' },

  // ── Social ──
  socialCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  socialBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 18,
    gap: 8,
  },
  socialIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  socialLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: C.text,
  },
  socialDivider: {
    width: 1,
    backgroundColor: C.border,
    marginVertical: 14,
  },

  // ── Contact modal ──
  modalKAV: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: C.white,
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: C.text,
  },
  modalSub: {
    fontSize: 12,
    color: C.muted,
    marginBottom: 16,
  },
  reasonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  reasonChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
  },
  reasonChipActive: {
    backgroundColor: C.primaryLight,
    borderColor: C.primary,
  },
  reasonChipTxt: {
    fontSize: 13,
    fontWeight: '500',
    color: C.sub,
  },
  reasonChipTxtActive: {
    color: C.primary,
    fontWeight: '600',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: C.text,
    minHeight: 120,
    backgroundColor: '#fafaf9',
    marginBottom: 16,
  },
  modalSendBtn: {
    backgroundColor: C.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalSendTxt: {
    color: C.white,
    fontSize: 15,
    fontWeight: '600',
  },

  deleteLabel:      { fontSize: 13, color: C.sub, marginBottom: 8 },
  deleteErrTxt:     { fontSize: 13, color: C.red, marginBottom: 10 },
  deleteConfirmBtn: { backgroundColor: C.red, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },

  pwInputWrap: { position: 'relative' },
  eyeBtn: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  eyeBtnRTL: { right: undefined, left: 14 },

  footer: { marginTop: 24, alignItems: 'center' },
  footerLogo: { fontSize: 18, fontWeight: '700', color: C.text, marginBottom: 4 },
  footerSub: { fontSize: 12, color: C.muted },
});
