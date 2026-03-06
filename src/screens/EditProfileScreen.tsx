import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { compressImage } from '../lib/imageUtils';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';
import { supabase } from '../lib/supabase';
import i18n from '../lib/i18n';
import { GENRES_META } from '../constants/books';
import { CityPickerModal } from '../components/CityPickerModal';
import { GenrePickerModal } from '../components/GenrePickerModal';

const C = {
  bg: '#fafaf9',
  white: '#ffffff',
  border: '#e7e5e4',
  text: '#1c1917',
  sub: '#78716c',
  muted: '#a8a29e',
  primary: '#2563eb',
  primaryLight: '#eff6ff',
};

export default function EditProfileScreen() {
  const navigation = useNavigation<any>();
  const { user, profile, setProfile } = useAuthStore();
  const { isRTL } = useLanguageStore();
  const [name, setName]         = useState(profile?.name || '');
  const [bio, setBio]           = useState(profile?.bio || '');
  const [city, setCity]         = useState(profile?.city || '');
  const [avatarUri, setAvatarUri] = useState(profile?.avatar_url || '');
  const [avatarChanged, setAvatarChanged] = useState(false);
  const [loading, setLoading]               = useState(false);
  const [saved, setSaved]                   = useState(false);
  const [showCityPicker, setShowCityPicker]   = useState(false);
  const [showGenrePicker, setShowGenrePicker] = useState(false);
  const [pendingAction, setPendingAction]   = useState<any>(null);
  const [favoriteGenres, setFavoriteGenres] = useState<string[]>(
    profile?.favorite_genres ?? []
  );

  const initialRef = useRef({
    name:           profile?.name      || '',
    bio:            profile?.bio       || '',
    city:           profile?.city      || '',
    avatarUri:      profile?.avatar_url || '',
    favoriteGenres: profile?.favorite_genres ?? [] as string[],
  });

  const genresDirty =
    favoriteGenres.length !== initialRef.current.favoriteGenres.length ||
    favoriteGenres.some(g => !initialRef.current.favoriteGenres.includes(g));

  const isDirty =
    name      !== initialRef.current.name      ||
    bio       !== initialRef.current.bio       ||
    city      !== initialRef.current.city      ||
    avatarChanged ||
    genresDirty;

  // Stable refs so the beforeRemove listener always reads fresh values without re-registering
  const isDirtyRef    = useRef(false);
  const loadingRef    = useRef(false);
  const handleSaveRef = useRef<() => Promise<void>>();
  isDirtyRef.current    = isDirty;
  loadingRef.current    = loading;

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      if (!isDirtyRef.current || loadingRef.current) return;
      e.preventDefault();
      setPendingAction(e.data.action);
    });
    return unsubscribe;
  }, [navigation, isRTL]); // deps are minimal — state is read via refs

  useEffect(() => {
    navigation.setOptions({ title: isRTL ? 'ערוך פרופיל' : 'Edit Profile' });
  }, [navigation, isRTL]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(i18n.t('publish.permissionNeeded'), i18n.t('publish.allowPhotos'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1, // compress manually below
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      // Validate: only allow image MIME types
      const mimeOk = !asset.mimeType || asset.mimeType.startsWith('image/');
      if (!mimeOk) {
        Alert.alert(
          isRTL ? 'קובץ לא נתמך' : 'Unsupported file',
          isRTL ? 'ניתן להעלות רק תמונות (JPEG, PNG, WEBP)' : 'Only image files are allowed (JPEG, PNG, WEBP)',
        );
        return;
      }
      // Compress to JPEG ≤1920px
      const compressed = await compressImage(asset.uri);
      setAvatarUri(compressed);
      setAvatarChanged(true);
    }
  };

  const uploadAvatar = async (localUri: string): Promise<string> => {
    const ext  = localUri.split('.').pop()?.split('?')[0] || 'jpg';
    const path = `avatars/${user!.id}/${Date.now()}.${ext}`;

    const response = await fetch(localUri);
    const blob     = await response.blob();

    const { data, error } = await supabase.storage
      .from('book-images')
      .upload(path, blob, { contentType: 'image/jpeg', upsert: true });

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from('book-images')
      .getPublicUrl(data.path);

    return publicUrl;
  };

  const handleSave = async () => {
    if (!name || !city) {
      Alert.alert(i18n.t('common.error'), i18n.t('auth.fillAllFields'));
      return;
    }

    setLoading(true);
    try {
      let finalAvatarUrl = profile?.avatar_url ?? null;

      // Upload new avatar to Supabase Storage if the user picked one
      if (avatarChanged && avatarUri) {
        finalAvatarUrl = await uploadAvatar(avatarUri);
      }

      const { error } = await supabase
        .from('profiles')
        .update({ name, bio, city, avatar_url: finalAvatarUrl, favorite_genres: favoriteGenres })
        .eq('id', user?.id);

      if (error) throw error;

      setProfile({ ...profile, name, bio, city, avatar_url: finalAvatarUrl, favorite_genres: favoriteGenres });

      // Clear dirty state so the beforeRemove guard doesn't block navigation
      initialRef.current = { name, bio, city, avatarUri: finalAvatarUrl || '', favoriteGenres };

      setSaved(true);
      setTimeout(() => navigation.goBack(), 900);
    } catch (error: any) {
      Alert.alert(i18n.t('common.error'), error.message);
    } finally {
      setLoading(false);
    }
  };
  // Keep ref in sync on every render so the beforeRemove listener always calls the latest closure
  handleSaveRef.current = handleSave;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView style={s.container} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

      {/* ── Avatar ── */}
      <View style={s.avatarSection}>
        <TouchableOpacity onPress={pickImage} style={s.avatarWrap}>
          <View style={[s.avatar, s.avatarFallback]}>
            <Text style={s.avatarInitial}>{name?.charAt(0).toUpperCase() || 'U'}</Text>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
            ) : null}
          </View>
          <View style={s.cameraBadge}>
            <Ionicons name="camera" size={14} color={C.white} />
          </View>
        </TouchableOpacity>
        <Text style={s.changeLabel}>
          {isRTL ? 'לחץ לשינוי תמונה' : 'Tap to change photo'}
        </Text>
      </View>

      {/* ── Fields ── */}
      <Text style={[s.label, isRTL && s.rAlign]}>{i18n.t('auth.name')}</Text>
      <TextInput
        style={[s.input, isRTL && s.rInput]}
        value={name}
        onChangeText={setName}
        placeholder={i18n.t('auth.name')}
        textAlign={isRTL ? 'right' : 'left'}
      />

      <Text style={[s.label, isRTL && s.rAlign]}>{isRTL ? 'ביוגרפיה' : 'Bio'}</Text>
      <TextInput
        style={[s.input, s.inputMulti, isRTL && s.rInput]}
        value={bio}
        onChangeText={setBio}
        placeholder={isRTL ? 'ספר קצת על עצמך...' : 'Tell us a bit about yourself...'}
        textAlign={isRTL ? 'right' : 'left'}
        multiline
        numberOfLines={3}
        maxLength={200}
      />

      <Text style={[s.label, isRTL && s.rAlign]}>{i18n.t('auth.city')}</Text>
      <TouchableOpacity
        style={[s.input, s.cityBtn, isRTL && { flexDirection: 'row-reverse' }]}
        onPress={() => setShowCityPicker(true)}
        activeOpacity={0.8}
      >
        <Ionicons name="location-outline" size={16} color={C.muted} />
        <Text style={[s.cityBtnTxt, !city && s.cityBtnPlaceholder, isRTL && { textAlign: 'right' }]}>
          {city || (isRTL ? 'בחרו עיר' : 'Select city')}
        </Text>
        <Ionicons name="chevron-down" size={15} color={C.muted} />
      </TouchableOpacity>

      {/* ── Favourite genres ── */}
      <View style={[s.genreLabelRow, isRTL && { flexDirection: 'row-reverse' }]}>
        <Text style={[s.label, { marginTop: 18, marginBottom: 0 }]}>
          {isRTL ? 'ז׳אנרים מועדפים' : 'Favourite Genres'}
        </Text>
        {favoriteGenres.length > 0 && (
          <View style={s.genreCountBadge}>
            <Text style={s.genreCountTxt}>{favoriteGenres.length}</Text>
          </View>
        )}
      </View>
      <TouchableOpacity
        style={[s.input, s.cityBtn, isRTL && { flexDirection: 'row-reverse' }]}
        onPress={() => setShowGenrePicker(true)}
        activeOpacity={0.8}
      >
        <Ionicons name="library-outline" size={16} color={favoriteGenres.length > 0 ? C.primary : C.muted} />
        <Text style={[s.cityBtnTxt, favoriteGenres.length === 0 && s.cityBtnPlaceholder, isRTL && { textAlign: 'right' }, favoriteGenres.length > 0 && { color: C.primary }]}>
          {favoriteGenres.length === 0
            ? (isRTL ? "בחר ז'אנרים..." : 'Select genres...')
            : favoriteGenres.length === 1
              ? (isRTL ? GENRES_META.find(g => g.key === favoriteGenres[0])?.he : GENRES_META.find(g => g.key === favoriteGenres[0])?.en) ?? favoriteGenres[0]
              : `${favoriteGenres.length} ${isRTL ? "ז'אנרים" : 'genres'}`}
        </Text>
        <Ionicons name="chevron-down" size={15} color={favoriteGenres.length > 0 ? C.primary : C.muted} />
      </TouchableOpacity>

      <Text style={[s.label, isRTL && s.rAlign]}>{i18n.t('auth.email')}</Text>
      <TextInput
        style={[s.input, s.inputDisabled, isRTL && s.rInput]}
        value={user?.email || ''}
        editable={false}
        textAlign={isRTL ? 'right' : 'left'}
      />

      {/* ── Save ── */}
      <TouchableOpacity
        style={[s.saveBtn, (loading || saved) && s.saveBtnDisabled, saved && s.saveBtnSaved]}
        onPress={handleSave}
        disabled={loading || saved}
      >
        {loading ? (
          <ActivityIndicator color={C.white} />
        ) : saved ? (
          <>
            <Ionicons name="checkmark" size={18} color={C.white} />
            <Text style={s.saveBtnText}>{isRTL ? 'נשמר!' : 'Saved!'}</Text>
          </>
        ) : (
          <Text style={s.saveBtnText}>{i18n.t('common.save')}</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
    <CityPickerModal
      visible={showCityPicker}
      selected={city}
      isRTL={isRTL}
      onSelect={setCity}
      onClose={() => setShowCityPicker(false)}
    />
    <GenrePickerModal
      visible={showGenrePicker}
      selected={favoriteGenres}
      isRTL={isRTL}
      onChange={setFavoriteGenres}
      onClose={() => setShowGenrePicker(false)}
    />
    {pendingAction && (
      <Pressable style={s.overlayBackdrop} onPress={() => setPendingAction(null)}>
        <Pressable style={s.overlaySheet} onPress={() => {}}>
          <View style={s.overlayHandle} />
          <Text style={s.overlayTitle}>
            {isRTL ? 'לשמור שינויים?' : 'Save changes?'}
          </Text>
          <Text style={s.overlaySub}>
            {isRTL ? 'יש לך שינויים שלא נשמרו.' : 'You have unsaved changes.'}
          </Text>
          <TouchableOpacity
            style={s.overlaySaveBtn}
            onPress={async () => {
              setPendingAction(null);
              await handleSaveRef.current?.();
            }}
          >
            <Text style={s.overlaySaveTxt}>{isRTL ? 'שמור' : 'Save'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.overlayDiscardBtn}
            onPress={() => {
              const action = pendingAction;
              setPendingAction(null);
              navigation.dispatch(action);
            }}
          >
            <Text style={s.overlayDiscardTxt}>{isRTL ? 'בטל שינויים' : 'Discard changes'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.overlayKeepBtn}
            onPress={() => setPendingAction(null)}
          >
            <Text style={s.overlayKeepTxt}>{isRTL ? 'המשך עריכה' : 'Keep editing'}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    )}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content:   { padding: 20, paddingBottom: 48 },

  avatarSection: { alignItems: 'center', marginVertical: 28 },
  avatarWrap:    { position: 'relative' },
  avatar:        { width: 120, height: 120, borderRadius: 60, overflow: 'hidden' },
  avatarFallback: {
    backgroundColor: C.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: { fontSize: 44, fontWeight: '700', color: C.primary },
  cameraBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: C.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: C.white,
  },
  changeLabel: { marginTop: 10, fontSize: 13, color: C.sub, fontWeight: '500' },

  label: { fontSize: 13, fontWeight: '600', color: C.sub, marginBottom: 6, marginTop: 18 },
  input: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: C.text,
  },
  inputMulti:    { minHeight: 80, paddingTop: 12, textAlignVertical: 'top' },
  rInput:        { textAlign: 'right' },
  inputDisabled: { backgroundColor: '#f5f5f4', color: C.muted },

  cityBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 13,
  },
  cityBtnTxt:         { flex: 1, fontSize: 16, color: C.text },
  cityBtnPlaceholder: { color: C.muted },


  genreLabelRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4,
  },
  genreCountBadge: {
    backgroundColor: C.primaryLight, borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 1, marginTop: 18,
  },
  genreCountTxt: { fontSize: 12, fontWeight: '700', color: C.primary },
  saveBtn: {
    backgroundColor: C.primary,
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  saveBtnDisabled: { opacity: 0.85 },
  saveBtnSaved: { backgroundColor: '#059669', opacity: 1 },
  saveBtnText: { color: C.white, fontSize: 16, fontWeight: '600' },

  rAlign: { textAlign: 'right' },

  overlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28,25,23,0.55)',
    justifyContent: 'flex-end',
    zIndex: 100,
  },
  overlaySheet: {
    backgroundColor: C.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  overlayHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: 'center', marginBottom: 20,
  },
  overlayTitle: { fontSize: 18, fontWeight: '700', color: C.text, textAlign: 'center', marginBottom: 6 },
  overlaySub:   { fontSize: 14, color: C.sub, textAlign: 'center', marginBottom: 24 },
  overlaySaveBtn: {
    backgroundColor: C.primary, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginBottom: 10,
  },
  overlaySaveTxt: { color: C.white, fontSize: 16, fontWeight: '600' },
  overlayDiscardBtn: {
    backgroundColor: '#fef2f2', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginBottom: 6,
    borderWidth: 1, borderColor: '#fecaca',
  },
  overlayDiscardTxt: { color: '#ef4444', fontSize: 16, fontWeight: '600' },
  overlayKeepBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  overlayKeepTxt: { color: C.sub, fontSize: 16, fontWeight: '500' },
});
