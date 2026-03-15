import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { compressImage } from '../lib/imageUtils';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';
import { useDataStore } from '../stores/dataStore';
import { supabase } from '../lib/supabase';
import { BOOK_CONDITIONS, LISTING_TYPES } from '../constants/books';
import { useToast, Toast } from '../components/Toast';
import i18n from '../lib/i18n';

const C = {
  bg: '#fafaf9',
  white: '#ffffff',
  border: '#e7e5e4',
  text: '#1c1917',
  sub: '#78716c',
  muted: '#a8a29e',
  primary: '#2563eb',
  primaryLight: '#eff6ff',
  emerald: '#10b981',
  red: '#ef4444',
};

export default function EditBookScreen() {
  const navigation = useNavigation<any>();
  const route      = useRoute();
  const { bookId } = route.params as { bookId: string };
  const { user }   = useAuthStore();
  const { isRTL }  = useLanguageStore();
  const insets     = useSafeAreaInsets();
  const { showToast, toast } = useToast();

  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [title,       setTitle]       = useState('');
  const [author,      setAuthor]      = useState('');
  const [description, setDescription] = useState('');
  const [price,       setPrice]       = useState('');
  const [condition,   setCondition]   = useState('good');
  const [listingType,     setListingType]     = useState<'free' | 'sale' | 'trade'>('free');
  const [lookingFor,      setLookingFor]      = useState('');
  const [shippingType,    setShippingType]    = useState<'pickup' | 'shipping'>('pickup');
  const [shippingDetails, setShippingDetails] = useState('');
  const [images,          setImages]          = useState<string[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>([]);

  // Track initial values to detect unsaved changes
  const initialRef = useRef<{
    title: string; author: string; description: string; price: string;
    condition: string; listingType: string; lookingFor: string;
    shippingType: string; shippingDetails: string; existingImages: string[];
  } | null>(null);

  useEffect(() => {
    loadBook();
  }, [bookId]);

  const isDirty = !loading && initialRef.current !== null && (
    title           !== initialRef.current.title           ||
    author          !== initialRef.current.author          ||
    description     !== initialRef.current.description     ||
    price           !== initialRef.current.price           ||
    condition       !== initialRef.current.condition       ||
    listingType     !== initialRef.current.listingType     ||
    lookingFor      !== initialRef.current.lookingFor      ||
    shippingType    !== initialRef.current.shippingType    ||
    shippingDetails !== initialRef.current.shippingDetails ||
    images.length   > 0                                    ||
    existingImages.join() !== initialRef.current.existingImages.join()
  );

  // Keep refs in sync so the listener always reads current values without re-registering
  const isDirtyRef = useRef(false);
  const savingRef  = useRef(false);
  isDirtyRef.current = isDirty;
  savingRef.current  = saving;

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      if (!isDirtyRef.current || savingRef.current) return;
      e.preventDefault();
      Alert.alert(
        isRTL ? 'לבטל שינויים?' : 'Discard changes?',
        isRTL ? 'יש לך שינויים שלא נשמרו' : 'You have unsaved changes that will be lost.',
        [
          { text: isRTL ? 'המשך עריכה' : 'Keep editing', style: 'cancel' },
          { text: isRTL ? 'בטל שינויים' : 'Discard', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
        ]
      );
    });
    return unsubscribe;
  }, [navigation, isRTL]);

  const loadBook = async () => {
    try {
      const { data, error } = await supabase
        .from('books')
        .select('*')
        .eq('id', bookId)
        .single();
      if (error) throw error;
      setTitle(data.title || '');
      setAuthor(data.author || '');
      setDescription(data.description || '');
      setPrice(data.price ? String(data.price) : '');
      setCondition(data.condition || 'good');
      setListingType(data.listing_type || 'free');
      setLookingFor(data.looking_for || '');
      setShippingType(data.shipping_type || 'pickup');
      setShippingDetails(data.shipping_details || '');
      setExistingImages(data.images || []);
      initialRef.current = {
        title:           data.title || '',
        author:          data.author || '',
        description:     data.description || '',
        price:           data.price ? String(data.price) : '',
        condition:       data.condition || 'good',
        listingType:     data.listing_type || 'free',
        lookingFor:      data.looking_for || '',
        shippingType:    data.shipping_type || 'pickup',
        shippingDetails: data.shipping_details || '',
        existingImages:  data.images || [],
      };
    } catch (e: any) {
      Alert.alert(i18n.t('common.error'), e.message);
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 1, // compress manually below
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      // Validate: only allow image MIME types
      if (asset.mimeType && !asset.mimeType.startsWith('image/')) {
        Alert.alert(
          isRTL ? 'קובץ לא נתמך' : 'Unsupported file',
          isRTL ? 'ניתן להעלות רק תמונות (JPEG, PNG, WEBP)' : 'Only image files are allowed (JPEG, PNG, WEBP)',
        );
        return;
      }
      // Compress to JPEG ≤1920px before storing
      const compressed = await compressImage(asset.uri);
      setImages(prev => [...prev, compressed]);
    }
  };

  const removeNewImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const removeExistingImage = (index: number) => {
    setExistingImages(prev => prev.filter((_, i) => i !== index));
  };

  const uploadImage = async (localUri: string): Promise<string> => {
    const ext  = localUri.split('.').pop()?.split('?')[0] || 'jpg';
    const path = `${user!.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const resp = await fetch(localUri);
    const blob = await resp.blob();
    const { data, error } = await supabase.storage
      .from('book-images')
      .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage
      .from('book-images')
      .getPublicUrl(data.path);
    return publicUrl;
  };

  const handleUpdate = async () => {
    if (!title || !author) {
      Alert.alert(i18n.t('publish.error'), i18n.t('publish.fillRequired'));
      return;
    }
    if (listingType === 'sale' && !price) {
      Alert.alert(i18n.t('publish.error'), i18n.t('publish.enterPrice'));
      return;
    }
    if (listingType === 'trade' && !lookingFor) {
      Alert.alert(i18n.t('publish.error'), i18n.t('publish.specifyLookingFor'));
      return;
    }

    setSaving(true);
    try {
      // Upload any new local images
      const newUrls: string[] = [];
      for (const uri of images) {
        newUrls.push(await uploadImage(uri));
      }
      const allImages = [...existingImages, ...newUrls];

      const { error } = await supabase
        .from('books')
        .update({
          title,
          author,
          description: description || null,
          price: listingType === 'sale' ? parseFloat(price) : null,
          listing_type: listingType,
          condition,
          looking_for:      listingType === 'trade' ? lookingFor : null,
          shipping_type:    shippingType,
          shipping_details: shippingType === 'shipping' ? shippingDetails.trim() || null : null,
          images:           allImages,
        })
        .eq('id', bookId);

      if (error) throw error;

      // Clear dirty state so beforeRemove guard doesn't trigger
      initialRef.current = { title, author, description, price, condition, listingType, lookingFor, shippingType, shippingDetails, existingImages: [...existingImages, ...newUrls] };

      // Invalidate cache so MyBooksScreen + HomeScreen refresh
      useDataStore.getState().invalidateMyBooks();
      useDataStore.getState().invalidateHome();

      navigation.goBack();
    } catch (e: any) {
      Alert.alert(i18n.t('publish.error'), e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  const allImages = [...existingImages, ...images];
  const totalImages = allImages.length;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView style={s.container} contentContainerStyle={[s.content, { paddingBottom: 48 + insets.bottom }]}>

      {/* ── Photos ── */}
      <Text style={[s.label, isRTL && s.rAlign]}>{i18n.t('publish.photos')}</Text>
      <View style={s.imagesRow}>
        {existingImages.map((uri, i) => (
          <View key={`existing-${i}`} style={s.imgWrap}>
            <Image source={{ uri }} style={s.imgPreview} />
            <TouchableOpacity style={s.removeImg} onPress={() => removeExistingImage(i)}>
              <Ionicons name="close-circle" size={20} color={C.red} />
            </TouchableOpacity>
          </View>
        ))}
        {images.map((uri, i) => (
          <View key={`new-${i}`} style={s.imgWrap}>
            <Image source={{ uri }} style={s.imgPreview} />
            <TouchableOpacity style={s.removeImg} onPress={() => removeNewImage(i)}>
              <Ionicons name="close-circle" size={20} color={C.red} />
            </TouchableOpacity>
          </View>
        ))}
        {totalImages < 3 && (
          <TouchableOpacity style={s.addImgBtn} onPress={pickImage}>
            <Ionicons name="add" size={28} color={C.primary} />
            <Text style={s.addImgText}>{i18n.t('publish.gallery')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Listing Type ── */}
      <Text style={[s.label, isRTL && s.rAlign]}>{i18n.t('publish.listingType')} *</Text>
      <View style={s.pills}>
        {LISTING_TYPES.map(type => (
          <TouchableOpacity
            key={type.value}
            style={[s.pill, listingType === type.value && s.pillActive]}
            onPress={() => setListingType(type.value as any)}
          >
            <Text style={[s.pillText, listingType === type.value && s.pillTextActive]}>
              {type.icon} {isRTL ? type.labelHe : type.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Title ── */}
      <Text style={[s.label, isRTL && s.rAlign]}>{i18n.t('publish.bookTitle')} *</Text>
      <TextInput
        style={[s.input, isRTL && s.rInput]}
        value={title}
        onChangeText={setTitle}
        placeholder={i18n.t('publish.titlePlaceholder')}
        textAlign={isRTL ? 'right' : 'left'}
      />

      {/* ── Author ── */}
      <Text style={[s.label, isRTL && s.rAlign]}>{i18n.t('publish.author')} *</Text>
      <TextInput
        style={[s.input, isRTL && s.rInput]}
        value={author}
        onChangeText={setAuthor}
        placeholder={i18n.t('publish.authorPlaceholder')}
        textAlign={isRTL ? 'right' : 'left'}
      />

      {/* ── Condition ── */}
      <Text style={[s.label, isRTL && s.rAlign]}>{i18n.t('publish.condition')} *</Text>
      <View style={s.conditionPills}>
        {BOOK_CONDITIONS.map(cond => (
          <TouchableOpacity
            key={cond.value}
            style={[s.condPill, condition === cond.value && s.condPillActive]}
            onPress={() => setCondition(cond.value)}
          >
            <Text style={[s.condPillText, condition === cond.value && s.condPillTextActive]}>
              {isRTL ? cond.labelHe : cond.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Price ── */}
      {listingType === 'sale' && (
        <>
          <Text style={[s.label, isRTL && s.rAlign]}>{i18n.t('publish.price')} *</Text>
          <TextInput
            style={[s.input, isRTL && s.rInput]}
            value={price}
            onChangeText={setPrice}
            placeholder={i18n.t('publish.pricePlaceholder')}
            keyboardType="numeric"
          />
        </>
      )}

      {/* ── Looking For ── */}
      {listingType === 'trade' && (
        <>
          <Text style={[s.label, isRTL && s.rAlign]}>{i18n.t('publish.lookingFor')} *</Text>
          <TextInput
            style={[s.input, isRTL && s.rInput]}
            value={lookingFor}
            onChangeText={setLookingFor}
            placeholder={i18n.t('publish.lookingForPlaceholder')}
            multiline
            textAlign={isRTL ? 'right' : 'left'}
          />
        </>
      )}

      {/* ── Shipping ── */}
      <Text style={[s.label, isRTL && s.rAlign]}>{isRTL ? 'משלוח' : 'Shipping'}</Text>
      <View style={s.shippingRow}>
        {(['pickup', 'shipping'] as const).map(opt => (
          <TouchableOpacity
            key={opt}
            style={[s.shippingChip, shippingType === opt && s.shippingChipActive]}
            onPress={() => setShippingType(opt)}
            activeOpacity={0.8}
          >
            <Text style={[s.shippingChipText, shippingType === opt && s.shippingChipTextActive]}>
              {opt === 'pickup'
                ? (isRTL ? 'איסוף עצמי' : 'Pickup only')
                : (isRTL ? 'משלוח' : 'Shipping')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {shippingType === 'shipping' && (
        <TextInput
          style={[s.input, s.textArea, isRTL && s.rInput]}
          value={shippingDetails}
          onChangeText={setShippingDetails}
          placeholder={isRTL ? 'פרטי משלוח (לדוגמה: חינם עד 20 ק"מ, 30 ₪ לכל הארץ)' : 'Shipping details (e.g. free locally, ₪30 nationwide)'}
          multiline
          textAlign={isRTL ? 'right' : 'left'}
        />
      )}

      {/* ── Description ── */}
      <Text style={[s.label, isRTL && s.rAlign]}>{i18n.t('publish.description')}</Text>
      <TextInput
        style={[s.input, s.textArea, isRTL && s.rInput]}
        value={description}
        onChangeText={setDescription}
        placeholder={i18n.t('publish.descriptionPlaceholder')}
        multiline
        numberOfLines={4}
        textAlign={isRTL ? 'right' : 'left'}
      />

      {/* ── Update Button ── */}
      <TouchableOpacity
        style={[s.updateBtn, saving && s.updateBtnDisabled]}
        onPress={handleUpdate}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color={C.white} />
        ) : (
          <Text style={s.updateBtnText}>
            {isRTL ? 'עדכן ספר' : 'Update Book'}
          </Text>
        )}
      </TouchableOpacity>
    </ScrollView>
    <Toast {...toast} />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content:   { padding: 20 },
  centered:  { flex: 1, justifyContent: 'center', alignItems: 'center' },

  label: { fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 8, marginTop: 20 },
  rAlign: { textAlign: 'right' },

  // Images
  imagesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  imgWrap:   { position: 'relative' },
  imgPreview: { width: 90, height: 110, borderRadius: 10, backgroundColor: C.border },
  removeImg: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: C.white,
    borderRadius: 10,
  },
  addImgBtn: {
    width: 90,
    height: 110,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: C.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.white,
  },
  addImgText: { fontSize: 11, color: C.muted, fontWeight: '500' },

  // Listing type pills
  pills: { flexDirection: 'row', gap: 8 },
  pill: {
    flex: 1,
    backgroundColor: '#f5f5f4',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  pillActive: { borderColor: C.primary + '60', backgroundColor: C.primaryLight },
  pillText:   { fontSize: 13, fontWeight: '600', color: C.muted },
  pillTextActive: { color: C.primary },

  // Condition pills
  conditionPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  condPill: {
    backgroundColor: '#f5f5f4',
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  condPillActive: { borderColor: C.primary + '60', backgroundColor: C.primaryLight },
  condPillText:   { fontSize: 13, color: C.sub },
  condPillTextActive: { color: C.primary, fontWeight: '600' },
  shippingRow:            { flexDirection: 'row', gap: 8 },
  shippingChip:           { flex: 1, paddingVertical: 11, borderRadius: 12, alignItems: 'center', backgroundColor: '#f5f5f4' },
  shippingChipActive:     { backgroundColor: C.primaryLight, borderColor: C.primary + '60' },
  shippingChipText:       { fontSize: 14, fontWeight: '500', color: C.sub },
  shippingChipTextActive: { color: C.primary, fontWeight: '600' },

  // Inputs
  input: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: C.text,
  },
  rInput:   { textAlign: 'right' },
  textArea: { minHeight: 100, textAlignVertical: 'top' },

  // Update button
  updateBtn: {
    backgroundColor: C.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  updateBtnDisabled: { opacity: 0.5 },
  updateBtnText: { color: C.white, fontSize: 16, fontWeight: '600' },
});
