import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';

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
};

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  sale:  { bg: C.primaryLight, text: C.primary },
  free:  { bg: C.emeraldLight, text: C.emerald },
  trade: { bg: C.amberLight,   text: C.amber },
};

export interface PickerBook {
  id: string;
  title: string;
  author: string;
  images: string[];
  listing_type: string;
  price?: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onConfirm: (books: PickerBook[]) => void;
  sellerId: string;
  sellerName: string;
  isRTL: boolean;
}

const MAX_SELECT = 5;

export default function SellerBooksPickerModal({
  visible,
  onClose,
  onConfirm,
  sellerId,
  sellerName,
  isRTL,
}: Props) {
  const insets = useSafeAreaInsets();
  const [books, setBooks]       = useState<PickerBook[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!visible) return;
    setSelected(new Set());
    setLoading(true);
    supabase
      .from('books')
      .select('id,title,author,images,listing_type,price')
      .eq('user_id', sellerId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setBooks((data as PickerBook[]) ?? []);
        setLoading(false);
      });
  }, [visible, sellerId]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_SELECT) {
        next.add(id);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    const picked = books.filter(b => selected.has(b.id));
    onConfirm(picked);
    onClose();
  };

  const count = selected.size;

  const confirmLabel = isRTL
    ? count === 0 ? 'בחר ספרים' : count === 1 ? 'שלח ספר 1' : `שלח ${count} ספרים`
    : count === 0 ? 'Select books' : count === 1 ? 'Send 1 book' : `Send ${count} books`;

  const renderBook = ({ item }: { item: PickerBook }) => {
    const isSelected = selected.has(item.id);
    const tc = TYPE_COLORS[item.listing_type] ?? TYPE_COLORS.sale;
    const priceLabel = item.listing_type === 'sale' && item.price
      ? `₪${item.price}`
      : item.listing_type === 'free'
        ? (isRTL ? 'חינם' : 'Free')
        : (isRTL ? 'להחלפה' : 'Trade');
    const imgUri = item.images?.[0] ?? `https://picsum.photos/seed/${item.id}/300/400`;

    return (
      <TouchableOpacity
        style={[p.card, isSelected && p.cardSelected]}
        onPress={() => toggle(item.id)}
        activeOpacity={0.82}
      >
        <View style={p.imgWrap}>
          <Image source={{ uri: imgUri }} style={p.img} contentFit="cover" />
          {isSelected && (
            <View style={p.checkOverlay}>
              <View style={p.checkCircle}>
                <Ionicons name="checkmark" size={16} color={C.white} />
              </View>
            </View>
          )}
        </View>
        <View style={p.info}>
          <Text style={p.title} numberOfLines={2}>{item.title}</Text>
          <Text style={p.author} numberOfLines={1}>{item.author}</Text>
          <View style={[p.badge, { backgroundColor: tc.bg }]}>
            <Text style={[p.badgeTxt, { color: tc.text }]}>{priceLabel}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={p.overlay} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={p.kav}
        >
          <Pressable style={[p.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={e => e.stopPropagation()}>
            {/* Handle */}
            <View style={p.handle} />

            {/* Header */}
            <View style={[p.header, isRTL && p.headerRTL]}>
              <Text style={p.headerTitle} numberOfLines={1}>
                {isRTL ? `ספרים של ${sellerName}` : `Books by ${sellerName}`}
              </Text>
              <TouchableOpacity onPress={onClose} style={p.closeBtn} activeOpacity={0.7}>
                <Ionicons name="close" size={20} color={C.sub} />
              </TouchableOpacity>
            </View>

            {/* Content */}
            {loading ? (
              <View style={p.loadingWrap}>
                <ActivityIndicator size="large" color={C.primary} />
              </View>
            ) : books.length === 0 ? (
              <View style={p.emptyWrap}>
                <Ionicons name="book-outline" size={40} color={C.muted} />
                <Text style={p.emptyText}>
                  {isRTL ? 'אין ספרים פעילים כרגע' : 'No active listings'}
                </Text>
              </View>
            ) : (
              <FlatList
                data={books}
                renderItem={renderBook}
                keyExtractor={b => b.id}
                numColumns={2}
                columnWrapperStyle={p.row}
                contentContainerStyle={p.grid}
                showsVerticalScrollIndicator={false}
              />
            )}

            {/* CTA */}
            <TouchableOpacity
              style={[p.cta, count === 0 && p.ctaDisabled]}
              onPress={handleConfirm}
              disabled={count === 0}
              activeOpacity={0.85}
            >
              <Text style={[p.ctaTxt, count === 0 && p.ctaTxtDisabled]}>
                {confirmLabel}
              </Text>
            </TouchableOpacity>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const p = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  kav: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    height: '92%',
    backgroundColor: C.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerRTL: { flexDirection: 'row-reverse' },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: C.text,
    flex: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f5f5f4',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: C.muted,
  },
  grid: {
    padding: 12,
    paddingBottom: 8,
  },
  row: {
    gap: 10,
    marginBottom: 10,
  },
  card: {
    flex: 1,
    backgroundColor: C.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  cardSelected: {
    borderColor: C.primary,
    borderWidth: 2,
  },
  imgWrap: {
    position: 'relative',
  },
  img: {
    width: '100%',
    aspectRatio: 3 / 4,
    backgroundColor: '#e7e5e4',
  },
  checkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(37,99,235,0.18)',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    padding: 6,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    padding: 9,
    gap: 3,
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    color: C.text,
    lineHeight: 16,
  },
  author: {
    fontSize: 11,
    color: C.sub,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 2,
  },
  badgeTxt: {
    fontSize: 11,
    fontWeight: '600',
  },
  cta: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: C.primary,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  ctaDisabled: {
    backgroundColor: '#d1d5db',
  },
  ctaTxt: {
    fontSize: 16,
    fontWeight: '700',
    color: C.white,
  },
  ctaTxtDisabled: {
    color: '#9ca3af',
  },
});
