import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet, Dimensions } from 'react-native';

const { width: SCREEN_W } = Dimensions.get('window');
const GALLERY_H = Math.round(SCREEN_W * 0.72); // matches BookDetail gallery height
const H_PAD  = 16;
const COL_GAP = 10;
const CATALOG_CARD_W = (SCREEN_W - H_PAD * 2 - COL_GAP) / 2;
const HOME_CARD_W = 156;

// ── Shared pulse hook ──────────────────────────────────────────────────────

function usePulse() {
  const opacity = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 650, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);
  return opacity;
}

// ── Base box ───────────────────────────────────────────────────────────────

function Box({ style }: { style: any }) {
  const opacity = usePulse();
  return <Animated.View style={[s.box, style, { opacity }]} />;
}

// ── Home skeleton card ─────────────────────────────────────────────────────

function HomeSkeletonCard() {
  return (
    <View style={s.homeCard}>
      <Box style={s.homeImg} />
      <View style={s.homeBody}>
        <Box style={s.lineLong} />
        <Box style={[s.lineShort, { marginTop: 5 }]} />
        <Box style={[s.lineMid, { marginTop: 8 }]} />
        <View style={[s.row, { marginTop: 8 }]}>
          <Box style={s.lineTiny} />
          <Box style={s.lineTiny} />
        </View>
      </View>
    </View>
  );
}

// ── Home section skeleton ──────────────────────────────────────────────────

function HomeSectionSkeleton() {
  return (
    <View style={s.section}>
      {/* Section header */}
      <View style={[s.row, s.secHead]}>
        <View style={[s.row, { gap: 10 }]}>
          <Box style={s.accentBar} />
          <View style={{ gap: 5 }}>
            <Box style={s.lineMid} />
            <Box style={s.lineShort} />
          </View>
        </View>
        <Box style={s.lineTiny} />
      </View>
      {/* Cards row */}
      <View style={[s.row, { paddingHorizontal: 20, gap: 12 }]}>
        {[0, 1, 2].map(i => <HomeSkeletonCard key={i} />)}
      </View>
    </View>
  );
}

export function HomeSkeletons() {
  return (
    <>
      <HomeSectionSkeleton />
      <HomeSectionSkeleton />
    </>
  );
}

// ── Catalog skeleton card ──────────────────────────────────────────────────

function CatalogSkeletonCard() {
  return (
    <View style={s.catalogCard}>
      <Box style={s.catalogImg} />
      <View style={s.catalogBody}>
        <Box style={s.lineLong} />
        <Box style={[s.lineShort, { marginTop: 5 }]} />
        <Box style={[s.lineMid, { marginTop: 7 }]} />
        <View style={[s.row, { marginTop: 8, justifyContent: 'space-between' }]}>
          <Box style={s.lineTiny} />
          <Box style={s.lineTiny} />
        </View>
      </View>
    </View>
  );
}

export function CatalogSkeletons() {
  const pairs = [0, 1, 2, 4];
  return (
    <View style={s.catalogGrid}>
      {pairs.map(i => (
        <View key={i} style={s.catalogRow}>
          <CatalogSkeletonCard />
          <CatalogSkeletonCard />
        </View>
      ))}
    </View>
  );
}

// ── Messages skeleton ──────────────────────────────────────────────────────

function MessageSkeletonRow() {
  return (
    <View style={s.msgRow}>
      <Box style={s.msgAvatar} />
      <View style={s.msgBody}>
        <View style={[s.row, { justifyContent: 'space-between', marginBottom: 6 }]}>
          <Box style={s.lineMid} />
          <Box style={s.lineTiny} />
        </View>
        <Box style={s.lineLong} />
      </View>
    </View>
  );
}

export function MessagesSkeletons() {
  return (
    <View>
      {[0, 1, 2, 3, 4].map(i => (
        <View key={i}>
          <MessageSkeletonRow />
          {i < 4 && <View style={s.msgDivider} />}
        </View>
      ))}
    </View>
  );
}

// ── Wishlist skeleton ──────────────────────────────────────────────────────

function WishlistSkeletonCard() {
  const w = (SCREEN_W - H_PAD * 2 - 12) / 2;
  return (
    <View style={[s.catalogCard, { width: w }]}>
      <Box style={[s.catalogImg, { aspectRatio: 3 / 4 }]} />
      <View style={s.catalogBody}>
        <Box style={s.lineLong} />
        <Box style={[s.lineShort, { marginTop: 5 }]} />
        <View style={[s.row, { marginTop: 8, justifyContent: 'space-between' }]}>
          <Box style={s.lineTiny} />
          <Box style={s.lineTiny} />
        </View>
      </View>
    </View>
  );
}

export function WishlistSkeletons() {
  return (
    <View style={s.catalogGrid}>
      {[0, 1, 2].map(i => (
        <View key={i} style={s.catalogRow}>
          <WishlistSkeletonCard />
          <WishlistSkeletonCard />
        </View>
      ))}
    </View>
  );
}

// ── SellerProfile skeleton ──────────────────────────────────────────────────

export function SellerProfileSkeleton() {
  return (
    <View style={s.spWrap}>
      {/* Profile card */}
      <View style={s.spCard}>
        <Box style={s.spAvatar} />
        <Box style={[s.lineMid, { marginTop: 14, alignSelf: 'center' }]} />
        <Box style={[s.lineShort, { marginTop: 6, alignSelf: 'center' }]} />
        <View style={[s.row, { gap: 0, marginTop: 16, alignSelf: 'stretch', borderWidth: 1, borderColor: '#e7e5e4', borderRadius: 12 }]}>
          <View style={{ flex: 1, alignItems: 'center', paddingVertical: 12, gap: 4 }}>
            <Box style={s.lineShort} />
            <Box style={s.lineTiny} />
          </View>
          <View style={{ width: 1, backgroundColor: '#e7e5e4' }} />
          <View style={{ flex: 1, alignItems: 'center', paddingVertical: 12, gap: 4 }}>
            <Box style={s.lineShort} />
            <Box style={s.lineTiny} />
          </View>
        </View>
        <Box style={s.spBtn} />
      </View>
      {/* Book grid */}
      <View style={s.catalogGrid}>
        {[0, 1].map(i => (
          <View key={i} style={s.catalogRow}>
            <CatalogSkeletonCard />
            <CatalogSkeletonCard />
          </View>
        ))}
      </View>
    </View>
  );
}

// ── MyBooks skeleton ───────────────────────────────────────────────────────

function MyBooksSkeletonRow() {
  return (
    <View style={s.mbCard}>
      <Box style={s.mbCover} />
      <View style={s.mbInfo}>
        <Box style={s.lineLong} />
        <Box style={[s.lineShort, { marginTop: 6 }]} />
        <View style={[s.row, { marginTop: 10, gap: 8 }]}>
          <Box style={s.lineTiny} />
          <Box style={[s.lineTiny, { width: 60 }]} />
        </View>
      </View>
      <View style={{ paddingRight: 10, gap: 6 }}>
        {[0, 1, 2].map(i => <Box key={i} style={s.mbAction} />)}
      </View>
    </View>
  );
}

export function MyBooksSkeletons() {
  return (
    <View style={{ padding: 16, gap: 10 }}>
      {[0, 1, 2, 3, 4].map(i => <MyBooksSkeletonRow key={i} />)}
    </View>
  );
}

// ── BookDetail skeleton ────────────────────────────────────────────────────

export function BookDetailSkeleton() {
  return (
    <View style={s.bdWrap}>
      {/* Image gallery placeholder */}
      <Box style={s.bdGallery} />

      <View style={s.bdBody}>
        {/* Listing type badge + condition */}
        <View style={[s.row, { gap: 8 }]}>
          <Box style={s.bdBadge} />
          <Box style={s.bdBadge} />
        </View>

        {/* Title */}
        <Box style={[s.lineLong, s.bdTitle]} />
        {/* Author */}
        <Box style={[s.lineMid, { marginTop: 8 }]} />

        {/* Description lines */}
        <View style={{ marginTop: 20, gap: 7 }}>
          <Box style={{ height: 12, width: '100%', borderRadius: 6 }} />
          <Box style={{ height: 12, width: '92%', borderRadius: 6 }} />
          <Box style={{ height: 12, width: '78%', borderRadius: 6 }} />
        </View>

        {/* Seller card */}
        <View style={s.bdSellerCard}>
          <Box style={s.bdAvatar} />
          <View style={{ flex: 1, gap: 6 }}>
            <Box style={[s.lineMid, { width: '60%' }]} />
            <Box style={[s.lineShort, { width: '40%' }]} />
          </View>
        </View>
      </View>
    </View>
  );
}

// ── Chat skeleton (for ChatScreen) ─────────────────────────────────────────

function ChatBubble({ align, width, height }: { align: 'left' | 'right'; width: number; height: number }) {
  return (
    <Box style={{
      height,
      width,
      borderRadius: 18,
      alignSelf: align === 'right' ? 'flex-end' : 'flex-start',
    }} />
  );
}

export function ChatSkeletons() {
  return (
    <View style={{ flex: 1, padding: 16, gap: 8, justifyContent: 'flex-end' }}>
      <ChatBubble align="left"  width={180} height={38} />
      <ChatBubble align="left"  width={140} height={38} />
      <ChatBubble align="right" width={200} height={38} />
      <ChatBubble align="right" width={120} height={38} />
      <ChatBubble align="left"  width={220} height={60} />
      <ChatBubble align="right" width={160} height={38} />
      <ChatBubble align="left"  width={100} height={38} />
    </View>
  );
}

// ── Stat skeleton (for ProfileScreen counts) ───────────────────────────────

export function StatSkeleton() {
  const opacity = usePulse();
  return (
    <Animated.View
      style={[s.box, { height: 22, width: 38, borderRadius: 6, opacity }]}
    />
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  box: { backgroundColor: '#e7e5e4', borderRadius: 6 },

  row:    { flexDirection: 'row', alignItems: 'center' },
  section:{ marginTop: 28 },

  // Lines
  lineLong:  { height: 13, width: '85%' },
  lineMid:   { height: 11, width: '55%' },
  lineShort: { height: 10, width: '45%' },
  lineTiny:  { height: 10, width: 44 },

  // Section header
  secHead: { justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 14 },
  accentBar: { width: 4, height: 34, borderRadius: 2 },

  // Home card
  homeCard: {
    width: HOME_CARD_W,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e7e5e4',
  },
  homeImg:  { width: '100%', aspectRatio: 3 / 4 },
  homeBody: { padding: 10, gap: 0 },

  // Catalog
  catalogGrid: { padding: H_PAD, paddingBottom: 40 },
  catalogRow:  { flexDirection: 'row', gap: COL_GAP, marginBottom: COL_GAP },
  catalogCard: {
    width: CATALOG_CARD_W,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e7e5e4',
  },
  catalogImg:  { width: '100%', aspectRatio: 2 / 3 },
  catalogBody: { padding: 10, gap: 0 },

  // Messages
  msgRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#ffffff' },
  msgAvatar:  { width: 48, height: 48, borderRadius: 24, flexShrink: 0 },
  msgBody:    { flex: 1 },
  msgDivider: { height: 1, backgroundColor: '#e7e5e4', marginLeft: 76 },

  // MyBooks
  mbCard:   { flexDirection: 'row', backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1, borderColor: '#e7e5e4', overflow: 'hidden', alignItems: 'center' },
  mbCover:  { width: 84, height: 112 },
  mbInfo:   { flex: 1, paddingHorizontal: 12, paddingVertical: 10 },
  mbAction: { width: 36, height: 36, borderRadius: 10 },

  // BookDetail
  bdWrap:       { flex: 1, backgroundColor: '#fafaf9' },
  bdGallery:    { width: SCREEN_W, height: GALLERY_H, borderRadius: 0 },
  bdBody:       { padding: 20, gap: 0 },
  bdBadge:      { height: 26, width: 72, borderRadius: 20 },
  bdTitle:      { height: 20, marginTop: 16, borderRadius: 6 },
  bdSellerCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#ffffff', borderRadius: 16,
    borderWidth: 1, borderColor: '#e7e5e4',
    padding: 14, marginTop: 24,
  },
  bdAvatar: { width: 44, height: 44, borderRadius: 22, flexShrink: 0 },

  // SellerProfile
  spWrap:   { flex: 1 },
  spCard:   {
    backgroundColor: '#ffffff', marginHorizontal: 16, marginTop: 16,
    borderRadius: 20, borderWidth: 1, borderColor: '#e7e5e4',
    padding: 24, alignItems: 'center', marginBottom: 24,
  },
  spAvatar: { width: 84, height: 84, borderRadius: 42 },
  spBtn:    { height: 44, borderRadius: 12, alignSelf: 'stretch', marginTop: 16 },
});
