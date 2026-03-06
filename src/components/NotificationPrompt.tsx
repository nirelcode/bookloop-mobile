import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useLanguageStore } from '../stores/languageStore';
import {
  registerForPushNotificationsAsync,
  NOTIFICATIONS_PROMPTED_KEY,
} from '../lib/notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';
import i18n from '../lib/i18n';

const C = {
  bg:      '#ffffff',
  overlay: 'rgba(0,0,0,0.45)',
  border:  '#e7e5e4',
  text:    '#1c1917',
  sub:     '#78716c',
  muted:   '#a8a29e',
  primary: '#2563eb',
  primaryLight: '#eff6ff',
};

interface Props {
  userId: string;
  visible: boolean;
  onDismiss: () => void;
  /** Pass 'denied' if OS permission is already denied */
  permissionStatus?: 'granted' | 'denied' | 'undetermined';
}

export default function NotificationPrompt({
  userId,
  visible,
  onDismiss,
  permissionStatus = 'undetermined',
}: Props) {
  const { isRTL } = useLanguageStore();
  const slideAnim = useRef(new Animated.Value(300)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 65,
          friction: 11,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 300,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, fadeAnim, slideAnim]);

  if (!visible) return null;

  const isDenied = permissionStatus === 'denied';

  const handleEnable = async () => {
    await AsyncStorage.setItem(NOTIFICATIONS_PROMPTED_KEY, 'true');

    if (isDenied) {
      // Direct user to system settings
      if (Platform.OS === 'ios') {
        await Linking.openURL('app-settings:');
      } else {
        await Linking.openSettings();
      }
      onDismiss();
      return;
    }

    // Not in Expo Go — request permission
    if (Constants.appOwnership !== 'expo') {
      await registerForPushNotificationsAsync(userId);
    }
    onDismiss();
  };

  const handleLater = async () => {
    await AsyncStorage.setItem(NOTIFICATIONS_PROMPTED_KEY, 'true');
    onDismiss();
  };

  return (
    <Animated.View style={[s.overlay, { opacity: fadeAnim }]}>
      <TouchableOpacity style={s.backdrop} onPress={handleLater} activeOpacity={1} />
      <Animated.View style={[s.sheet, { transform: [{ translateY: slideAnim }] }]}>

        {/* Handle bar */}
        <View style={s.handle} />

        {/* Icon */}
        <View style={s.iconWrap}>
          <Ionicons name="notifications" size={28} color={C.primary} />
        </View>

        {/* Text */}
        <Text style={[s.title, isRTL && s.rAlign]}>
          {isDenied
            ? i18n.t('notifications.permissionRequired')
            : i18n.t('notifications.promptTitle')}
        </Text>
        <Text style={[s.body, isRTL && s.rAlign]}>
          {isDenied
            ? i18n.t('notifications.permissionMessage')
            : i18n.t('notifications.promptBody')}
        </Text>

        {/* Buttons */}
        <TouchableOpacity style={s.enableBtn} onPress={handleEnable} activeOpacity={0.85}>
          <Ionicons name="notifications-outline" size={18} color="#fff" />
          <Text style={s.enableTxt}>
            {isDenied
              ? (isRTL ? 'פתח הגדרות' : 'Open Settings')
              : i18n.t('notifications.enable')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.laterBtn} onPress={handleLater} activeOpacity={0.7}>
          <Text style={s.laterTxt}>{i18n.t('notifications.later')}</Text>
        </TouchableOpacity>

      </Animated.View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 100,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.overlay,
  },
  sheet: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 36,
    paddingTop: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 16,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e7e5e4',
    marginBottom: 20,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: C.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    color: C.sub,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  enableBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.primary,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 14,
    width: '100%',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  enableTxt: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  laterBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  laterTxt: {
    fontSize: 14,
    color: C.muted,
    fontWeight: '500',
  },
  rAlign: { textAlign: 'right' },
});
