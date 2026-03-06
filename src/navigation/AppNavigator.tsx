import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
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
import { getChatReadAt, registerUnreadRefresh } from '../lib/chatRead';
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
      // Step 1: get all chats for this user (include last_message_at as fallback baseline)
      const { data: myChats } = await supabase
        .from('chats')
        .select('id, last_message_at')
        .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);

      if (!myChats?.length) {
        setCount(0);
        useDataStore.getState().setUnreadCounts({});
        return;
      }

      // Step 2: for each chat, count messages from others newer than last read.
      // Use last_message_at as the fallback so a fresh install doesn't mark all
      // historical messages as unread (only messages after first local open count).
      const chatCounts = await Promise.all(
        myChats.map(async ({ id: chatId, last_message_at }) => {
          const readAt = await getChatReadAt(chatId, last_message_at ?? undefined);
          const { count: n } = await supabase
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('chat_id', chatId)
            .neq('sender_id', userId)
            .gt('created_at', readAt);
          return n ?? 0;
        })
      );

      // Save per-chat counts to dataStore so MessagesScreen can show badges
      const perChatCounts: Record<string, number> = {};
      myChats.forEach(({ id }, i) => { perChatCounts[id] = chatCounts[i]; });
      useDataStore.getState().setUnreadCounts(perChatCounts);

      setCount(chatCounts.reduce((a, b) => a + b, 0));
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
  const dotAnim = useRef(new Animated.Value(state.index)).current;

  // Slide dot to the new active tab on change
  useEffect(() => {
    Animated.spring(dotAnim, {
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

  const TAB_COUNT = state.routes.length;
  const tabWidth  = barWidth / TAB_COUNT;

  // Map logical index → visual X center, accounting for RTL tab reversal
  const dotTranslateX = barWidth > 0 ? dotAnim.interpolate({
    inputRange:  state.routes.map((_, i) => i),
    outputRange: state.routes.map((_, i) => {
      const visIdx = isRTL ? (TAB_COUNT - 1 - i) : i;
      return visIdx * tabWidth + tabWidth / 2 - 2; // center the 4px dot
    }),
  }) : dotAnim;

  const showSlidingDot = state.routes[state.index]?.name !== 'Publish';

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
      {/* Sliding dot — single Animated.View that glides between tabs */}
      {barWidth > 0 && showSlidingDot && (
        <Animated.View
          style={[tb.slidingDot, { bottom: insets.bottom + 2, transform: [{ translateX: dotTranslateX }] }]}
        />
      )}

      {display.map(({ key, color, focused, isPublish, options, onPress, name }) => {
        const label = typeof options.tabBarLabel === 'string'
          ? options.tabBarLabel
          : typeof options.title === 'string' ? options.title : key;

        if (isPublish) {
          return (
            <TouchableOpacity key={key} style={tb.tab} onPress={onPress} activeOpacity={0.7}>
              <View style={tb.iconWrap}>
                <Ionicons name="add-circle" size={30} color={TAB_EMERALD} />
              </View>
              <Text style={[tb.label, { color: TAB_EMERALD }]}>{label}</Text>
            </TouchableOpacity>
          );
        }

        const showBadge = name === 'Messages' && unreadCount > 0;

        return (
          <TouchableOpacity key={key} style={tb.tab} onPress={onPress} activeOpacity={0.7}>
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
  tab:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  iconWrap: { alignItems: 'center' },
  label:    { fontSize: 10, fontWeight: '600' },
  slidingDot: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: TAB_BLUE,
    left: 0,
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

  return (
    <View style={{ flex: 1 }}>
      <AppHeader />
      <Tab.Navigator
        key={language}
        tabBar={props => <AppTabBar {...props} />}
        screenOptions={{ headerShown: false }}
      >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: i18n.t('nav.home'),
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Catalog"
        component={CatalogScreen}
        options={{
          tabBarLabel: i18n.t('nav.catalog'),
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={focused ? 'search' : 'search-outline'} size={size} color={color} />
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
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: i18n.t('nav.profile'),
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={size} color={color} />
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
      if (v === 'true') { setSetupDone(true); return; }
      // If profile is loaded and already has genres, skip setup
      if (profile && profile.favorite_genres && profile.favorite_genres.length > 0) {
        AsyncStorage.setItem(SETUP_DONE_KEY, 'true');
        setSetupDone(true);
        return;
      }
      // Profile not loaded yet or no genres → show setup if profile is loaded
      if (profile !== null) setSetupDone(false);
      // If profile is still null, wait for it (effect re-runs when profile loads)
    });
  }, [user?.id, profile?.favorite_genres?.length]);

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

  // ── Location permission ──────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        setPermission(status === 'granted' ? 'granted' : 'denied');
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
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
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainTabs"      component={MainTabs} />
        <Stack.Screen name="BookDetail"    component={BookDetailScreen}    options={{ headerShown: true, title: i18n.t('book.description') }} />
        <Stack.Screen name="SellerProfile" component={SellerProfileScreen} options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="Settings"      component={SettingsScreen}      options={{ headerShown: true, title: i18n.t('settings.title') }} />
        <Stack.Screen name="MyBooks"       component={MyBooksScreen}       options={{ headerShown: true, title: i18n.t('myBooks.title') }} />
        <Stack.Screen name="Chat"          component={ChatScreen}          options={{ headerShown: true }} />
        <Stack.Screen name="EditProfile"   component={EditProfileScreen}   options={{ headerShown: true, title: i18n.t('settings.editProfile') }} />
        <Stack.Screen name="Wishlist"      component={WishlistScreen}      options={{ headerShown: true, title: i18n.t('wishlist.title') }} />
        <Stack.Screen name="EditBook"      component={EditBookScreen}      options={{ headerShown: true, title: i18n.t('myBooks.edit') || 'Edit Book' }} />
        <Stack.Screen name="BlockedUsers"  component={BlockedUsersScreen}  options={{ headerShown: true, title: '' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
