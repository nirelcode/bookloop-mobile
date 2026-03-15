import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Modal, FlatList, Pressable, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GENRES_META } from '../constants/books';

const C = {
  white:        '#ffffff',
  bg:           '#fafaf9',
  border:       '#e7e5e4',
  text:         '#1c1917',
  sub:          '#78716c',
  muted:        '#a8a29e',
  primary:      '#2563eb',
  primaryLight: '#eff6ff',
  inputBg:      '#f5f5f4',
};

interface Props {
  visible:  boolean;
  selected: string[];
  isRTL:    boolean;
  onChange: (genres: string[]) => void;
  onClose:  () => void;
}

export function GenrePickerModal({ visible, selected, isRTL, onChange, onClose }: Props) {
  const [search, setSearch] = useState('');
  const [local, setLocal] = useState<string[]>(selected);
  const insets = useSafeAreaInsets();

  // Sync local state when modal opens
  React.useEffect(() => { if (visible) setLocal(selected); }, [visible]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return GENRES_META;
    return GENRES_META.filter(g =>
      g.he.toLowerCase().includes(q) || g.en.toLowerCase().includes(q)
    );
  }, [search]);

  const toggle = (key: string) => {
    const next = local.includes(key) ? local.filter(g => g !== key) : [...local, key];
    setLocal(next);
    onChange(next);
  };

  const handleClose = () => { setSearch(''); onClose(); };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <Pressable style={s.overlay} onPress={handleClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.kav}>
        <Pressable style={[s.sheet, { paddingBottom: insets.bottom + 12 }]} onPress={() => {}}>

          {/* Handle */}
          <View style={s.handle} />

          {/* Header */}
          <View style={s.header}>
            <Text style={s.title}>{isRTL ? 'בחרו ז׳אנרים' : 'Choose Genres'}</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={C.sub} />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={s.searchRow}>
            <Ionicons name="search-outline" size={16} color={C.muted} />
            <TextInput
              style={[s.searchInput, isRTL && { textAlign: 'right' }]}
              value={search}
              onChangeText={setSearch}
              placeholder={isRTL ? 'חיפוש ז׳אנר...' : 'Search genre...'}
              placeholderTextColor={C.muted}
              autoFocus
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Ionicons name="close-circle" size={16} color={C.muted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Count hint */}
          {local.length > 0 && (
            <Text style={s.countHint}>
              {isRTL ? `${local.length} נבחרו` : `${local.length} selected`}
            </Text>
          )}

          {/* Genre list */}
          <FlatList
            data={filtered}
            keyExtractor={g => g.key}
            keyboardShouldPersistTaps="handled"
            style={s.list}
            renderItem={({ item: g }) => {
              const on = local.includes(g.key);
              return (
                <TouchableOpacity
                  style={[s.row, on && { backgroundColor: g.bg }]}
                  onPress={() => toggle(g.key)}
                  activeOpacity={0.7}
                >
                  <View style={[s.iconBox, { backgroundColor: on ? g.color + '22' : '#f0f0ef' }]}>
                    <Ionicons name={g.icon as any} size={16} color={on ? g.color : C.muted} />
                  </View>
                  <Text style={[s.genreName, on && { color: g.color, fontWeight: '600' }]}>
                    {isRTL ? g.he : g.en}
                  </Text>
                  {on
                    ? <Ionicons name="checkmark-circle" size={20} color={g.color} />
                    : <View style={s.emptyCircle} />
                  }
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <Text style={s.empty}>{isRTL ? 'לא נמצאו ז׳אנרים' : 'No genres found'}</Text>
            }
          />

          {/* Done button */}
          {local.length > 0 && (
            <View style={s.doneRow}>
              <TouchableOpacity style={s.doneBtn} onPress={handleClose} activeOpacity={0.85}>
                <Text style={s.doneTxt}>
                  {isRTL ? `סיום (${local.length})` : `Done (${local.length})`}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  kav: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '92%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: 'center',
    marginTop: 12, marginBottom: 4,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  title: { fontSize: 17, fontWeight: '700', color: C.text },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    margin: 16, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: C.inputBg, borderRadius: 12,
    borderWidth: 1, borderColor: C.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: C.text, padding: 0 },

  countHint: {
    fontSize: 12, color: C.muted, fontWeight: '500',
    paddingHorizontal: 20, paddingBottom: 8,
    textAlign: 'center',
  },

  list: { flex: 1 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#f5f5f4',
  },
  iconBox: {
    width: 32, height: 32, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
  },
  genreName:   { flex: 1, fontSize: 15, color: C.text },
  emptyCircle: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 1.5, borderColor: C.border,
  },
  empty: {
    padding: 32, textAlign: 'center',
    fontSize: 14, color: C.muted,
  },
  doneRow: {
    paddingHorizontal: 20, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: C.border,
  },
  doneBtn: {
    backgroundColor: C.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneTxt: {
    color: '#ffffff', fontSize: 15, fontWeight: '600',
  },
});
