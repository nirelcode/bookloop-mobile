import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Image, ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useLanguageStore } from '../stores/languageStore';
import { useAuthStore } from '../stores/authStore';
import { supabase } from '../lib/supabase';
import { GENRES_META } from '../constants/books';
import { GenrePickerModal } from '../components/GenrePickerModal';

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
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving]     = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const toggle = (key: string) => {
    setSelected(prev =>
      prev.includes(key) ? prev.filter(g => g !== key) : [...prev, key]
    );
  };

  const finish = async () => {
    setSaving(true);
    const genres = selected;

    // Save to Supabase if logged in
    if (user && genres.length > 0) {
      await supabase
        .from('profiles')
        .update({ favorite_genres: genres })
        .eq('id', user.id);
      // Update local store
      if (profile) setProfile({ ...profile, favorite_genres: genres });
    }

    await AsyncStorage.setItem(SETUP_DONE_KEY, 'true');
    onDone();
  };

  return (
    <View style={s.container}>
      {/* Header */}
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

      {/* Genre selection area */}
      <ScrollView style={s.scroll} contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>

        {/* Selected chips */}
        {selected.length > 0 ? (
          <View style={s.chipsWrap}>
            {selected.map(key => {
              const g = GENRES_META.find(x => x.key === key);
              if (!g) return null;
              return (
                <TouchableOpacity
                  key={key}
                  style={[s.chip, { backgroundColor: g.bg, borderColor: g.color }]}
                  onPress={() => toggle(key)}
                  activeOpacity={0.8}
                >
                  <Ionicons name={g.icon as any} size={13} color={g.color} />
                  <Text style={[s.chipLabel, { color: g.color }]}>{isRTL ? g.he : g.en}</Text>
                  <Ionicons name="close" size={13} color={g.color} />
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <Text style={[s.placeholder, isRTL && { textAlign: 'right' }]}>
            {isRTL ? 'לא נבחרו ז׳אנרים עדיין' : 'No genres selected yet'}
          </Text>
        )}

        {/* Open picker button */}
        <TouchableOpacity style={s.addBtn} onPress={() => setShowPicker(true)} activeOpacity={0.8}>
          <Ionicons name="add-circle-outline" size={18} color={C.primary} />
          <Text style={s.addBtnTxt}>
            {isRTL ? 'בחרו ז׳אנרים' : 'Choose genres'}
          </Text>
        </TouchableOpacity>

      </ScrollView>

      <GenrePickerModal
        visible={showPicker}
        selected={selected}
        isRTL={isRTL}
        onChange={setSelected}
        onClose={() => setShowPicker(false)}
      />

      {/* Footer */}
      <View style={s.footer}>
        {selected.length > 0 && (
          <Text style={s.selectedCount}>
            {isRTL ? `${selected.length} נבחרו` : `${selected.length} selected`}
          </Text>
        )}
        <TouchableOpacity style={s.btn} onPress={finish} disabled={saving} activeOpacity={0.85}>
          {saving
            ? <ActivityIndicator color={C.white} />
            : <>
                <Text style={s.btnTxt}>
                  {isRTL ? 'בואו נתחיל' : "Let's go"}
                </Text>
                <Ionicons name="arrow-forward" size={18} color={C.white} />
              </>
          }
        </TouchableOpacity>
        <TouchableOpacity style={s.skipBtn} onPress={finish} disabled={saving}>
          <Text style={[s.skipTxt, saving && { opacity: 0.4 }]}>
            {isRTL ? 'אדלג, אוסיף אחר כך' : 'Skip for now'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  header: {
    paddingTop: 64, paddingHorizontal: 24, paddingBottom: 16,
    backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.border,
    alignItems: 'center',
  },
  logo:  { width: 120, height: 26, marginBottom: 20 },
  title: { fontSize: 22, fontWeight: '700', color: C.text, textAlign: 'center', marginBottom: 8 },
  sub:   { fontSize: 14, color: C.sub, textAlign: 'center', lineHeight: 21 },

  scroll: { flex: 1 },
  body:   { padding: 24, gap: 16 },

  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1.5, borderRadius: 20,
    paddingVertical: 6, paddingHorizontal: 11,
  },
  chipLabel: { fontSize: 13, fontWeight: '600' },

  placeholder: { fontSize: 14, color: C.muted, textAlign: 'center', paddingVertical: 8 },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    borderWidth: 1.5, borderColor: C.primary, borderStyle: 'dashed', borderRadius: 12,
    paddingVertical: 13,
  },
  addBtnTxt: { fontSize: 15, fontWeight: '600', color: C.primary },

  footer: {
    padding: 20, paddingBottom: 36,
    backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.border,
    alignItems: 'center', gap: 10,
  },
  selectedCount: { fontSize: 13, color: C.muted, fontWeight: '500' },
  btn: {
    width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: C.emerald, borderRadius: 14, paddingVertical: 15,
  },
  btnTxt:  { color: C.white, fontSize: 16, fontWeight: '600' },
  skipBtn: { paddingVertical: 4 },
  skipTxt: { fontSize: 13, color: C.muted },

  rAlign: { textAlign: 'right' },
});
