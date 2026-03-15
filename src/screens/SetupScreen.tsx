import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Image, ActivityIndicator, TextInput, FlatList,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguageStore } from '../stores/languageStore';
import { useAuthStore } from '../stores/authStore';
import { supabase } from '../lib/supabase';
import { GENRES_META, CITIES } from '../constants/books';

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
};

export const SETUP_DONE_KEY = 'bookloop_setup_done';

interface Props { onDone: () => void; }

export default function SetupScreen({ onDone }: Props) {
  const { isRTL }          = useLanguageStore();
  const { user, profile, setProfile } = useAuthStore();
  const insets = useSafeAreaInsets();

  const [step, setStep]           = useState<1 | 2>(1);
  const [city, setCity]           = useState('');
  const [citySearch, setCitySearch] = useState('');

  const [selected, setSelected]   = useState<string[]>([]);
  const [saving, setSaving]       = useState(false);

  const filteredCities = useMemo(() =>
    citySearch.trim()
      ? CITIES.filter(c => c.includes(citySearch.trim()))
      : CITIES,
    [citySearch],
  );

  const toggle = (key: string) => {
    setSelected(prev =>
      prev.includes(key) ? prev.filter(g => g !== key) : [...prev, key]
    );
  };

  const finish = async () => {
    setSaving(true);
    const genres = selected;

    if (user) {
      await supabase
        .from('profiles')
        .update({
          city,
          ...(genres.length > 0 ? { favorite_genres: genres } : {}),
        })
        .eq('id', user.id);

      if (profile) {
        setProfile({
          ...profile,
          city,
          ...(genres.length > 0 ? { favorite_genres: genres } : {}),
        });
      }
    }

    await AsyncStorage.setItem(SETUP_DONE_KEY, 'true');
    onDone();
  };

  // ── Step 1: City ──────────────────────────────────────────────
  if (step === 1) {
    return (
      <View style={[s.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={s.header}>
          <Image source={require('../../assets/logo.png')} style={s.logo} resizeMode="contain" />
          <Text style={[s.title, isRTL && s.rAlign]}>
            {isRTL ? 'איפה אתם נמצאים?' : 'Where are you located?'}
          </Text>
          <Text style={[s.sub, isRTL && s.rAlign]}>
            {isRTL ? 'נציג לכם ספרים קרובים אליכם' : "We'll show you books near you"}
          </Text>
        </View>

        {/* Search bar */}
        <View style={[s.citySearchRow, isRTL && { flexDirection: 'row-reverse' }]}>
          <Ionicons name="search-outline" size={16} color={C.muted} />
          <TextInput
            style={[s.citySearchInput, isRTL && { textAlign: 'right' }]}
            value={citySearch}
            onChangeText={setCitySearch}
            placeholder={isRTL ? 'חיפוש עיר...' : 'Search city...'}
            placeholderTextColor={C.muted}
            autoCorrect={false}
          />
          {citySearch.length > 0 && (
            <TouchableOpacity onPress={() => setCitySearch('')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Ionicons name="close-circle" size={16} color={C.muted} />
            </TouchableOpacity>
          )}
        </View>

        {/* City list */}
        <FlatList
          data={filteredCities}
          keyExtractor={item => item}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={s.cityList}
          renderItem={({ item }) => {
            const active = item === city;
            return (
              <TouchableOpacity
                style={[s.cityRow, active && s.cityRowActive, isRTL && { flexDirection: 'row-reverse' }]}
                onPress={() => setCity(item)}
                activeOpacity={0.7}
              >
                <Ionicons name="location-outline" size={16} color={active ? C.primary : C.muted} />
                <Text style={[s.cityRowTxt, active && s.cityRowTxtActive]}>{item}</Text>
                {active && <Ionicons name="checkmark" size={16} color={C.primary} />}
              </TouchableOpacity>
            );
          }}
        />

        {/* Footer */}
        <View style={[s.footer, { paddingBottom: insets.bottom + 20 }]}>
          <TouchableOpacity
            style={[s.btn, isRTL && s.btnRTL, !city && s.btnDisabled]}
            onPress={() => setStep(2)}
            disabled={!city}
            activeOpacity={0.85}
          >
            <Text style={s.btnTxt}>{isRTL ? 'המשך' : 'Continue'}</Text>
            <Ionicons name={isRTL ? 'arrow-back' : 'arrow-forward'} size={18} color={C.white} />
          </TouchableOpacity>
          {!city && (
            <Text style={s.requiredNote}>
              {isRTL ? 'נדרש לבחור עיר להמשיך' : 'City selection is required to continue'}
            </Text>
          )}
          <View style={s.dots}>
            <View style={[s.dot, s.dotActive]} />
            <View style={s.dot} />
          </View>
        </View>
      </View>
    );
  }

  // ── Step 2: Genres ────────────────────────────────────────────
  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Image source={require('../../assets/logo.png')} style={s.logo} resizeMode="contain" />
        <Text style={[s.title, isRTL && s.rAlign]}>
          {isRTL ? 'מה אתם אוהבים לקרוא?' : 'What do you love to read?'}
        </Text>
        <Text style={[s.sub, isRTL && s.rAlign]}>
          {isRTL
            ? 'בחרו ז׳אנרים לקבל פיד מותאם אישית. תוכלו לשנות בהמשך.'
            : 'Pick your favourite genres for a personalised feed. You can change this later.'}
        </Text>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.genreBody} showsVerticalScrollIndicator={false}>
        <View style={s.genreGrid}>
          {GENRES_META.map(g => {
            const active = selected.includes(g.key);
            return (
              <TouchableOpacity
                key={g.key}
                style={[s.genreChip, active && { backgroundColor: g.bg, borderColor: g.color }]}
                onPress={() => toggle(g.key)}
                activeOpacity={0.8}
              >
                <Ionicons name={g.icon as any} size={14} color={active ? g.color : C.muted} />
                <Text style={[s.genreChipTxt, active && { color: g.color, fontWeight: '600' }]}>
                  {isRTL ? g.he : g.en}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={[s.footer, { paddingBottom: insets.bottom + 20 }]}>
        {selected.length > 0 && (
          <Text style={s.selectedCount}>
            {isRTL ? `${selected.length} נבחרו` : `${selected.length} selected`}
          </Text>
        )}
        <TouchableOpacity
          style={[s.btn, isRTL && s.btnRTL]}
          onPress={finish}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving
            ? <ActivityIndicator color={C.white} />
            : <>
                <Text style={s.btnTxt}>{isRTL ? 'בואו נתחיל' : "Let's go"}</Text>
                <Ionicons name={isRTL ? 'arrow-back' : 'arrow-forward'} size={18} color={C.white} />
              </>
          }
        </TouchableOpacity>
        <TouchableOpacity style={s.skipBtn} onPress={finish} disabled={saving}>
          <Text style={[s.skipTxt, saving && { opacity: 0.4 }]}>
            {isRTL ? 'אדלג, אוסיף אחר כך' : 'Skip for now'}
          </Text>
        </TouchableOpacity>
        <View style={s.dots}>
          <View style={s.dot} />
          <View style={[s.dot, s.dotActive]} />
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  header: {
    paddingTop: 24, paddingHorizontal: 24, paddingBottom: 16,
    backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.border,
    alignItems: 'center',
  },
  logo:  { width: 120, height: 26, marginBottom: 20 },
  title: { fontSize: 22, fontWeight: '700', color: C.text, textAlign: 'center', marginBottom: 8 },
  sub:   { fontSize: 14, color: C.sub, textAlign: 'center', lineHeight: 21 },

  // ── City step (inline) ──
  citySearchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: C.white,
    borderRadius: 12, borderWidth: 1, borderColor: C.border,
  },
  citySearchInput: { flex: 1, fontSize: 14, color: C.text, padding: 0 },
  cityList: { flex: 1 },
  cityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f5f5f4',
    backgroundColor: C.white,
  },
  cityRowActive:    { backgroundColor: C.primaryLight },
  cityRowTxt:       { flex: 1, fontSize: 15, color: C.text },
  cityRowTxtActive: { color: C.primary, fontWeight: '600' },
  requiredNote: {
    fontSize: 12, color: C.muted, textAlign: 'center',
  },

  // ── Genre step ──
  scroll:    { flex: 1 },
  genreBody: { padding: 16 },
  genreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  genreChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: C.border, borderRadius: 20,
    paddingVertical: 8, paddingHorizontal: 13,
    backgroundColor: C.white,
  },
  genreChipTxt: { fontSize: 13, fontWeight: '500', color: C.sub },

  // ── Shared footer ──
  footer: {
    padding: 20,
    backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.border,
    alignItems: 'center', gap: 10,
  },
  selectedCount: { fontSize: 13, color: C.muted, fontWeight: '500' },
  btn: {
    width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: C.primary, borderRadius: 12, paddingVertical: 15,
  },
  btnRTL:     { flexDirection: 'row-reverse' },
  btnDisabled: { opacity: 0.4 },
  btnTxt:  { color: C.white, fontSize: 16, fontWeight: '600' },
  skipBtn: { paddingVertical: 4 },
  skipTxt: { fontSize: 13, color: C.muted },

  dots: { flexDirection: 'row', gap: 6, marginTop: 4 },
  dot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: C.border,
  },
  dotActive: { backgroundColor: C.primary, width: 18 },

  rAlign: { textAlign: 'right' },
});
