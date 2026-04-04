import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguageStore } from '../stores/languageStore';

const C = {
  bg:           '#fafaf9',
  white:        '#ffffff',
  border:       '#e7e5e4',
  text:         '#1c1917',
  sub:          '#78716c',
  muted:        '#a8a29e',
  primary:      '#2563eb',
  emerald:      '#059669',
  amber:        '#d97706',
};

export const SLIDES_SEEN_KEY = 'bookloop_slides_seen';

interface Slide {
  icon:        string;
  iconColor:   string;
  topBg:       string;
  accentColor: string;
  titleEn: string; titleHe: string;
  subEn:   string; subHe:   string;
}

const SLIDES: Slide[] = [
  {
    icon:        'library-outline',
    iconColor:   C.primary,
    topBg:       '#dbeafe',
    accentColor: C.primary,
    titleEn: 'Books, right around the corner',
    titleHe: 'ספרים ממש פה בשכונה',
    subEn: 'Discover listings from readers in your area — filter by genre, price, or listing type.',
    subHe: 'גלו ספרים מקוראים באזור שלכם — סננו לפי ז\'אנר, מחיר או סוג עסקה.',
  },
  {
    icon:        'camera-outline',
    iconColor:   C.emerald,
    topBg:       '#d1fae5',
    accentColor: C.emerald,
    titleEn: 'List a book in seconds',
    titleHe: 'פרסמו ספר תוך שניות',
    subEn: 'Snap the cover — AI fills in the title, author, and genre. Just review and publish.',
    subHe: 'צלמו את העטיפה — הבינה המלאכותית ממלאת כותרת, מחבר וז\'אנר. רק לאשר ולפרסם.',
  },
  {
    icon:        'chatbubbles-outline',
    iconColor:   C.amber,
    topBg:       '#fef3c7',
    accentColor: C.amber,
    titleEn: 'Chat, meet, exchange',
    titleHe: 'שוחחו, פגשו, החליפו',
    subEn: 'Message sellers directly, agree on a price or trade, and arrange a meetup that works for you both.',
    subHe: 'שלחו הודעה למוכרים, הסכימו על מחיר או חילופין, וקבעו מפגש שמתאים לשניכם.',
  },
];

// Proportion of the slide height taken by the colored top panel
const TOP_RATIO = 0.56;

interface Props { onDone: () => void; }

export default function OnboardingScreen({ onDone }: Props) {
  const { isRTL } = useLanguageStore();
  const insets    = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();

  const slides     = isRTL ? [...SLIDES].reverse() : SLIDES;
  const startIndex = isRTL ? slides.length - 1 : 0;

  const [page,   setPage]   = useState(startIndex);
  // Start with an estimate; onLayout corrects it after first render
  const [listH,  setListH]  = useState(() => H * 0.65);
  const listRef = useRef<FlatList>(null);

  const isLast = isRTL ? page === 0 : page === slides.length - 1;
  const accent = slides[page]?.accentColor ?? C.primary;

  const goNext = () => {
    if (isLast) { onDone(); return; }
    const next = isRTL ? page - 1 : page + 1;
    listRef.current?.scrollToOffset({ offset: next * W, animated: true });
    // Don't setPage here — onScroll is the single source of truth to avoid double re-render lag
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPage(Math.round(e.nativeEvent.contentOffset.x / W));
  };

  const renderSlide = ({ item }: { item: Slide }) => (
    <View style={{ width: W, height: listH }}>

      {/* ── Colored top panel ─────────────────────────────────────────── */}
      <View style={[s.topPanel, { height: listH * TOP_RATIO, backgroundColor: item.topBg }]}>
        {/* Glow rings + icon, nested so rings center around the icon */}
        <View style={[s.glowOuter, { backgroundColor: item.iconColor + '18' }]}>
          <View style={[s.glowInner, { backgroundColor: item.iconColor + '30' }]}>
            <Ionicons name={item.icon as any} size={80} color={item.iconColor} />
          </View>
        </View>
      </View>

      {/* ── White text area ────────────────────────────────────────────── */}
      <View style={[
        s.textArea,
        { height: listH * (1 - TOP_RATIO) },
        isRTL && s.textAreaRTL,
      ]}>
        <Text style={[s.title, isRTL && s.rAlign]}>
          {isRTL ? item.titleHe : item.titleEn}
        </Text>
        <Text style={[s.sub, isRTL && s.rAlign]}>
          {isRTL ? item.subHe : item.subEn}
        </Text>
      </View>

    </View>
  );

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>

      {/* ── Header: logo + skip ───────────────────────────────────────── */}
      <View style={[s.header, isRTL && s.headerRTL]}>
        <Image
          source={require('../../assets/logo.png')}
          style={s.logo}
          resizeMode="contain"
        />
        <TouchableOpacity
          onPress={onDone}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={s.skipTxt}>{isRTL ? 'דלגו' : 'Skip'}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Slides ────────────────────────────────────────────────────── */}
      <FlatList
        ref={listRef}
        data={slides}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        renderItem={renderSlide}
        style={s.list}
        initialScrollIndex={startIndex}
        getItemLayout={(_, i) => ({ length: W, offset: W * i, index: i })}
        onLayout={e => setListH(e.nativeEvent.layout.height)}
      />

      {/* ── Footer: dots + CTA ────────────────────────────────────────── */}
      <View style={[s.footer, { paddingBottom: insets.bottom + 20 }]}>
        <View style={s.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[s.dot, i === page && { ...s.dotActive, backgroundColor: accent }]}
            />
          ))}
        </View>
        <TouchableOpacity
          style={[s.btn, { backgroundColor: accent }]}
          onPress={goNext}
          activeOpacity={0.85}
        >
          {isRTL && (
            <Ionicons name="chevron-back" size={18} color={C.white} />
          )}
          <Text style={s.btnTxt}>
            {isLast
              ? (isRTL ? 'בואו נתחיל' : 'Get Started')
              : (isRTL ? 'הבא' : 'Next')}
          </Text>
          {!isRTL && (
            <Ionicons name="chevron-forward" size={18} color={C.white} />
          )}
        </TouchableOpacity>
      </View>

    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.white },

  // ── Header ──────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    height: 50,
  },
  headerRTL: { flexDirection: 'row-reverse' },
  logo:    { width: 110, height: 26 },
  skipTxt: { fontSize: 14, color: C.muted, fontWeight: '500' },

  // ── Slides ───────────────────────────────────────────────────────────────
  list: { flex: 1 },

  topPanel: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Outer glow ring (lightest)
  glowOuter: {
    width: 200,
    height: 200,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Inner glow ring (slightly more saturated)
  glowInner: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },

  textArea: {
    backgroundColor: C.white,
    paddingHorizontal: 36,
    paddingTop: 32,
    gap: 12,
  },
  textAreaRTL: { alignItems: 'flex-end' },

  title: {
    fontSize: 26,
    fontWeight: '700',
    color: C.text,
    lineHeight: 34,
  },
  sub: {
    fontSize: 15,
    color: C.sub,
    lineHeight: 24,
  },
  rAlign: { textAlign: 'right' },

  // ── Footer ───────────────────────────────────────────────────────────────
  footer: {
    backgroundColor: C.white,
    paddingHorizontal: 24,
    paddingTop: 16,
    gap: 16,
  },

  dots:     { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  dot:      { width: 6, height: 6, borderRadius: 3, backgroundColor: C.border },
  dotActive:{ width: 22, height: 6, borderRadius: 3 },

  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  btnTxt: { color: C.white, fontSize: 16, fontWeight: '600' },
});
