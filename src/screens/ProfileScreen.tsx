import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  Alert,
  RefreshControl,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';
import { supabase } from '../lib/supabase';
import i18n from '../lib/i18n';
import { StatSkeleton } from '../components/Skeleton';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const C = {
  bg:           '#fafaf9',
  white:        '#ffffff',
  border:       '#e7e5e4',
  text:         '#1c1917',
  sub:          '#78716c',
  muted:        '#a8a29e',
  primary:      '#2563eb',
  primaryLight: '#eff6ff',
  emerald:      '#059669',
  emeraldLight: '#d1fae5',
  amber:        '#d97706',
  pink:         '#db2777',
  red:          '#ef4444',
  redLight:     '#fee2e2',
};

export default function ProfileScreen() {
  const navigation = useNavigation<Nav>();
  const { user, profile, signOut } = useAuthStore();
  const { isRTL } = useLanguageStore();
  const insets = useSafeAreaInsets();

  const [listingCount, setListingCount]   = useState<number | null>(null);
  const [wishlistCount, setWishlistCount] = useState<number | null>(null);
  const [refreshing, setRefreshing]       = useState(false);

  const chevron = isRTL ? 'chevron-back' : 'chevron-forward';

  const fetchCounts = useCallback(async () => {
    if (!user) return;
    const [listings, favorites] = await Promise.all([
      supabase
        .from('books')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'active'),
      supabase
        .from('favorites')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id),
    ]);
    setListingCount(listings.count ?? 0);
    setWishlistCount(favorites.count ?? 0);
  }, [user]);

  useEffect(() => { fetchCounts(); }, [fetchCounts]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchCounts();
    setRefreshing(false);
  }, [fetchCounts]);

  const doSignOut = () => {
    signOut();
    supabase.auth.signOut().catch(() => {});
  };

  const handleSignOut = () => {
    if (Platform.OS === 'web') {
      doSignOut();
      return;
    }
    Alert.alert(i18n.t('common.signOut'), i18n.t('profile.signOutConfirm'), [
      { text: i18n.t('common.cancel'), style: 'cancel' },
      { text: i18n.t('common.signOut'), style: 'destructive', onPress: doSignOut },
    ]);
  };

  if (!user) return null;

  const initial = profile?.name?.charAt(0).toUpperCase() || 'U';
  const memberSince = profile?.created_at ? new Date(profile.created_at).getFullYear() : null;

  return (
    <ScrollView
      style={s.container}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={s.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
    >
      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>

        {/* Edit button — top corner */}
        <TouchableOpacity
          style={[s.editBtn, isRTL ? { left: 16 } : { right: 16 }]}
          onPress={() => navigation.navigate('EditProfile')}
          activeOpacity={0.8}
        >
          <Ionicons name="pencil-outline" size={15} color={C.sub} />
          <Text style={s.editBtnTxt}>{isRTL ? 'עריכה' : 'Edit'}</Text>
        </TouchableOpacity>

        {/* Avatar + Info row */}
        <View style={[s.userRow, isRTL && { flexDirection: 'row-reverse' }]}>

          {/* Avatar */}
          <TouchableOpacity
            style={s.avatarWrap}
            onPress={() => navigation.navigate('EditProfile')}
            activeOpacity={0.9}
          >
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={s.avatar} />
            ) : (
              <View style={[s.avatar, s.avatarFallback]}>
                <Text style={s.avatarInitial}>{initial}</Text>
              </View>
            )}
            <View style={s.cameraBadge}>
              <Ionicons name="camera" size={11} color={C.white} />
            </View>
          </TouchableOpacity>

          {/* Info */}
          <View style={[s.userInfo, isRTL && s.userInfoRTL]}>
            <Text style={[s.name, isRTL && { textAlign: 'right' }]} numberOfLines={1}>
              {profile?.name || 'User'}
            </Text>
            <Text style={[s.email, isRTL && { textAlign: 'right' }]} numberOfLines={1}>
              {user.email}
            </Text>
            {profile?.city && (
              <View style={[s.cityRow, isRTL && { flexDirection: 'row-reverse' }]}>
                <Ionicons name="location-outline" size={12} color={C.muted} />
                <Text style={s.cityText}>{profile.city}</Text>
              </View>
            )}
            {profile?.bio ? (
              <Text
                style={[s.bio, isRTL && { textAlign: 'right' }]}
                numberOfLines={2}
              >
                {profile.bio}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      {/* ── Stats ── */}
      <View style={s.statsCard}>
        <TouchableOpacity style={s.statItem} onPress={() => navigation.navigate('MyBooks')} activeOpacity={0.7}>
          {listingCount === null ? <StatSkeleton /> : <Text style={s.statNum}>{listingCount}</Text>}
          <Text style={s.statLabel}>{isRTL ? 'מודעות' : 'Listings'}</Text>
        </TouchableOpacity>

        <View style={s.statDivider} />

        <TouchableOpacity style={s.statItem} onPress={() => navigation.navigate('Wishlist')} activeOpacity={0.7}>
          {wishlistCount === null ? <StatSkeleton /> : <Text style={s.statNum}>{wishlistCount}</Text>}
          <Text style={s.statLabel}>{isRTL ? 'מועדפים' : 'Favorites'}</Text>
        </TouchableOpacity>

        {memberSince && (
          <>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={s.statNum}>{memberSince}</Text>
              <Text style={s.statLabel}>{isRTL ? 'חבר מאז' : 'Since'}</Text>
            </View>
          </>
        )}
      </View>

      {/* ── Menu list ── */}
      <View style={s.menuCard}>
        <MenuItem
          icon="library-outline"
          iconBg={C.primaryLight}
          iconColor={C.primary}
          label={i18n.t('profile.myBooks')}
          count={listingCount}
          chevron={chevron}
          isRTL={isRTL}
          onPress={() => navigation.navigate('MyBooks')}
          last={false}
        />
        <MenuItem
          icon="heart-outline"
          iconBg="#fce7f3"
          iconColor={C.pink}
          label={i18n.t('profile.favorites')}
          count={wishlistCount}
          chevron={chevron}
          isRTL={isRTL}
          onPress={() => navigation.navigate('Wishlist')}
          last={false}
        />
        <MenuItem
          icon="settings-outline"
          iconBg="#f5f5f4"
          iconColor={C.sub}
          label={i18n.t('profile.settings')}
          chevron={chevron}
          isRTL={isRTL}
          onPress={() => navigation.navigate('Settings')}
          last={true}
        />
      </View>

      {/* ── Sign out ── */}
      <View style={s.signOutSection}>
        <TouchableOpacity
          style={[s.signOutRow, isRTL && { flexDirection: 'row-reverse' }]}
          onPress={handleSignOut}
          activeOpacity={0.7}
        >
          <View style={s.signOutIconWrap}>
            <Ionicons
              name="log-out-outline"
              size={18}
              color={C.red}
              style={isRTL && { transform: [{ rotate: '180deg' }] }}
            />
          </View>
          <Text style={s.signOutTxt}>{i18n.t('common.signOut')}</Text>
        </TouchableOpacity>
      </View>

      <View style={s.footer}>
        <Text style={s.footerText}>{i18n.t('profile.version')}</Text>
      </View>
    </ScrollView>
  );
}

// ── Menu item row ────────────────────────────────────────────────────────────

function MenuItem({
  icon, iconBg, iconColor, label, count, chevron, isRTL, onPress, last,
}: {
  icon: string;
  iconBg: string;
  iconColor: string;
  label: string;
  count?: number | null;
  chevron: string;
  isRTL: boolean;
  onPress: () => void;
  last: boolean;
}) {
  return (
    <TouchableOpacity
      style={[s.menuRow, isRTL && s.menuRowRTL, !last && s.menuRowBorder]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[s.menuIconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={icon as any} size={20} color={iconColor} />
      </View>
      <Text style={s.menuLabel}>{label}</Text>
      {count !== null && count !== undefined && (
        <Text style={s.menuCount}>{count}</Text>
      )}
      <Ionicons name={chevron as any} size={16} color={C.muted} />
    </TouchableOpacity>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:     { flex: 1, backgroundColor: C.bg },
  scrollContent: { paddingBottom: 40 },

  // ── Header ──
  header: {
    backgroundColor: C.white,
    paddingHorizontal: 20,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  editBtn: {
    position: 'absolute',
    top: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
  },
  editBtnTxt: { fontSize: 12, color: C.sub, fontWeight: '500' },

  // User row
  userRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    marginTop: 52,
  },

  // Avatar
  avatarWrap:    { position: 'relative' },
  avatar:        { width: 80, height: 80, borderRadius: 20 },
  avatarFallback:{
    backgroundColor: C.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: { fontSize: 30, fontWeight: '700', color: C.white },
  cameraBadge: {
    position: 'absolute',
    bottom: -4, right: -4,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: C.primary,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: C.white,
  },

  // Info
  userInfo:    { flex: 1, paddingTop: 2 },
  userInfoRTL: { alignItems: 'flex-end' },
  name:        { fontSize: 20, fontWeight: '700', color: C.text, marginBottom: 2 },
  email:       { fontSize: 13, color: C.sub, marginBottom: 6 },
  cityRow:     { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 6 },
  cityText:    { fontSize: 13, color: C.muted },
  bio:         { fontSize: 13, color: C.sub, lineHeight: 19 },

  // ── Stats ──
  statsCard: {
    flexDirection: 'row',
    backgroundColor: C.white,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  statItem:    { flex: 1, alignItems: 'center', paddingVertical: 16 },
  statNum:     { fontSize: 22, fontWeight: '700', color: C.text },
  statLabel:   { fontSize: 12, color: C.muted, marginTop: 2 },
  statDivider: { width: 1, backgroundColor: C.border, marginVertical: 10 },

  // ── Menu ──
  menuCard: {
    backgroundColor: C.white,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
    backgroundColor: C.white,
  },
  menuRowRTL:    { flexDirection: 'row-reverse' },
  menuRowBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  menuIconWrap:  { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  menuLabel:     { flex: 1, fontSize: 15, fontWeight: '500', color: C.text },
  menuCount:     { fontSize: 14, color: C.muted, marginRight: 2 },

  // ── Sign out ──
  signOutSection: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: C.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  signOutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  signOutIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: C.redLight,
    justifyContent: 'center', alignItems: 'center',
  },
  signOutTxt: { fontSize: 15, fontWeight: '500', color: C.red },

  footer:     { padding: 28, alignItems: 'center' },
  footerText: { fontSize: 12, color: C.muted },
});
