import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Pressable,
  PanResponder,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BOOK_CONDITIONS, LISTING_TYPES, GENRES_META } from '../constants/books';
import { useLanguageStore } from '../stores/languageStore';
import { useLocationStore } from '../stores/locationStore';
import { CityPickerModal } from './CityPickerModal';
import { GenrePickerModal } from './GenrePickerModal';

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
  amberLight:   '#fef3c7',
  inputBg:      '#f5f5f4',
};

interface FiltersModalProps {
  visible: boolean;
  onClose: () => void;
  onApply: (filters: any) => void;
  currentFilters: any;
}

const LISTING_CONFIG: Record<string, { icon: string; activeColor: string; activeBg: string }> = {
  free:  { icon: 'gift-outline',           activeColor: C.emerald,  activeBg: C.emeraldLight },
  sale:  { icon: 'pricetag-outline',        activeColor: C.primary,  activeBg: C.primaryLight },
  trade: { icon: 'swap-horizontal-outline', activeColor: C.amber,    activeBg: C.amberLight   },
};

export default function FiltersModal({ visible, onClose, onApply, currentFilters }: FiltersModalProps) {
  const { isRTL }  = useLanguageStore();
  const { coords } = useLocationStore();

  const swipePan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderRelease: (_, g) => { if (g.dy > 50) onClose(); },
  })).current;

  const [listingType, setListingType] = useState(currentFilters.listingType || '');
  const [condition, setCondition]     = useState(currentFilters.condition   || '');
  const [city, setCity]               = useState(currentFilters.city        || '');
  const [genres, setGenres]           = useState<string[]>(currentFilters.genres || []);
  const [minPrice, setMinPrice]       = useState(
    currentFilters.minPrice !== undefined ? String(currentFilters.minPrice) : ''
  );
  const [maxPrice, setMaxPrice]       = useState(
    currentFilters.maxPrice !== undefined ? String(currentFilters.maxPrice) : ''
  );
  const [nearMe, setNearMe]                 = useState<boolean>(!!currentFilters.nearMe);
  const [showCityPicker, setShowCityPicker]   = useState(false);
  const [showGenrePicker, setShowGenrePicker] = useState(false);

  // Re-sync when modal opens (handles chip removals from outside)
  useEffect(() => {
    if (visible) {
      setListingType(currentFilters.listingType || '');
      setCondition(currentFilters.condition   || '');
      setCity(currentFilters.city             || '');
      setGenres(currentFilters.genres         || []);
      setNearMe(!!currentFilters.nearMe);
      setMinPrice(currentFilters.minPrice !== undefined ? String(currentFilters.minPrice) : '');
      setMaxPrice(currentFilters.maxPrice !== undefined ? String(currentFilters.maxPrice) : '');
    }
  }, [visible]);

  // Only show price for 'all' or 'sale' — price doesn't apply to free/trade
  const showPrice = !listingType || listingType === 'sale';


  const handleListingTypePress = (value: string) => {
    const next = listingType === value ? '' : value;
    setListingType(next);
    if (next === 'free' || next === 'trade') {
      setMinPrice('');
      setMaxPrice('');
    }
  };

  const handleApply = () => {
    onApply({
      listingType,
      condition,
      city,
      genres: genres.length > 0 ? genres : undefined,
      nearMe: nearMe || undefined,
      minPrice: minPrice ? parseInt(minPrice, 10) : undefined,
      maxPrice: maxPrice ? parseInt(maxPrice, 10) : undefined,
    });
    onClose();
  };

  const handleReset = () => {
    setListingType('');
    setCondition('');
    setCity('');
    setGenres([]);
    setNearMe(false);
    setMinPrice('');
    setMaxPrice('');
    onApply({});
    onClose();
  };


  const activeFiltersCount = [
    listingType,
    condition,
    city,
    nearMe ? 'nearMe' : '',
    (minPrice || maxPrice) ? 'price' : '',
    ...genres,
  ].filter(Boolean).length;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.kav}>
        <Pressable style={s.sheet} onPress={() => {}}>

          {/* Handle — drag down to close */}
          <View style={s.handle} {...swipePan.panHandlers} />

          {/* Header */}
          <View style={s.header}>
            <View>
              <Text style={s.headerTitle}>{isRTL ? 'סינון' : 'Filters'}</Text>
              {activeFiltersCount > 0 && (
                <Text style={s.headerSub}>
                  {activeFiltersCount} {isRTL ? 'פעילים' : 'active'}
                </Text>
              )}
            </View>
            <TouchableOpacity style={s.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={18} color={C.sub} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={s.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* ── Listing Type ── */}
            <SectionLabel text={isRTL ? 'סוג מודעה' : 'Listing Type'} />
            <View style={s.listingRow}>
              {LISTING_TYPES.map(t => {
                const conf   = LISTING_CONFIG[t.value];
                const active = listingType === t.value;
                return (
                  <TouchableOpacity
                    key={t.value}
                    style={[
                      s.listingChip,
                      active && { borderColor: conf.activeColor, backgroundColor: conf.activeBg },
                    ]}
                    onPress={() => handleListingTypePress(t.value)}
                    activeOpacity={0.75}
                  >
                    <Ionicons
                      name={conf.icon as any}
                      size={16}
                      color={active ? conf.activeColor : C.muted}
                    />
                    <Text style={[s.listingChipTxt, active && { color: conf.activeColor, fontWeight: '700' }]}>
                      {isRTL ? t.labelHe : t.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ── Price Range (hidden for free / trade) ── */}
            {showPrice && (
              <>
                <SectionLabel text={isRTL ? 'טווח מחיר (₪)' : 'Price Range (₪)'} />
                <View style={s.priceRow}>
                  <TextInput
                    style={s.priceInput}
                    placeholder={isRTL ? "מינ׳" : 'Min'}
                    placeholderTextColor={C.muted}
                    value={minPrice}
                    onChangeText={setMinPrice}
                    keyboardType="numeric"
                    textAlign="center"
                  />
                  <View style={s.priceSep}>
                    <View style={s.priceSepLine} />
                  </View>
                  <TextInput
                    style={s.priceInput}
                    placeholder={isRTL ? 'ללא הגבלה' : 'No limit'}
                    placeholderTextColor={C.muted}
                    value={maxPrice}
                    onChangeText={setMaxPrice}
                    keyboardType="numeric"
                    textAlign="center"
                  />
                </View>
              </>
            )}

            {/* ── Condition ── */}
            <SectionLabel text={isRTL ? 'מצב הספר' : 'Condition'} />
            <View style={s.pillRow}>
              {BOOK_CONDITIONS.map(c => (
                <Pill
                  key={c.value}
                  label={isRTL ? c.labelHe : c.label}
                  active={condition === c.value}
                  onPress={() => setCondition(condition === c.value ? '' : c.value)}
                />
              ))}
            </View>

            {/* ── Genre ── */}
            <SectionLabel text={isRTL ? "ז'אנר" : 'Genre'} />
            {genres.length > 0 ? (
              <TouchableOpacity style={s.selectedCity} onPress={() => setShowGenrePicker(true)} activeOpacity={0.8}>
                <Ionicons name="library" size={16} color={C.primary} />
                <Text style={s.selectedCityName} numberOfLines={1}>
                  {genres.length === 1
                    ? (isRTL ? GENRES_META.find(g => g.key === genres[0])?.he : GENRES_META.find(g => g.key === genres[0])?.en) ?? genres[0]
                    : `${genres.length} ${isRTL ? "ז'אנרים" : 'genres'}`}
                </Text>
                <TouchableOpacity style={s.selectedCityX} onPress={() => setGenres([])} activeOpacity={0.8}>
                  <Ionicons name="close" size={14} color={C.primary} />
                </TouchableOpacity>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.cityPickerBtn} onPress={() => setShowGenrePicker(true)} activeOpacity={0.8}>
                <Ionicons name="library-outline" size={16} color={C.muted} />
                <Text style={s.cityPickerBtnTxt}>{isRTL ? "בחר ז'אנרים..." : 'Select genres...'}</Text>
                <Ionicons name="chevron-forward" size={16} color={C.muted} />
              </TouchableOpacity>
            )}

            {/* ── City ── */}
            <SectionLabel text={isRTL ? 'עיר' : 'City'} />

            {nearMe ? (
              <TouchableOpacity style={s.selectedCity} onPress={() => setNearMe(false)} activeOpacity={0.8}>
                <Ionicons name="navigate" size={16} color={C.primary} />
                <Text style={s.selectedCityName}>{isRTL ? 'קרוב אליי' : 'Near Me'}</Text>
                <View style={s.selectedCityX}>
                  <Ionicons name="close" size={14} color={C.primary} />
                </View>
              </TouchableOpacity>
            ) : city ? (
              <TouchableOpacity style={s.selectedCity} onPress={() => setCity('')} activeOpacity={0.8}>
                <Ionicons name="location" size={16} color={C.primary} />
                <Text style={s.selectedCityName}>{city}</Text>
                <View style={s.selectedCityX}>
                  <Ionicons name="close" size={14} color={C.primary} />
                </View>
              </TouchableOpacity>
            ) : (
              <View style={s.cityRow}>
                <TouchableOpacity
                  style={s.cityPickerBtn}
                  onPress={() => setShowCityPicker(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="location-outline" size={16} color={C.muted} />
                  <Text style={s.cityPickerBtnTxt}>{isRTL ? 'בחר עיר...' : 'Select city...'}</Text>
                  <Ionicons name="chevron-forward" size={16} color={C.muted} />
                </TouchableOpacity>
                {!!coords && (
                  <TouchableOpacity
                    style={s.nearMeBtn}
                    onPress={() => { setNearMe(true); setCity(''); }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="navigate-outline" size={15} color={C.sub} />
                    <Text style={s.nearMeBtnTxt}>{isRTL ? 'קרוב אליי' : 'Near Me'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <View style={{ height: 24 }} />
          </ScrollView>

          {/* Footer */}
          <View style={s.footer}>
            <TouchableOpacity style={s.resetBtn} onPress={handleReset}>
              <Text style={s.resetBtnTxt}>{isRTL ? 'איפוס' : 'Reset'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.applyBtn} onPress={handleApply}>
              <Text style={s.applyBtnTxt}>{isRTL ? 'הצג תוצאות' : 'Show Results'}</Text>
              {activeFiltersCount > 0 && (
                <View style={s.applyBadge}>
                  <Text style={s.applyBadgeTxt}>{activeFiltersCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

        </Pressable>
        </KeyboardAvoidingView>
      </Pressable>

      <CityPickerModal
        visible={showCityPicker}
        selected={city}
        isRTL={isRTL}
        onSelect={(c) => { setCity(c); setNearMe(false); }}
        onClose={() => setShowCityPicker(false)}
      />

      <GenrePickerModal
        visible={showGenrePicker}
        selected={genres}
        isRTL={isRTL}
        onChange={(g) => setGenres(g)}
        onClose={() => setShowGenrePicker(false)}
      />
    </Modal>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SectionLabel({ text }: { text: string }) {
  return <Text style={s.sectionLabel}>{text}</Text>;
}

function Pill({
  label,
  active,
  onPress,
  activeColor = C.primary,
  activeBg    = C.primaryLight,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  activeColor?: string;
  activeBg?: string;
}) {
  return (
    <TouchableOpacity
      style={[s.pill, active && { borderColor: activeColor, backgroundColor: activeBg }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[s.pillTxt, active && { color: activeColor, fontWeight: '700' }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(28,25,23,0.55)',
  },
  kav: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    height: '92%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: C.text },
  headerSub:   { fontSize: 12, color: C.primary, fontWeight: '600', marginTop: 2 },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: C.inputBg, justifyContent: 'center', alignItems: 'center',
  },

  scroll: { flex: 1, paddingHorizontal: 20 },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: C.muted,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginTop: 20, marginBottom: 10,
  },

  // ── Listing type chips ──
  listingRow: { flexDirection: 'row', gap: 8 },
  listingChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, gap: 6,
    borderRadius: 12, borderWidth: 1.5, borderColor: C.border,
    backgroundColor: C.white,
  },
  listingChipTxt: { fontSize: 13, fontWeight: '600', color: C.sub },

  // ── Condition pills ──
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: 20, borderWidth: 1.5, borderColor: C.border,
    backgroundColor: C.white,
  },
  pillTxt: { fontSize: 13, color: C.sub, fontWeight: '500' },

  // ── Price range ──
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  priceInput: {
    flex: 1, height: 46,
    backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border,
    borderRadius: 12, fontSize: 15, color: C.text, textAlign: 'center',
  },
  priceSep:     { width: 20, alignItems: 'center' },
  priceSepLine: { width: 12, height: 2, borderRadius: 1, backgroundColor: C.border },

  // ── City – picker button + Near Me button row ──
  cityRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  cityPickerBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.white, borderWidth: 1, borderColor: C.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
  },
  cityPickerBtnTxt: { flex: 1, fontSize: 15, color: C.muted },
  nearMeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 13,
    borderRadius: 12, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.white,
  },
  nearMeBtnTxt: { fontSize: 14, color: C.sub, fontWeight: '600' },

  // ── City – selected badge ──
  selectedCity: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.primaryLight,
    borderWidth: 1.5, borderColor: C.primary + '55',
    borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16,
  },
  selectedCityName: { flex: 1, fontSize: 15, color: C.primary, fontWeight: '600' },
  selectedCityX: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: C.primary + '22',
    justifyContent: 'center', alignItems: 'center',
  },

  // ── Footer ──
  footer: {
    flexDirection: 'row', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 32,
    gap: 10, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.white,
  },
  resetBtn: {
    flex: 1, height: 50, borderRadius: 14,
    borderWidth: 1.5, borderColor: C.border,
    justifyContent: 'center', alignItems: 'center',
  },
  resetBtnTxt: { fontSize: 15, fontWeight: '600', color: C.sub },
  applyBtn: {
    flex: 2, height: 50, borderRadius: 14,
    backgroundColor: C.primary,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
  },
  applyBtnTxt:  { fontSize: 15, fontWeight: '700', color: C.white },
  applyBadge: {
    backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 10,
    minWidth: 20, height: 20,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5,
  },
  applyBadgeTxt: { color: C.white, fontSize: 11, fontWeight: '700' },
});
