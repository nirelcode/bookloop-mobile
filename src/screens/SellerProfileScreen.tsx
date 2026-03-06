import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ScrollView,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { Book, Profile } from '../types';
import { useLanguageStore } from '../stores/languageStore';
import { useAuthStore } from '../stores/authStore';
import { SellerProfileSkeleton } from '../components/Skeleton';

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
  emeraldLight: '#d1fae5',
  amber: '#d97706',
  amberLight: '#fef3c7',
};

function BookCard({ item, onPress }: { item: Book; onPress: () => void }) {
  let priceLabel = '';
  let priceColor = C.primary;
  if (item.listing_type === 'sale' && item.price) {
    priceLabel = `₪${item.price}`;
    priceColor = C.primary;
  } else if (item.listing_type === 'free') {
    priceLabel = 'Free';
    priceColor = C.emerald;
  } else if (item.listing_type === 'trade') {
    priceLabel = 'Trade';
    priceColor = C.amber;
  }

  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.82}>
      <Image
        source={{ uri: item.images?.[0] ?? `https://picsum.photos/seed/${item.id}/300/400` }}
        style={s.cardImg}
        resizeMode="cover"
      />
      <View style={s.cardBody}>
        <Text style={s.cardTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={s.cardAuthor} numberOfLines={1}>{item.author}</Text>
        <View style={s.cardFooter}>
          <View style={s.cityRow}>
            <Ionicons name="location-outline" size={10} color={C.muted} />
            <Text style={s.cardCity} numberOfLines={1}>{item.city}</Text>
          </View>
          {priceLabel ? <Text style={[s.priceTxt, { color: priceColor }]}>{priceLabel}</Text> : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function SellerProfileScreen() {
  const route     = useRoute();
  const navigation = useNavigation<any>();
  const { isRTL } = useLanguageStore();
  const { user }  = useAuthStore();

  const { sellerId, sellerName } = route.params as { sellerId: string; sellerName?: string };

  const [profile, setProfile] = useState<Profile | null>(null);
  const [books, setBooks]     = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchProfile(), fetchBooks()]).finally(() => setLoading(false));
  }, [sellerId]);

  const fetchProfile = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', sellerId)
      .single();
    if (data) setProfile(data);
  };

  const fetchBooks = async () => {
    const { data } = await supabase
      .from('books')
      .select('id,title,author,city,images,listing_type,price,condition,created_at')
      .eq('user_id', sellerId)
      .eq('status', 'active')
      .order('created_at', { ascending: false });
    setBooks((data as Book[]) || []);
  };

  const handleContact = useCallback(() => {
    if (!user) { supabase.auth.signOut(); return; }
    navigation.navigate('Chat', {
      recipientId: sellerId,
      recipientName: profile?.name ?? sellerName ?? '',
    });
  }, [user, sellerId, profile, sellerName]);

  const goToBook = (id: string) => navigation.navigate('BookDetail', { bookId: id });

  const isOwnProfile = user?.id === sellerId;

  const renderBook = useCallback(({ item }: { item: Book }) => (
    <BookCard item={item} onPress={() => goToBook(item.id)} />
  ), []);

  if (loading) {
    return <SellerProfileSkeleton />;
  }

  const displayName = profile?.name ?? sellerName ?? 'Seller';
  const initial = displayName.charAt(0).toUpperCase();
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).getFullYear()
    : null;

  return (
    <View style={s.container}>
      <FlatList
        data={books}
        keyExtractor={b => b.id}
        renderItem={renderBook}
        numColumns={2}
        columnWrapperStyle={s.row}
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            {/* ── Profile card ── */}
            <View style={s.profileCard}>
              <View style={s.avatarWrap}>
                {profile?.avatar_url
                  ? <Image source={{ uri: profile.avatar_url }} style={s.avatar} />
                  : (
                    <View style={s.avatarFallback}>
                      <Text style={s.avatarInitial}>{initial}</Text>
                    </View>
                  )
                }
              </View>

              <Text style={s.name}>{displayName}</Text>

              {profile?.city && (
                <View style={s.cityBadge}>
                  <Ionicons name="location-outline" size={13} color={C.muted} />
                  <Text style={s.cityTxt}>{profile.city}</Text>
                </View>
              )}

              {profile?.bio && (
                <Text style={s.bio}>{profile.bio}</Text>
              )}

              {/* ── Stats ── */}
              <View style={s.statsRow}>
                <View style={s.statBox}>
                  <Text style={s.statNum}>{books.length}</Text>
                  <Text style={s.statLabel}>{isRTL ? 'ספרים' : 'Books'}</Text>
                </View>
                {memberSince && (
                  <View style={[s.statBox, s.statBorder]}>
                    <Text style={s.statNum}>{memberSince}</Text>
                    <Text style={s.statLabel}>{isRTL ? 'חבר מאז' : 'Member since'}</Text>
                  </View>
                )}
              </View>

              {/* ── Contact button (hide on own profile) ── */}
              {!isOwnProfile && (
                <TouchableOpacity style={s.contactBtn} onPress={handleContact} activeOpacity={0.85}>
                  <Ionicons name="chatbubble-outline" size={17} color={C.white} />
                  <Text style={s.contactTxt}>{isRTL ? 'שלח הודעה' : 'Send Message'}</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* ── Section header ── */}
            <View style={s.secHead}>
              <View style={[s.accentBar, { backgroundColor: C.primary }]} />
              <Text style={s.secTitle}>
                {isRTL ? `ספרים של ${displayName}` : `${displayName}'s Books`}
              </Text>
            </View>

            {books.length === 0 && (
              <View style={s.empty}>
                <View style={s.emptyIconWrap}>
                  <Ionicons name="library-outline" size={36} color={C.muted} />
                </View>
                <Text style={s.emptyTxt}>
                  {isRTL ? 'אין ספרים פעילים כרגע' : 'No active listings yet'}
                </Text>
              </View>
            )}
          </View>
        }
      />
    </View>
  );
}

const CARD_W = 168;
const GAP    = 12;

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  // Profile card
  profileCard: {
    backgroundColor: C.white,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarWrap: { marginBottom: 14 },
  avatar: { width: 84, height: 84, borderRadius: 42 },
  avatarFallback: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: C.primaryLight,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarInitial: { fontSize: 34, fontWeight: '700', color: C.primary },

  name:    { fontSize: 22, fontWeight: '700', color: C.text, marginBottom: 6 },
  cityBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 },
  cityTxt: { fontSize: 13, color: C.muted },
  bio:     { fontSize: 14, color: C.sub, textAlign: 'center', lineHeight: 20, marginBottom: 16 },

  statsRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    alignSelf: 'stretch',
  },
  statBox:   { flex: 1, alignItems: 'center', paddingVertical: 12 },
  statBorder:{ borderLeftWidth: 1, borderLeftColor: C.border },
  statNum:   { fontSize: 20, fontWeight: '700', color: C.text },
  statLabel: { fontSize: 11, color: C.muted, marginTop: 2 },

  contactBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.primary, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 28,
    alignSelf: 'stretch', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 4, elevation: 2,
  },
  contactTxt: { color: C.white, fontSize: 15, fontWeight: '600' },

  // Section header
  secHead: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, marginBottom: 14,
  },
  accentBar: { width: 4, height: 22, borderRadius: 2 },
  secTitle:  { fontSize: 16, fontWeight: '700', color: C.text },

  // Empty
  empty:       { alignItems: 'center', paddingVertical: 32 },
  emptyIconWrap: { width: 72, height: 72, borderRadius: 20, backgroundColor: '#f5f5f4', justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  emptyTxt:    { fontSize: 14, color: C.muted },

  // Grid
  listContent: { paddingHorizontal: 16, paddingBottom: 40 },
  row:         { justifyContent: 'space-between', marginBottom: GAP },

  // Card
  card: {
    width: CARD_W, backgroundColor: C.white, borderRadius: 14,
    overflow: 'hidden', borderWidth: 1, borderColor: C.border,
  },
  cardImg:    { width: '100%', aspectRatio: 3 / 4, backgroundColor: C.border },
  cardBody:   { padding: 10 },
  cardTitle:  { fontSize: 13, fontWeight: '600', color: C.text, lineHeight: 17, marginBottom: 2 },
  cardAuthor: { fontSize: 11, color: C.sub, marginBottom: 6 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cityRow:    { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1, marginRight: 4 },
  cardCity:   { fontSize: 11, color: C.muted, flexShrink: 1 },
  priceTxt:   { fontSize: 13, fontWeight: '700', flexShrink: 0 },
});
