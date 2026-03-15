import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
// expo-notifications is loaded lazily below (only in non-Expo-Go builds).
// A static import would trigger PushTokenAutoRegistration.fx.js at module load
// time, which emits a console.error in Expo Go SDK 53+.
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { useLanguageStore } from '../stores/languageStore';
import { useLocationStore } from '../stores/locationStore';
import { supabase } from '../lib/supabase';
import { getChatReadAt, getUserBaselineTime, registerUnreadRefresh } from '../lib/chatRead';
import i18n from '../lib/i18n';
import type { RootStackParamList, MainTabParamList } from '../types/navigation';
import { registerForPushNotificationsAsync } from '../lib/notifications';

// Navigation ref for notification deep-link navigation outside component tree
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

import { AppHeader } from '../components/AppHeader';
import HomeScreen         from '../screens/HomeScreen';
import CatalogScreen      from '../screens/CatalogScreen';
import PublishScreen      from '../screens/PublishScreen';
import MessagesScreen     from '../screens/MessagesScreen';
import ProfileScreen      from '../screens/ProfileScreen';
import BookDetailScreen   from '../screens/BookDetailScreen';
import SettingsScreen     from '../screens/SettingsScreen';
import MyBooksScreen      from '../screens/MyBooksScreen';
import ChatScreen         from '../screens/ChatScreen';
import EditProfileScreen  from '../screens/EditProfileScreen';
import WishlistScreen     from '../screens/WishlistScreen';
import EditBookScreen     from '../screens/EditBookScreen';
import SellerProfileScreen from '../screens/SellerProfileScreen';
import BlockedUsersScreen from '../screens/BlockedUsersScreen';
import SplashOverlay from '../components/SplashOverlay';
import OnboardingScreen, { SLIDES_SEEN_KEY } from '../screens/OnboardingScreen';
import AuthScreen         from '../screens/AuthScreen';
import SetupScreen, { SETUP_DONE_KEY } from '../screens/SetupScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab   = createBottomTabNavigator<MainTabParamList>();

const TAB_BLUE    = '#2563eb';
const TAB_EMERALD = '#059669';
const TAB_MUTED   = '#a8a29e';

// ── Unread message count (per-chat read timestamps) ─────────────────────────
function useUnreadCount(userId: string | undefined) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      // Step 1: get all chats for this user
      const { data: myChats } = await supabase
        .from('chats')
        .select('id')
        .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);

      if (!myChats?.length) {
        setCount(0);
        useDataStore.getState().setUnreadCounts({});
        return;
      }

      // Step 2: read all per-chat timestamps in one AsyncStorage call,
      // then fetch all unread messages since baseline in a single Supabase query.
      const chatIds = myChats.map(c => c.id);
      const baselineTime = await getUserBaselineTime(userId);

      // Batch-read all readAt timestamps at once
      const keys = chatIds.map(id => `bookloop_chat_read_${id}`);
      const pairs = await AsyncStorage.multiGet(keys);
      const readAtMap: Record<string, string> = {};
      pairs.forEach(([key, val]) => {
        const chatId = key.replace('bookloop_chat_read_', '');
        readAtMap[chatId] = val ?? baselineTime;
      });

      // Single query: all messages from others across all chats since baseline
      const { data: unreadMsgs } = await supabase
        .from('messages')
        .select('chat_id, created_at')
        .in('chat_id', chatIds)
        .neq('sender_id', userId)
        .gt('created_at', baselineTime);

      // Count per chat client-side using individual readAt thresholds
      const perChatCounts: Record<string, number> = {};
      chatIds.forEach(id => { perChatCounts[id] = 0; });
      (unreadMsgs ?? []).forEach(({ chat_id, created_at }) => {
        if (created_at > (readAtMap[chat_id] ?? baselineTime)) {
          perChatCounts[chat_id] = (perChatCounts[chat_id] ?? 0) + 1;
        }
      });

      useDataStore.getState().setUnreadCounts(perChatCounts);
      setCount(Object.values(perChatCounts).reduce((a, b) => a + b, 0));
    } catch {}
  }, [userId]);

  // Register refresh so ChatScreen can trigger it after marking a chat read
  useEffect(() => { registerUnreadRefresh(refresh); }, [refresh]);

  // Initial load
  useEffect(() => { refresh(); }, [refresh]);

  // Realtime: re-count when a new message arrives from someone else
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`unread_watch:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload: any) => { if (payload.new?.sender_id !== userId) refresh(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, refresh]);

  return { unreadCount: count, refresh };
}

// ── Custom tab bar ─────────────────────────────────────────────────────────
function AppTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const isRTL  = useLanguageStore(s => s.isRTL);
  const user   = useAuthStore(s => s.user);
  const insets = useSafeAreaInsets();
  const { unreadCount } = useUnreadCount(user?.id);

  const [barWidth, setBarWidth] = useState(0);
  const pillAnim = useRef(new Animated.Value(state.index)).current;

  useEffect(() => {
    Animated.spring(pillAnim, {
      toValue: state.index,
      useNativeDriver: true,
      tension: 70,
      friction: 11,
    }).start();
  }, [state.index]);

  // Respect tabBarStyle: { display: 'none' } from active screen options
  const activeOptions = descriptors[state.routes[state.index].key].options;
  const tabBarStyle   = (activeOptions as any).tabBarStyle;
  if (tabBarStyle?.display === 'none') return null;

  const TAB_COUNT  = state.routes.length;
  const tabWidth   = barWidth / TAB_COUNT;
  const PILL_W     = 68;
  const showPill   = barWidth > 0 && state.routes[state.index]?.name !== 'Publish';

  const pillTranslateX = pillAnim.interpolate({
    inputRange:  state.routes.map((_, i) => i),
    outputRange: state.routes.map((_, i) => {
      const visIdx = isRTL ? (TAB_COUNT - 1 - i) : i;
      return visIdx * tabWidth + tabWidth / 2 - PILL_W / 2;
    }),
  });

  const items = state.routes.map((route, index) => {
    const focused   = state.index === index;
    const options   = descriptors[route.key].options;
    const isPublish = route.name === 'Publish';
    const color = isPublish ? TAB_EMERALD : focused ? TAB_BLUE : TAB_MUTED;

    return {
      key: route.key,
      name: route.name,
      focused,
      color,
      isPublish,
      options,
      onPress() {
        const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
        if (!focused && !event.defaultPrevented) navigation.navigate(route.name as never);
      },
    };
  });

  const display = isRTL ? [...items].reverse() : items;

  return (
    <View
      style={[tb.bar, { paddingBottom: insets.bottom, height: 62 + insets.bottom }]}
      onLayout={e => setBarWidth(e.nativeEvent.layout.width)}
    >
      {showPill && (
        <Animated.View
          style={[tb.slidingPill, { bottom: insets.bottom + 6, transform: [{ translateX: pillTranslateX }] }]}
        />
      )}

      {display.map(({ key, color, focused, isPublish, options, onPress, name }) => {
        const label = typeof options.tabBarLabel === 'string'
          ? options.tabBarLabel
          : typeof options.title === 'string' ? options.title : key;

        if (isPublish) {
          return (
            <TouchableOpacity key={key} style={tb.tab} onPress={onPress} activeOpacity={0.8}>
              <LinearGradient
                colors={['#2563eb', '#7c3aed']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={tb.publishBtn}
              >
                <Ionicons name="add" size={26} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          );
        }

        const showBadge = name === 'Messages' && unreadCount > 0;

        return (
          <TouchableOpacity key={key} style={tb.tab} onPress={onPress} activeOpacity={0.7}>
            <View style={tb.pillWrap}>
              <View style={tb.iconWrap}>
                {options.tabBarIcon?.({ focused, color, size: 23 })}
                {showBadge && (
                  <View style={tb.badge}>
                    <Text style={tb.badgeTxt}>
                      {unreadCount > 9 ? '9+' : String(unreadCount)}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={[tb.label, { color }]}>{label}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const tb = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e7e5e4',
    height: 62,
    paddingTop: 6,
  },
  tab:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pillWrap: { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, gap: 2 },
  slidingPill: {
    position: 'absolute',
    width: 68,
    height: 50,
    borderRadius: 20,
    backgroundColor: '#eff6ff',
    left: 0,
  },
  iconWrap: { alignItems: 'center' },
  label:    { fontSize: 10, fontWeight: '600' },

  publishBtn: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -8,
    shadowColor: '#4f46e5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 6,
  },

  // Unread badge
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  badgeTxt: { color: '#fff', fontSize: 10, fontWeight: '700', lineHeight: 12 },
});

// ── Tab navigator ──────────────────────────────────────────────────────────
function MainTabs() {
  const language = useLanguageStore(s => s.language);
  const [activeTab, setActiveTab] = useState('Home');

  return (
    <View style={{ flex: 1 }}>
      {activeTab !== 'Publish' && <AppHeader />}
      <Tab.Navigator
        key={language}
        tabBar={props => <AppTabBar {...props} />}
        screenOptions={{ headerShown: false }}
        screenListeners={{
          focus: (e) => {
            const name = (e.target as string)?.split('-')[0];
            if (name) setActiveTab(name);
          },
        }}
      >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: i18n.t('nav.home'),
          tabBarIcon: ({ color, size }) => (
            <Feather name="home" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Catalog"
        component={CatalogScreen}
        options={{
          tabBarLabel: i18n.t('nav.catalog'),
          tabBarIcon: ({ color, size }) => (
            <Feather name="search" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Publish"
        component={PublishScreen}
        options={{
          tabBarLabel: i18n.t('nav.publish'),
          tabBarIcon: () => null,
        }}
      />
      <Tab.Screen
        name="Messages"
        component={MessagesScreen}
        options={{
          tabBarLabel: i18n.t('nav.messages'),
          tabBarIcon: ({ color, size }) => (
            <Feather name="message-square" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: i18n.t('nav.profile'),
          tabBarIcon: ({ color, size }) => (
            <Feather name="user" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
    </View>
  );
}

// ── Root navigator ─────────────────────────────────────────────────────────
export function AppNavigator() {
  const { loading, user, profile } = useAuthStore();
  const { setCoords, setPermission } = useLocationStore();
  const { isRTL, language } = useLanguageStore();

  const [slidesSeen, setSlidesSeen] = useState<boolean | null>(null);
  const [setupDone,  setSetupDone]  = useState<boolean | null>(null);
  const [splashDone, setSplashDone] = useState(false);

  // Guarantee at least 1.4 s of splash so the animation is actually visible
  useEffect(() => {
    const t = setTimeout(() => setSplashDone(true), 1400);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(SLIDES_SEEN_KEY).then(v => setSlidesSeen(v === 'true'));
  }, []);

  useEffect(() => {
    if (!user) { setSetupDone(null); return; }
    AsyncStorage.getItem(SETUP_DONE_KEY).then(v => {
      if (v === 'true') {
        // Wait for profile to load before trusting AsyncStorage — if profile is null
        // the city check below can't run and we'd skip setup incorrectly.
        if (profile === null) return;
        // Require city — Google/webapp users may have genres but no city set yet,
        // and a freshly re-registered account will have an empty profile.
        if (!profile.city) { setSetupDone(false); return; }
        setSetupDone(true);
        return;
      }
      // If profile is loaded and already has genres AND city, skip setup
      if (profile && profile.city && profile.favorite_genres && profile.favorite_genres.length > 0) {
        AsyncStorage.setItem(SETUP_DONE_KEY, 'true');
        setSetupDone(true);
        return;
      }
      // Profile not loaded yet or missing city/genres → show setup if profile is loaded
      if (profile !== null) setSetupDone(false);
      // If profile is still null, wait for it (effect re-runs when profile loads)
    });
  }, [user?.id, profile?.city, profile?.favorite_genres?.length]);

  // ── Prefetch key data during splash window ───────────────────────────────
  useEffect(() => {
    if (loading || !user) return;
    const store = useDataStore.getState();
    // Home feed — fetch recent books + free books in parallel so free is never crowded out
    if (store.isHomeStale()) {
      const sel = 'id,title,author,city,images,listing_type,price,condition,genres,created_at,user_id';
      Promise.all([
        supabase.from('books').select(sel).eq('status', 'active')
          .order('created_at', { ascending: false }).limit(300),
        supabase.from('books').select(sel).eq('status', 'active')
          .eq('listing_type', 'free').order('created_at', { ascending: false }).limit(50),
      ]).then(([mainRes, freeRes]) => {
        const main  = (mainRes.data  as any[]) || [];
        const free  = (freeRes.data  as any[]) || [];
        const seen  = new Set(main.map((b: any) => b.id));
        store.setHomeBooks([...main, ...free.filter((b: any) => !seen.has(b.id))]);
      });
    }
    // Blocked IDs — always refresh on login so filters are up to date
    supabase
      .from('blocked_users')
      .select('blocked_id')
      .eq('blocker_id', user.id)
      .then(({ data }) => { if (data) store.setBlockedIds(data.map(r => r.blocked_id)); });
  }, [loading, user?.id]);

  // ── Location: only check existing permission on startup (never prompt) ───
  // Actual permission request is deferred to when the user taps "Near Me".
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        setPermission(status === 'granted' ? 'granted' : 'denied');
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        }
      } catch {}
    })();
  }, []);

  // ── Push notification registration ───────────────────────────────────────
  // Silently registers if the user has already granted permission.
  // If not granted, the NotificationPrompt in MessagesScreen handles asking.
  useEffect(() => {
    if (!user || Constants.appOwnership === 'expo') return;
    registerForPushNotificationsAsync(user.id).catch(() => {});
  }, [user]);

  // ── Notification tap → navigate to Chat ──────────────────────────────────
  useEffect(() => {
    if (Constants.appOwnership === 'expo') return;
    let sub: any;
    (async () => {
      try {
        const Notifications = await import('expo-notifications');
        // Handle taps while app is running or in background
        sub = Notifications.addNotificationResponseReceivedListener(response => {
          const data = response.notification.request.content.data as any;
          if (data?.chatId && navigationRef.isReady()) {
            navigationRef.navigate('Chat', {
              chatId:          data.chatId,
              recipientId:     data.senderId,
              recipientName:   data.senderName || '',
              recipientAvatar: undefined,
            });
          }
        });
      } catch {}
    })();
    return () => { sub?.remove?.(); };
  }, []);

  if (loading || slidesSeen === null || !splashDone) return <SplashOverlay />;

  // 1. Feature slides — once ever
  if (!slidesSeen) {
    return (
      <OnboardingScreen
        onDone={async () => {
          await AsyncStorage.setItem(SLIDES_SEEN_KEY, 'true');
          setSlidesSeen(true);
        }}
      />
    );
  }

  // 2. Auth — mandatory
  if (!user) return <AuthScreen />;

  // 3. Genre setup — once after first login
  if (setupDone === null) return null;
  if (!setupDone) {
    return <SetupScreen onDone={() => setSetupDone(true)} />;
  }

  // 4. Main app
  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        key={language}
        screenOptions={({ navigation: nav }) => ({
          headerShown: false,
          // RTL: remove default left-pointing back button; add right-pointing one on the right
          ...(isRTL ? {
            headerLeft: () => null,
            headerRight: () => (
              <TouchableOpacity onPress={() => nav.goBack()} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
                <Ionicons name="chevron-forward" size={26} color="#1c1917" />
              </TouchableOpacity>
            ),
          } : {}),
        })}
      >
        <Stack.Screen name="MainTabs"      component={MainTabs} />
        <Stack.Screen name="BookDetail"    component={BookDetailScreen}    options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="SellerProfile" component={SellerProfileScreen} options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="Settings"      component={SettingsScreen}      options={{ headerShown: true, title: i18n.t('settings.title') }} />
        <Stack.Screen name="MyBooks"       component={MyBooksScreen}       options={{ headerShown: true, title: i18n.t('myBooks.title') }} />
        <Stack.Screen name="Chat"          component={ChatScreen}          options={{ headerShown: true }} />
        <Stack.Screen name="EditProfile"   component={EditProfileScreen}   options={{ headerShown: true, title: i18n.t('settings.editProfile') }} />
        <Stack.Screen name="Wishlist"      component={WishlistScreen}      options={{ headerShown: true, title: i18n.t('wishlist.title') }} />
        <Stack.Screen name="EditBook"      component={EditBookScreen}      options={{ headerShown: true, title: i18n.t('myBooks.edit') }} />
        <Stack.Screen name="BlockedUsers"  component={BlockedUsersScreen}  options={{ headerShown: true, title: '' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
