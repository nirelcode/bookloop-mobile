/**
 * PublishScreen — phase-based flow:
 *   idle → ready → scanning → review
 *
 * Manual crop editor mirrors the web app's react-easy-crop behavior:
 *   • Fixed 2:3 portrait frame — image pans/zooms behind it
 *   • initialCroppedAreaPixels → auto-positions on the AI bounding box
 *   • Saves pixel-accurate crop area in original image space
 *   • Restores exact pan/zoom state on re-open (Priority 1)
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Modal, FlatList, Image, Alert,
  ActivityIndicator, KeyboardAvoidingView, Platform,
  Dimensions, PanResponder, Pressable,
  LayoutAnimation, UIManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuthStore }     from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';
import { useDataStore }     from '../stores/dataStore';
import { supabase }         from '../lib/supabase';
import { detectBooksInPhoto, BatchBookResult } from '../lib/aiBookDetection';
import { compressImage, cropBookFromBBox, getImageDimensions, cropImage, rotateImage } from '../lib/imageUtils';
import { BOOK_CONDITIONS, LISTING_TYPES, BOOK_GENRES, CITIES } from '../constants/books';
import { CITY_COORDS } from '../constants/categoryGenreMap';
import { GenrePickerModal } from '../components/GenrePickerModal';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ── Constants ─────────────────────────────────────────────────────────────────

const C = {
  bg: '#f8fafc', white: '#ffffff', border: '#e2e8f0',
  text: '#1e293b', sub: '#64748b', muted: '#94a3b8',
  primary: '#2563eb', primaryLight: '#eff6ff', primaryMid: '#dbeafe',
  purple: '#7c3aed', purpleLight: '#f5f3ff',
  emerald: '#059669', emeraldLight: '#d1fae5',
  amber: '#f59e0b', amberLight: '#fef3c7',
  red: '#ef4444', redLight: '#fee2e2',
};

const LISTING_COLORS: Record<string, string> = {
  free: C.emerald, sale: C.primary, trade: C.amber,
};

const BUNDLE_SESSION_KEY = 'bundle_session_v1';
const BUNDLE_SESSION_TTL = 30 * 60 * 1000;

type Phase       = 'idle' | 'ready' | 'scanning' | 'review';
type ListingType = 'free' | 'sale' | 'trade';

/** Pixel coordinates of the selected crop area in the ORIGINAL image. */
interface CropAreaPixels { x: number; y: number; width: number; height: number; }

/** Pan + zoom state — saved so the editor reopens at the exact same position. */
interface CropState { crop: { x: number; y: number }; zoom: number; }

// ── Bundle book type ──────────────────────────────────────────────────────────

interface BundleBook {
  id: string;
  title: string;
  author: string;
  confidence: number;
  genres: string[];
  condition: string;
  description: string;
  croppedUri: string;
  expanded: boolean;
  /** Normalised 0–1 bounding box from AI — used to auto-position the crop editor. */
  boundingBox?: { x: number; y: number; width: number; height: number };
  /** Whether the thumbnail was manually cropped (shows 'Manual' badge) */
  manualCropped?: boolean;
}

// ── Upload helper ─────────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

async function uploadImageToStorage(localUri: string, userId: string): Promise<string> {
  const compressed = await withTimeout(compressImage(localUri), 20000, 'Image compression');
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;

  const res = await withTimeout(fetch(compressed), 15000, 'Image read');
  if (!res.ok) throw new Error(`Failed to read image (${res.status})`);
  const arrayBuffer = await withTimeout(res.arrayBuffer(), 15000, 'Image buffer');

  const { data, error } = await withTimeout(
    supabase.storage.from('book-images').upload(path, arrayBuffer, { contentType: 'image/jpeg', upsert: false }),
    30000, 'Storage upload'
  );

  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data: { publicUrl } } = supabase.storage
    .from('book-images')
    .getPublicUrl(data.path);

  return publicUrl;
}

// ── City Picker Modal ─────────────────────────────────────────────────────────

function CityPickerModal({ visible, city, onSelect, onClose, isRTL }: {
  visible: boolean; city: string; onSelect: (c: string) => void;
  onClose: () => void; isRTL: boolean;
}) {
  const [q, setQ] = useState('');
  const insets    = useSafeAreaInsets();
  const filtered  = q.trim() ? CITIES.filter(c => c.includes(q.trim())) : [...CITIES];

  const handleClose = () => { setQ(''); onClose(); };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <Pressable style={shCity.overlay} onPress={handleClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={shCity.kav}>
          <Pressable style={[shCity.sheet, { paddingBottom: insets.bottom + 12 }]} onPress={() => {}}>
            <View style={shCity.handle} />
            <View style={shCity.header}>
              <Text style={shCity.title}>{isRTL ? 'בחר עיר' : 'Select City'}</Text>
              <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color="#78716c" />
              </TouchableOpacity>
            </View>
            <View style={shCity.searchRow}>
              <Ionicons name="search-outline" size={16} color="#a8a29e" />
              <TextInput
                style={[shCity.searchInput, isRTL && { textAlign: 'right' }]}
                value={q}
                onChangeText={setQ}
                placeholder={isRTL ? 'חפש עיר...' : 'Search city...'}
                placeholderTextColor="#a8a29e"
                autoFocus
              />
              {q.length > 0 && (
                <TouchableOpacity onPress={() => setQ('')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Ionicons name="close-circle" size={16} color="#a8a29e" />
                </TouchableOpacity>
              )}
            </View>
            <FlatList
              data={filtered}
              keyExtractor={item => item}
              keyboardShouldPersistTaps="handled"
              style={shCity.list}
              renderItem={({ item }) => {
                const active = item === city;
                return (
                  <TouchableOpacity
                    style={[shCity.row, active && shCity.rowActive]}
                    onPress={() => { onSelect(item); handleClose(); }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="location-outline" size={16} color={active ? '#2563eb' : '#a8a29e'} />
                    <Text style={[shCity.cityName, active && shCity.cityNameActive]}>{item}</Text>
                    {active && <Ionicons name="checkmark" size={16} color="#2563eb" />}
                  </TouchableOpacity>
                );
              }}
            />
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const shCity = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  kav:        { flex: 1, justifyContent: 'flex-end' },
  sheet:      { backgroundColor: '#ffffff', borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '92%' },
  handle:     { width: 40, height: 4, borderRadius: 2, backgroundColor: '#e7e5e4', alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#e7e5e4' },
  title:      { fontSize: 17, fontWeight: '700', color: '#1c1917' },
  searchRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 16, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#f5f5f4', borderRadius: 12, borderWidth: 1, borderColor: '#e7e5e4' },
  searchInput:{ flex: 1, fontSize: 14, color: '#1c1917', padding: 0 },
  list:       { flex: 1 },
  row:        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#f5f5f4' },
  rowActive:      { backgroundColor: '#eff6ff' },
  cityName:       { flex: 1, fontSize: 15, color: '#1c1917' },
  cityNameActive: { color: '#2563eb', fontWeight: '600' },
});

// ── ListingTypePicker ─────────────────────────────────────────────────────────

const LISTING_ICONS: Record<string, string> = {
  free:  'gift-outline',
  sale:  'pricetag-outline',
  trade: 'swap-horizontal-outline',
};

function ListingTypePicker({ value, onChange, isRTL }: {
  value: ListingType; onChange: (v: ListingType) => void; isRTL: boolean;
}) {
  return (
    <View style={sh.row3}>
      {LISTING_TYPES.map(t => {
        const active = value === t.value;
        const color  = LISTING_COLORS[t.value];
        return (
          <TouchableOpacity
            key={t.value}
            style={[sh.ltCard, active && { borderColor: color, backgroundColor: color + '12' }]}
            onPress={() => onChange(t.value as ListingType)}
            activeOpacity={0.8}
          >
            <View style={[sh.ltIconWrap, { backgroundColor: active ? color + '20' : '#f1f5f9' }]}>
              <Ionicons name={LISTING_ICONS[t.value] as any} size={18} color={active ? color : C.muted} />
            </View>
            <Text style={[sh.ltLabel, { color: active ? color : C.sub }]}>
              {isRTL ? t.labelHe : t.label}
            </Text>
            {active && <View style={[sh.ltDot, { backgroundColor: color }]} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── ConditionPicker ───────────────────────────────────────────────────────────

function ConditionPicker({ value, onChange, isRTL }: {
  value: string; onChange: (v: string) => void; isRTL: boolean;
}) {
  return (
    <View style={sh.chipRow}>
      {BOOK_CONDITIONS.map(c => {
        const active = value === c.value;
        return (
          <TouchableOpacity
            key={c.value}
            style={[sh.chip, active && sh.chipActive]}
            onPress={() => onChange(c.value)}
          >
            <Text style={[sh.chipText, active && sh.chipTextActive]}>
              {isRTL ? c.labelHe : c.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── CameraCapture (idle phase) ────────────────────────────────────────────────

function CameraCapture({ onPhotoTaken, onGallery, isRTL }: {
  onPhotoTaken: (uri: string) => void;
  onGallery: () => void;
  isRTL: boolean;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const cameraRef = useRef<CameraView>(null);
  const insets    = useSafeAreaInsets();

  if (!permission) {
    return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  }

  if (!permission.granted) {
    return (
      <View style={sh.permContainer}>
        <Ionicons name="camera-outline" size={64} color={C.muted} style={{ marginBottom: 20 }} />
        <Text style={sh.permTitle}>
          {isRTL ? 'נדרשת גישה למצלמה' : 'Camera Access Required'}
        </Text>
        <TouchableOpacity style={sh.grantBtn} onPress={requestPermission} activeOpacity={0.85}>
          <Text style={sh.grantBtnText}>
            {isRTL ? 'אפשר גישה למצלמה' : 'Grant Camera Access'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onGallery} style={{ marginTop: 16 }}>
          <Text style={sh.galleryLink}>
            {isRTL ? 'בחר מהגלריה' : 'Choose from Gallery'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const takePicture = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.95 });
      if (photo?.uri) onPhotoTaken(photo.uri);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} />
      <View style={{ flex: 1 }} />
      <View style={[sh.camBottomBar, { paddingBottom: insets.bottom + 20 }]}>
        <TouchableOpacity style={sh.camSideBtn} onPress={onGallery}>
          <Ionicons name="images-outline" size={28} color={C.white} />
        </TouchableOpacity>
        <TouchableOpacity style={sh.shutterOuter} onPress={takePicture} activeOpacity={0.8}>
          <View style={sh.shutterInner} />
        </TouchableOpacity>
        <TouchableOpacity
          style={sh.camSideBtn}
          onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}
        >
          <Ionicons name="camera-reverse-outline" size={28} color={C.white} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── ManualCropModal ───────────────────────────────────────────────────────────
//
// Mirrors react-easy-crop (web app):
//   • Fixed 2:3 portrait crop frame — always centered
//   • Image pans and zooms BEHIND the frame (frame never moves)
//   • initialCroppedAreaPixels → computes initial pan+zoom to show that area
//   • onSave returns pixel-accurate crop area in original image space
//   • Zoom: 1× – 3× via pinch gesture + slider
//   • Pan clamped so the crop frame never leaves the image boundary
//

/** Compute which frame size fits inside the image container at 2:3 ratio. */
function computeFrameSize(cW: number, cH: number) {
  const maxByWidth  = { w: cW * 0.82, h: cW * 0.82 * 1.5 };
  const maxByHeight = { w: cH * 0.88 * (2 / 3), h: cH * 0.88 };
  if (maxByWidth.h <= cH * 0.88) return maxByWidth;
  return maxByHeight;
}

/** Clamp pan so the image always fully covers the crop frame. */
function clampPanValues(
  px: number, py: number, z: number,
  natW: number, natH: number,
  frameW: number, frameH: number,
  baseScale: number,
) {
  const imgW = natW * baseScale * z;
  const imgH = natH * baseScale * z;
  const maxX = Math.max(0, (imgW - frameW) / 2);
  const maxY = Math.max(0, (imgH - frameH) / 2);
  return { x: Math.max(-maxX, Math.min(maxX, px)), y: Math.max(-maxY, Math.min(maxY, py)) };
}

/** Convert initialCroppedAreaPixels to pan+zoom that centers that area in the frame. */
function computeInitialFromBbox(
  cap: CropAreaPixels,
  natW: number, natH: number,
  frameW: number, frameH: number,
): { panX: number; panY: number; zoom: number } {
  const base = Math.max(frameW / natW, frameH / natH);
  // Zoom so that bbox fills the frame (use min → show entire book, never cut off)
  const z = Math.max(1, Math.min(5,
    Math.min(frameW / (cap.width * base), frameH / (cap.height * base))
  ));
  // Pan so bbox center aligns with frame center
  const panX = (natW / 2 - (cap.x + cap.width  / 2)) * base * z;
  const panY = (natH / 2 - (cap.y + cap.height / 2)) * base * z;
  return { panX, panY, zoom: z };
}

/** Return the pixel crop area in the ORIGINAL image from the current pan+zoom state. */
function computeCropArea(
  panX: number, panY: number, zoom: number,
  natW: number, natH: number,
  frameW: number, frameH: number,
  baseScale: number,
): CropAreaPixels {
  const eff = baseScale * zoom;
  // Frame top-left in image pixel space:
  const x = natW / 2 - frameW / (2 * eff) - panX / eff;
  const y = natH / 2 - frameH / (2 * eff) - panY / eff;
  const w = frameW / eff;
  const h = frameH / eff;
  return {
    x:      Math.round(Math.max(0, x)),
    y:      Math.round(Math.max(0, y)),
    width:  Math.round(Math.min(w, natW - Math.max(0, x))),
    height: Math.round(Math.min(h, natH - Math.max(0, y))),
  };
}

function ManualCropModal({
  visible, sourceUri, bookTitle,
  onSave, onCancel, isRTL,
  initialCrop, initialZoom, initialCroppedAreaPixels,
}: {
  visible:                   boolean;
  sourceUri:                 string;
  bookTitle:                 string;
  onSave:   (area: CropAreaPixels, state: CropState) => void;
  onCancel: () => void;
  isRTL:    boolean;
  initialCrop?:              { x: number; y: number };
  initialZoom?:              number;
  initialCroppedAreaPixels?: CropAreaPixels;
}) {
  // ── View state ────────────────────────────────────────────────────────────
  const [panX, setPanX]           = useState(0);
  const [panY, setPanY]           = useState(0);
  const [zoom, setZoom]           = useState(1);
  const [natSize, setNatSize]     = useState({ w: 0, h: 0 });
  const [containerSz, setContSz]  = useState({ w: 0, h: 0 });
  const [saving, setSaving]       = useState(false);
  const [ready, setReady]         = useState(false); // image + frame ready to render

  // ── Always-current refs (read by PanResponders created once in useRef) ────
  const panXRef       = useRef(0);
  const panYRef       = useRef(0);
  const zoomRef       = useRef(1);
  const natWRef       = useRef(0);
  const natHRef       = useRef(0);
  const frameWRef     = useRef(0);
  const frameHRef     = useRef(0);
  const baseScaleRef  = useRef(1);
  const contWRef      = useRef(0);
  const contHRef      = useRef(0);
  // Per-frame gesture tracking (delta-based — avoids jump on finger-count change)
  const prevCenterRef  = useRef({ x: 0, y: 0 });
  const prevDistRef    = useRef(0);
  const prevTouchNRef  = useRef(0);
  // Slider
  const sliderWRef     = useRef(0);
  const sliderPageXRef = useRef(0);
  const sliderRef      = useRef<View>(null);
  // Flag: did we already init from bbox this modal open?
  const bboxInitRef   = useRef(false);

  // ── Load image + restore state when modal opens ───────────────────────────
  useEffect(() => {
    if (!visible || !sourceUri) return;
    setReady(false);
    bboxInitRef.current = false;

    // Apply Priority 1 (saved state) or reset to defaults for Priority 2/3
    const px = initialCrop?.x ?? 0;
    const py = initialCrop?.y ?? 0;
    const z  = initialZoom ?? 1;
    setPanX(px); panXRef.current = px;
    setPanY(py); panYRef.current = py;
    setZoom(z);  zoomRef.current = z;

    setNatSize({ w: 0, h: 0 });
    setContSz({ w: 0, h: 0 });

    getImageDimensions(sourceUri).then(({ width, height }) => {
      setNatSize({ w: width, h: height });
      natWRef.current = width;
      natHRef.current = height;
    }).catch(() => {});
  }, [visible, sourceUri]); // intentionally omits initialCrop/initialZoom

  // ── Once container + nat size known: compute frame, baseScale, bbox init ──
  useEffect(() => {
    if (!containerSz.w || !natSize.w) return;

    const frame = computeFrameSize(containerSz.w, containerSz.h);
    frameWRef.current = frame.w;
    frameHRef.current = frame.h;

    const base = Math.max(frame.w / natSize.w, frame.h / natSize.h);
    baseScaleRef.current = base;

    // Priority 2: auto-position from AI bbox (only if no saved state & not done)
    if (!initialCrop && initialCroppedAreaPixels && !bboxInitRef.current) {
      bboxInitRef.current = true;
      const { panX: px, panY: py, zoom: z } = computeInitialFromBbox(
        initialCroppedAreaPixels, natSize.w, natSize.h, frame.w, frame.h,
      );
      const clamped = clampPanValues(px, py, z, natSize.w, natSize.h, frame.w, frame.h, base);
      setPanX(clamped.x); panXRef.current = clamped.x;
      setPanY(clamped.y); panYRef.current = clamped.y;
      setZoom(z);         zoomRef.current = z;
    }

    setReady(true);
  }, [containerSz, natSize]); // intentionally omits initialCrop/initialCroppedAreaPixels

  // ── Raw touch handlers — bypasses PanResponder entirely ──────────────────
  // PanResponder cannot reliably deliver multi-touch in Fabric (new arch).
  // Raw onTouchStart/Move/End always receive ALL active touches.

  const handleCropTouchStart = useCallback((e: any) => {
    const t = e.nativeEvent.touches;
    const n = t.length;
    const cx = n >= 2 ? (t[0].pageX + t[1].pageX) / 2 : (t[0]?.pageX ?? 0);
    const cy = n >= 2 ? (t[0].pageY + t[1].pageY) / 2 : (t[0]?.pageY ?? 0);
    prevCenterRef.current = { x: cx, y: cy };
    prevDistRef.current   = n >= 2
      ? Math.hypot(t[1].pageX - t[0].pageX, t[1].pageY - t[0].pageY)
      : 0;
    prevTouchNRef.current = n;
  }, []);

  const handleCropTouchMove = useCallback((e: any) => {
    const t = e.nativeEvent.touches;
    const n = t.length;
    const nat   = { w: natWRef.current,   h: natHRef.current   };
    const frame = { w: frameWRef.current, h: frameHRef.current };
    const base  = baseScaleRef.current;

    const cx   = n >= 2 ? (t[0].pageX + t[1].pageX) / 2 : (t[0]?.pageX ?? 0);
    const cy   = n >= 2 ? (t[0].pageY + t[1].pageY) / 2 : (t[0]?.pageY ?? 0);
    const dist = n >= 2 ? Math.hypot(t[1].pageX - t[0].pageX, t[1].pageY - t[0].pageY) : 0;

    // Finger count changed → reset reference point to avoid position/zoom jump
    if (n !== prevTouchNRef.current) {
      prevCenterRef.current = { x: cx, y: cy };
      prevDistRef.current   = dist;
      prevTouchNRef.current = n;
      return;
    }

    const dx = cx - prevCenterRef.current.x;
    const dy = cy - prevCenterRef.current.y;

    let newZoom = zoomRef.current;
    if (n >= 2 && prevDistRef.current > 0) {
      newZoom = Math.max(1, Math.min(5, zoomRef.current * dist / prevDistRef.current));
      zoomRef.current = newZoom;
      setZoom(newZoom);
    }

    prevCenterRef.current = { x: cx, y: cy };
    prevDistRef.current   = dist;
    prevTouchNRef.current = n;

    const rawX = panXRef.current + dx;
    const rawY = panYRef.current + dy;
    const c = clampPanValues(rawX, rawY, newZoom, nat.w, nat.h, frame.w, frame.h, base);
    panXRef.current = c.x; setPanX(c.x);
    panYRef.current = c.y; setPanY(c.y);
  }, []);

  const handleCropTouchEnd = useCallback(() => {
    prevTouchNRef.current = 0;
  }, []);

  // ── Zoom slider PanResponder (created once, reads from refs) ─────────────
  const sliderPR = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,

    onPanResponderGrant: (evt) => { applySlider(evt.nativeEvent.pageX); },
    onPanResponderMove:  (evt) => { applySlider(evt.nativeEvent.pageX); },
    onPanResponderRelease: () => {},
  }));

  // Uses pageX minus the slider's absolute screen position for reliable cross-platform positioning
  function applySlider(pageX: number) {
    const relX  = pageX - sliderPageXRef.current;
    const pct   = Math.max(0, Math.min(1, relX / (sliderWRef.current || 1)));
    const newZoom = 1 + pct * 4; // 1× – 5×
    const base  = baseScaleRef.current;
    const c = clampPanValues(
      panXRef.current, panYRef.current, newZoom,
      natWRef.current, natHRef.current,
      frameWRef.current, frameHRef.current, base,
    );
    zoomRef.current = newZoom; setZoom(newZoom);
    panXRef.current = c.x;    setPanX(c.x);
    panYRef.current = c.y;    setPanY(c.y);
  }

  // ── Reset ─────────────────────────────────────────────────────────────────
  const handleReset = () => {
    const c = clampPanValues(0, 0, 1, natWRef.current, natHRef.current,
      frameWRef.current, frameHRef.current, baseScaleRef.current);
    panXRef.current = c.x; setPanX(c.x);
    panYRef.current = c.y; setPanY(c.y);
    zoomRef.current = 1;   setZoom(1);
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!natSize.w || !containerSz.w) return;
    setSaving(true);
    try {
      const area = computeCropArea(
        panXRef.current, panYRef.current, zoomRef.current,
        natWRef.current, natHRef.current,
        frameWRef.current, frameHRef.current,
        baseScaleRef.current,
      );
      const state: CropState = {
        crop: { x: panXRef.current, y: panYRef.current },
        zoom: zoomRef.current,
      };

      // Generate the cropped image URI using expo-image-manipulator
      const croppedUri = await cropImage(
        sourceUri, area.x, area.y,
        Math.max(1, area.width), Math.max(1, area.height),
      );
      onSave({ ...area, _croppedUri: croppedUri } as any, state);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Derived rendering values ──────────────────────────────────────────────
  const frame      = containerSz.w ? computeFrameSize(containerSz.w, containerSz.h) : { w: 0, h: 0 };
  const base       = natSize.w ? Math.max(frame.w / natSize.w, frame.h / natSize.h) : 1;
  const effScale   = base * zoom;
  const imgW       = natSize.w * effScale;
  const imgH       = natSize.h * effScale;
  const imgLeft    = containerSz.w / 2 + panX - imgW / 2;
  const imgTop     = containerSz.h / 2 + panY - imgH / 2;
  const frameLeft  = containerSz.w / 2 - frame.w / 2;
  const frameTop   = containerSz.h / 2 - frame.h / 2;
  const sliderPct  = (zoom - 1) / 4; // 0–1

  return (
    <Modal visible={visible} animationType="slide" transparent={false} statusBarTranslucent>
      <View style={sh.cropRoot}>

        {/* ── Header ── */}
        <View style={sh.cropHeader}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={sh.cropHeaderTitle}>{isRTL ? 'עריכת חיתוך ידנית' : 'Manual Crop Editor'}</Text>
            {!!bookTitle && (
              <Text style={sh.cropHeaderSub} numberOfLines={1}>{bookTitle}</Text>
            )}
          </View>
          <TouchableOpacity onPress={onCancel} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={22} color={C.muted} />
          </TouchableOpacity>
        </View>

        {/* ── Image area — image moves, frame is fixed ── */}
        <View
          style={sh.cropImageArea}
          onLayout={e => {
            const { width, height } = e.nativeEvent.layout;
            setContSz({ w: width, h: height });
            contWRef.current = width;
            contHRef.current = height;
          }}
          onTouchStart={handleCropTouchStart}
          onTouchMove={handleCropTouchMove}
          onTouchEnd={handleCropTouchEnd}
        >
          {/* Source image — zoomed and panned */}
          {sourceUri && imgW > 0 ? (
            <Image
              source={{ uri: sourceUri }}
              style={{
                position: 'absolute',
                left: imgLeft, top: imgTop,
                width: Math.max(1, imgW), height: Math.max(1, imgH),
              }}
              resizeMode="stretch"
            />
          ) : null}

          {/* Loading spinner */}
          {!ready && sourceUri ? (
            <ActivityIndicator color={C.white} style={StyleSheet.absoluteFill} />
          ) : null}

          {ready && (
            <>
              {/* Dark mask — 4 rects outside the crop frame */}
              <View style={[sh.cropMask, { top: 0, left: 0, right: 0, height: frameTop }]} />
              <View style={[sh.cropMask, { top: frameTop + frame.h, left: 0, right: 0, bottom: 0 }]} />
              <View style={[sh.cropMask, { top: frameTop, left: 0, width: frameLeft, height: frame.h }]} />
              <View style={[sh.cropMask, { top: frameTop, left: frameLeft + frame.w, right: 0, height: frame.h }]} />

              {/* Crop frame border */}
              <View
                style={[sh.cropFrameBorder, {
                  left: frameLeft, top: frameTop,
                  width: frame.w, height: frame.h,
                }]}
                pointerEvents="none"
              >
                {/* Rule-of-thirds grid */}
                <View style={[sh.cropGrid, { left: '33.33%', top: 0, bottom: 0, width: 1 }]} />
                <View style={[sh.cropGrid, { left: '66.66%', top: 0, bottom: 0, width: 1 }]} />
                <View style={[sh.cropGrid, { top: '33.33%', left: 0, right: 0, height: 1 }]} />
                <View style={[sh.cropGrid, { top: '66.66%', left: 0, right: 0, height: 1 }]} />
                {/* Corner marks */}
                <View style={[sh.corner, sh.cornerTL]} />
                <View style={[sh.corner, sh.cornerTR]} />
                <View style={[sh.corner, sh.cornerBL]} />
                <View style={[sh.corner, sh.cornerBR]} />
              </View>
            </>
          )}
        </View>

        {/* ── Controls ── */}
        <View style={sh.cropControls}>
          {/* Zoom label */}
          <View style={sh.zoomLabelRow}>
            <Text style={sh.zoomLabel}>{isRTL ? 'זום' : 'Zoom'}</Text>
            <Text style={sh.zoomValue}>{zoom.toFixed(1)}×</Text>
          </View>

          {/* Zoom slider */}
          <View
            ref={sliderRef}
            style={sh.sliderTrack}
            onLayout={e => {
              sliderWRef.current = e.nativeEvent.layout.width;
              sliderRef.current?.measure((_x, _y, _w, _h, pageX) => {
                sliderPageXRef.current = pageX;
              });
            }}
            {...sliderPR.current.panHandlers}
          >
            <View style={[sh.sliderFill, { width: `${sliderPct * 100}%` as any }]} />
            <View style={[sh.sliderThumb, { left: `${sliderPct * 100}%` as any }]} />
          </View>

          <Text style={sh.cropHint}>
            {isRTL
              ? 'גרור להזזה • צבוט לזום'
              : 'Drag to move · Pinch to zoom'}
          </Text>

          {/* Buttons */}
          <View style={sh.cropBtnRow}>
            <TouchableOpacity style={sh.cropBtnOutline} onPress={handleReset} activeOpacity={0.8}>
              <Ionicons name="refresh" size={16} color={C.text} style={{ marginRight: 6 }} />
              <Text style={sh.cropBtnOutlineText}>{isRTL ? 'איפוס' : 'Reset'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={sh.cropBtnOutline} onPress={onCancel} activeOpacity={0.8}>
              <Text style={sh.cropBtnOutlineText}>{isRTL ? 'ביטול' : 'Cancel'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[sh.cropBtnPrimary, saving && sh.btnDisabled]}
              onPress={handleSave}
              disabled={saving || !ready}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color={C.white} size="small" />
                : <>
                    <Ionicons name="checkmark" size={16} color={C.white} style={{ marginRight: 6 }} />
                    <Text style={sh.cropBtnPrimaryText}>{isRTL ? 'שמור' : 'Save'}</Text>
                  </>
              }
            </TouchableOpacity>
          </View>
        </View>

      </View>
    </Modal>
  );
}

// ── BundleBookCard (review phase) ─────────────────────────────────────────────

function BundleBookCard({ book, isRTL, onUpdate, onRemove, onCropPress, onGenrePress }: {
  book: BundleBook;
  isRTL: boolean;
  onUpdate: (patch: Partial<BundleBook>) => void;
  onRemove: () => void;
  onCropPress?: () => void;
  onGenrePress?: () => void;
}) {
  const confPct   = Math.round(book.confidence * 100);
  const confColor = confPct >= 80 ? C.emerald : confPct >= 50 ? C.amber : C.red;

  const genreLabels = book.genres
    .map(v => BOOK_GENRES.find(g => g.value === v))
    .filter(Boolean)
    .map(g => isRTL ? g!.labelHe : g!.label);

  // Badge: Manual (green) > AI (blue) > Full (amber)
  const badge = book.manualCropped
    ? { label: isRTL ? 'ידני' : 'Manual', color: C.emerald }
    : book.croppedUri
      ? { label: 'AI', color: C.primary }
      : { label: isRTL ? 'מלא' : 'Full', color: C.amber };

  return (
    <View style={sh.bookCard}>
      <TouchableOpacity
        style={sh.bookCardHeader}
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          onUpdate({ expanded: !book.expanded });
        }}
        activeOpacity={0.8}
      >
        {/* Thumbnail — tap to open crop editor */}
        <TouchableOpacity onPress={onCropPress} activeOpacity={0.75} style={sh.thumbWrap}>
          {book.croppedUri ? (
            <Image source={{ uri: book.croppedUri }} style={sh.bookThumb} resizeMode="cover" />
          ) : (
            <View style={[sh.bookThumb, sh.bookThumbPlaceholder]}>
              <Ionicons name="book-outline" size={22} color={C.muted} />
            </View>
          )}
          {/* Edit overlay */}
          <View style={sh.thumbEditOverlay}>
            <Ionicons name="crop" size={12} color={C.white} />
          </View>
          {/* Status badge */}
          <View style={[sh.thumbBadge, { backgroundColor: badge.color }]}>
            <Text style={sh.thumbBadgeText}>{badge.label}</Text>
          </View>
        </TouchableOpacity>

        <View style={{ flex: 1, marginHorizontal: 12 }}>
          <Text style={[sh.bookTitle, isRTL && { textAlign: 'right' }]} numberOfLines={1}>
            {book.title || (isRTL ? '(ללא שם)' : '(untitled)')}
          </Text>
          <Text style={[sh.bookAuthor, isRTL && { textAlign: 'right' }]} numberOfLines={1}>
            {book.author || (isRTL ? 'מחבר לא ידוע' : 'Unknown author')}
          </Text>
          <View style={sh.bookChips}>
            <View style={[sh.confBadge, { backgroundColor: confColor + '22' }]}>
              <Text style={[sh.confBadgeText, { color: confColor }]}>{confPct}%</Text>
            </View>
            {genreLabels.slice(0, 2).map(g => (
              <View key={g} style={sh.genrePill}>
                <Text style={sh.genrePillText}>{g}</Text>
              </View>
            ))}
          </View>
        </View>

        <TouchableOpacity
          onPress={onRemove}
          style={sh.trashBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="trash-outline" size={18} color={C.red} />
        </TouchableOpacity>
        <Ionicons
          name={book.expanded ? 'chevron-up' : 'chevron-down'}
          size={18} color={C.muted}
          style={{ marginLeft: 4 }}
        />
      </TouchableOpacity>

      {book.expanded && (
        <View style={sh.bookExpanded}>

          {/* ── Book Details ── */}
          <View style={[sh.expandSection, isRTL && sh.expandSectionRTL]}>
            <Ionicons name="book-outline" size={11} color={C.muted} />
            <Text style={sh.expandSectionLabel}>{isRTL ? 'פרטי הספר' : 'BOOK DETAILS'}</Text>
          </View>
          <TextInput
            style={[sh.input, isRTL && { textAlign: 'right' }]}
            value={book.title}
            onChangeText={v => onUpdate({ title: v })}
            placeholder={isRTL ? 'שם ספר *' : 'Title *'}
            placeholderTextColor={C.muted}
            textAlign={isRTL ? 'right' : 'left'}
          />
          <TextInput
            style={[sh.input, isRTL && { textAlign: 'right' }]}
            value={book.author}
            onChangeText={v => onUpdate({ author: v })}
            placeholder={isRTL ? 'מחבר *' : 'Author *'}
            placeholderTextColor={C.muted}
            textAlign={isRTL ? 'right' : 'left'}
          />
          <TextInput
            style={[sh.input, { minHeight: 72, textAlignVertical: 'top' }, isRTL && { textAlign: 'right' }]}
            value={book.description}
            onChangeText={v => onUpdate({ description: v })}
            placeholder={isRTL ? 'תיאור הספר (אופציונלי)' : 'Description (optional)'}
            placeholderTextColor={C.muted}
            multiline
            textAlign={isRTL ? 'right' : 'left'}
          />

          {/* ── Condition ── */}
          <View style={[sh.expandSection, isRTL && sh.expandSectionRTL, { marginTop: 10 }]}>
            <Ionicons name="star-outline" size={11} color={C.muted} />
            <Text style={sh.expandSectionLabel}>{isRTL ? 'מצב' : 'CONDITION'}</Text>
          </View>
          <ConditionPicker value={book.condition} onChange={v => onUpdate({ condition: v })} isRTL={isRTL} />

          {/* ── Genres ── */}
          <View style={[sh.expandSection, isRTL && sh.expandSectionRTL, { marginTop: 10 }]}>
            <Ionicons name="pricetags-outline" size={11} color={C.muted} />
            <Text style={sh.expandSectionLabel}>{isRTL ? 'ז׳אנרים' : 'GENRES'}</Text>
            <View style={sh.genreCounter}>
              <Text style={[sh.genreCounterTxt, { color: book.genres.length > 0 ? C.primary : C.muted }]}>
                {book.genres.length}/3
              </Text>
            </View>
          </View>

          {/* Selected genre pills (removable) */}
          {book.genres.length > 0 && (
            <View style={sh.selectedGenres}>
              {book.genres.map(v => {
                const g = BOOK_GENRES.find(x => x.value === v);
                return (
                  <TouchableOpacity
                    key={v}
                    style={sh.selectedGenrePill}
                    onPress={() => onUpdate({ genres: book.genres.filter(x => x !== v) })}
                    activeOpacity={0.7}
                  >
                    <Text style={sh.selectedGenrePillTxt}>{isRTL ? g?.labelHe : g?.label}</Text>
                    <Ionicons name="close" size={11} color={C.primary} />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Open genre picker button */}
          <TouchableOpacity style={sh.genrePickerBtn} onPress={onGenrePress} activeOpacity={0.8}>
            <Ionicons name="search-outline" size={14} color={C.primary} />
            <Text style={sh.genrePickerBtnTxt}>
              {book.genres.length > 0
                ? (isRTL ? 'ערוך ז׳אנרים' : 'Edit genres')
                : (isRTL ? 'הוסף ז׳אנרים' : 'Add genres')}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── Root screen ───────────────────────────────────────────────────────────────

export default function PublishScreen() {
  const { user, profile } = useAuthStore();
  const { isRTL }         = useLanguageStore();
  const navigation        = useNavigation<any>();
  const insets             = useSafeAreaInsets();

  const [phase,       setPhase]       = useState<Phase>('idle');
  const [sourceUri,   setSourceUri]   = useState<string | null>(null);
  const [books,       setBooks]       = useState<BundleBook[]>([]);
  const [city,        setCity]        = useState(profile?.city || '');
  const [listingType, setListingType] = useState<ListingType>('free');
  const [condition,      setCondition]      = useState('good');
  const [shippingType,   setShippingType]   = useState<'pickup' | 'shipping'>('pickup');
  const [shippingDetails, setShippingDetails] = useState('');
  const [price,       setPrice]       = useState('');
  const [lookingFor,  setLookingFor]  = useState('');
  const [publishing,  setPublishing]  = useState(false);
  const [cityModal,   setCityModal]   = useState(false);
  const [rotating,    setRotating]    = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [genrePickerFor, setGenrePickerFor] = useState<string | null>(null);

  // Crop editor state
  const [cropTarget,       setCropTarget]       = useState<string | null>(null);
  const [editorInitState,  setEditorInitState]  = useState<{
    initialCrop?:              { x: number; y: number };
    initialZoom?:              number;
    initialCroppedAreaPixels?: CropAreaPixels;
  } | null>(null);

  /**
   * Per-book crop state — { crop: {x,y}, zoom } saved on every Save click.
   * Stored in a ref (in-memory) so it survives within the session.
   */
  const cropStatesRef = useRef<Map<string, CropState>>(new Map());

  // ── Hide tab bar only during full-screen camera/photo phases ─────────────
  useEffect(() => {
    navigation.setOptions({
      tabBarStyle: (phase === 'idle' || phase === 'ready' || phase === 'scanning' || phase === 'review') ? { display: 'none' } : undefined,
    });
  }, [phase, navigation]);

  // ── Unsaved changes guard ─────────────────────────────────────────────────
  useEffect(() => {
    const hasWork = phase !== 'idle' || books.length > 0 || !!sourceUri;
    if (!hasWork) return;

    const unsub = navigation.addListener('beforeRemove', (e: any) => {
      if (publishing) return; // allow navigation after successful publish
      e.preventDefault();
      Alert.alert(
        isRTL ? 'יציאה מפרסום?' : 'Discard draft?',
        isRTL ? 'יש לך ספרים שעדיין לא פורסמו. הסשן נשמר ותוכל להמשיך מאוחר יותר.' : 'You have unpublished books. Your session is saved and you can continue later.',
        [
          { text: isRTL ? 'המשך לערוך' : 'Keep editing', style: 'cancel' },
          { text: isRTL ? 'יציאה' : 'Leave', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
        ],
      );
    });
    return unsub;
  }, [phase, books.length, sourceUri, publishing, navigation, isRTL]);

  // ── Session restore ────────────────────────────────────────────────────────

  useEffect(() => {
    AsyncStorage.getItem(BUNDLE_SESSION_KEY).then(raw => {
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved.savedAt || Date.now() - saved.savedAt > BUNDLE_SESSION_TTL) return;
      Alert.alert(
        isRTL ? 'שחזור סשן' : 'Session Restored',
        isRTL
          ? `נמצא סשן קודם עם ${saved.books?.length ?? 0} ספרים. להמשיך?`
          : `Found a previous session with ${saved.books?.length ?? 0} books. Continue?`,
        [
          { text: isRTL ? 'התחל מחדש' : 'Start Fresh', onPress: clearAll },
          {
            text: isRTL ? 'המשך' : 'Continue',
            onPress: () => {
              if (saved.sourceUri)   setSourceUri(saved.sourceUri);
              if (saved.books)       setBooks(saved.books);
              if (saved.city)        setCity(saved.city);
              if (saved.listingType) setListingType(saved.listingType);
              if (saved.condition)   setCondition(saved.condition);
              setPhase('review');
            },
          },
        ]
      );
    }).catch(() => {});
  }, []);

  // ── Session save ───────────────────────────────────────────────────────────

  const saveSession = useCallback(async (bks: BundleBook[], src: string | null) => {
    try {
      await AsyncStorage.setItem(BUNDLE_SESSION_KEY, JSON.stringify({
        books: bks, sourceUri: src, city, listingType, condition, savedAt: Date.now(),
      }));
    } catch {}
  }, [city, listingType, condition]);

  // ── Photo picker helpers ───────────────────────────────────────────────────

  const openGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(isRTL ? 'נדרשת הרשאה' : 'Permission needed',
        isRTL ? 'אפשר גישה לתמונות' : 'Allow access to photos');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images' as const,
      allowsEditing: false, quality: 1,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.mimeType && !asset.mimeType.startsWith('image/')) {
        Alert.alert(
          isRTL ? 'קובץ לא נתמך' : 'Unsupported file',
          isRTL ? 'ניתן להעלות רק תמונות' : 'Only image files are allowed',
        );
        return;
      }
      setSourceUri(asset.uri);
      setBooks([]);
      setPhase('ready');
    }
  };

  const openCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(isRTL ? 'נדרשת הרשאה' : 'Permission needed',
        isRTL ? 'אפשר גישה למצלמה' : 'Allow access to camera');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 0.95 });
    if (!result.canceled && result.assets[0]) {
      setSourceUri(result.assets[0].uri);
      setBooks([]);
      setPhase('ready');
    }
  };

  const handleChangePhoto = () => {
    Alert.alert(isRTL ? 'החלף תמונה' : 'Change Photo', '', [
      { text: isRTL ? 'מצלמה' : 'Camera',  onPress: openCamera  },
      { text: isRTL ? 'גלריה'  : 'Gallery', onPress: openGallery },
      { text: isRTL ? 'ביטול'  : 'Cancel',  style: 'cancel' },
    ]);
  };

  // ── Rotate photo (ready phase) ─────────────────────────────────────────────

  const handleRotate = async (degrees: 90 | -90) => {
    if (!sourceUri || rotating) return;
    setRotating(true);
    try {
      const rotated = await rotateImage(sourceUri, degrees);
      setSourceUri(rotated);
    } catch (e: any) {
      Alert.alert(isRTL ? 'שגיאה' : 'Error', e.message);
    } finally {
      setRotating(false);
    }
  };

  // ── Skip to manual entry ───────────────────────────────────────────────────

  const skipToManual = () => {
    const empty: BundleBook = {
      id: `manual-${Date.now()}`,
      title: '', author: '', confidence: 1,
      genres: [], condition, description: '',
      croppedUri: sourceUri || '', expanded: true,
    };
    setBooks([empty]);
    setPhase('review');
  };

  // ── AI Scan ────────────────────────────────────────────────────────────────

  const runScan = async () => {
    if (!sourceUri) return;
    setPhase('scanning');
    try {
      const result = await detectBooksInPhoto(sourceUri);
      if (!result.success) {
        setPhase('ready');
        const msg = isRTL
          ? result.code === 'NO_BOOK_DETECTED'
            ? 'לא זוהו ספרים בתמונה. נסו לצלם מקרוב יותר או בתאורה טובה יותר.'
            : result.code === 'RATE_LIMITED'
            ? 'עומס זמני על ה-AI. נסו שוב בעוד רגע.'
            : 'הסריקה נכשלה. נסו שוב או הזינו ידנית.'
          : result.code === 'NO_BOOK_DETECTED'
            ? 'No books detected. Try a closer or better-lit photo.'
            : result.code === 'RATE_LIMITED'
            ? 'AI is temporarily busy. Try again in a moment.'
            : 'Scan failed. Try again or enter details manually.';
        Alert.alert(
          isRTL ? 'סריקה נכשלה' : 'Scan Failed',
          msg,
          [
            { text: isRTL ? 'נסה שוב' : 'Try Again', style: 'cancel' },
            { text: isRTL ? 'הזן ידנית' : 'Add Manually', onPress: skipToManual },
          ],
        );
        return;
      }

      const detectedBooks = await Promise.all(
        result.books.map(async (b: BatchBookResult, i: number) => {
          let croppedUri = sourceUri;
          try { croppedUri = await cropBookFromBBox(sourceUri, b.boundingBox); } catch {}
          return {
            id:          `${Date.now()}-${i}`,
            title:       b.title,
            author:      b.author,
            confidence:  b.confidence,
            genres:      b.detectedGenres,
            condition:   b.estimatedCondition || condition,
            description: b.description || '',
            croppedUri,
            expanded:    false,
            boundingBox: b.boundingBox,   // ← stored for crop editor init
            manualCropped: false,
          } satisfies BundleBook;
        })
      );

      setBooks(detectedBooks);
      saveSession(detectedBooks, sourceUri);
      setPhase('review');
    } catch (e: any) {
      setPhase('ready');
      Alert.alert(
        isRTL ? 'סריקה נכשלה' : 'Scan Failed',
        isRTL ? 'הסריקה נכשלה. נסו שוב או הזינו ידנית.' : 'Scan failed. Try again or enter details manually.',
        [
          { text: isRTL ? 'נסה שוב' : 'Try Again', style: 'cancel' },
          { text: isRTL ? 'הזן ידנית' : 'Add Manually', onPress: skipToManual },
        ],
      );
    }
  };

  const handleRescan = () => {
    Alert.alert(
      isRTL ? 'סריקה מחדש' : 'Re-scan',
      isRTL
        ? 'סריקה מחדש תמחק את הספרים הנוכחיים. להמשיך?'
        : 'Re-scanning will clear current books. Continue?',
      [
        { text: isRTL ? 'ביטול' : 'Cancel', style: 'cancel' },
        { text: isRTL ? 'סרוק'  : 'Scan',   onPress: runScan },
      ]
    );
  };

  // ── Book mutations ─────────────────────────────────────────────────────────

  const updateBook = (id: string, patch: Partial<BundleBook>) => {
    setBooks(prev => {
      const updated = prev.map(b => b.id === id ? { ...b, ...patch } : b);
      // Skip session save for expand/collapse — no need to persist UI state
      const patchKeys = Object.keys(patch);
      if (!(patchKeys.length === 1 && patchKeys[0] === 'expanded')) {
        saveSession(updated, sourceUri);
      }
      return updated;
    });
  };

  const removeBook = (id: string) => {
    setBooks(prev => {
      const updated = prev.filter(b => b.id !== id);
      saveSession(updated, sourceUri);
      return updated;
    });
  };

  const addEmptyBook = () => {
    const empty: BundleBook = {
      id: `manual-${Date.now()}`,
      title: '', author: '', confidence: 1,
      genres: [], condition, description: '',
      croppedUri: '', expanded: true,
    };
    setBooks(prev => {
      const updated = [...prev, empty];
      saveSession(updated, sourceUri);
      return updated;
    });
  };

  // ── Open crop editor — mirrors calculateInitialCropState() in web ──────────

  const openCropEditor = async (bookId: string) => {
    const book = books.find(b => b.id === bookId);

    // Priority 1: saved crop state → reopens at exact saved position
    const saved = cropStatesRef.current.get(bookId);
    if (saved) {
      setEditorInitState({ initialCrop: saved.crop, initialZoom: saved.zoom });
      setCropTarget(bookId);
      return;
    }

    // Priority 2: AI bounding box → convert to pixel coords, pass as initialCroppedAreaPixels
    if (book?.boundingBox && sourceUri) {
      try {
        const { width: natW, height: natH } = await getImageDimensions(sourceUri);
        const bbox = book.boundingBox;
        const initialCroppedAreaPixels: CropAreaPixels = {
          x:      Math.round(bbox.x * natW),
          y:      Math.round(bbox.y * natH),
          width:  Math.round(bbox.width  * natW),
          height: Math.round(bbox.height * natH),
        };
        setEditorInitState({ initialCroppedAreaPixels });
      } catch {
        setEditorInitState(null);
      }
      setCropTarget(bookId);
      return;
    }

    // Priority 3: no saved state, no bbox → defaults (centered, zoom 1)
    setEditorInitState(null);
    setCropTarget(bookId);
  };

  // ── Handle crop save — mirrors handleManualCropSave() in web ──────────────

  const handleCropSave = (
    bookId: string,
    area: CropAreaPixels & { _croppedUri?: string },
    state: CropState,
  ) => {
    // 1. Store crop state for re-opening at same position
    cropStatesRef.current.set(bookId, state);

    // 2. Update book thumbnail with the newly cropped image URI
    const croppedUri = (area as any)._croppedUri as string | undefined;
    if (croppedUri) {
      updateBook(bookId, { croppedUri, manualCropped: true });
    }

    // 3. Close modal
    setCropTarget(null);
    setEditorInitState(null);
  };

  // ── Clear all ──────────────────────────────────────────────────────────────

  const clearAll = async () => {
    await AsyncStorage.removeItem(BUNDLE_SESSION_KEY);
    setSourceUri(null);
    setBooks([]);
    cropStatesRef.current.clear();
    setPhase('idle');
  };

  const handleClearConfirm = () => setShowClearConfirm(true);

  // ── Publish ────────────────────────────────────────────────────────────────

  const handlePublishAll = async () => {
    if (!city.trim()) {
      Alert.alert(isRTL ? 'שגיאה' : 'Error', isRTL ? 'יש לבחור עיר' : 'City is required');
      return;
    }
    const invalid = books.find(b => !b.title.trim() || !b.author.trim());
    if (invalid) {
      Alert.alert(isRTL ? 'שגיאה' : 'Error',
        isRTL ? 'כל הספרים חייבים שם ומחבר' : 'All books need title and author');
      return;
    }
    if (listingType === 'sale' && (!price || parseFloat(price) <= 0)) {
      Alert.alert(isRTL ? 'שגיאה' : 'Error', isRTL ? 'הזן מחיר תקין' : 'Enter a valid price');
      return;
    }
    if (listingType === 'trade' && !lookingFor.trim()) {
      Alert.alert(isRTL ? 'שגיאה' : 'Error', isRTL ? 'ציין מה אתה מחפש' : "Specify what you're looking for");
      return;
    }

    setPublishing(true);
    try {
      console.log('[Publish] Starting, books:', books.length, 'city:', city, 'listingType:', listingType);
      const coords = CITY_COORDS[city];

      const categoryFromGenre = (genres: string[]) => {
        if (genres.includes('children'))  return 'children';
        if (genres.includes('comics'))    return 'magazines';
        if (['business','psychology','philosophy','science',
             'health','cooking','art','travel','religion',
             'poetry','humor','biography','self-help',
             'history'].some(g => genres.includes(g))) return 'reference';
        return 'reading';
      };

      for (const book of books) {
        console.log('[Publish] Processing book:', book.title, 'croppedUri:', !!book.croppedUri);
        let imageUrls: string[] = [];
        if (book.croppedUri) {
          try {
            console.log('[Publish] Uploading image...');
            imageUrls = [await uploadImageToStorage(book.croppedUri, user!.id)];
            console.log('[Publish] Image uploaded OK');
          } catch (uploadErr: any) {
            console.warn('[Publish] Image upload failed:', uploadErr.message);
          }
        }

        const payload = {
          title:        book.title.trim(),
          author:       book.author.trim(),
          description:  book.description || null,
          price:        listingType === 'sale' ? parseFloat(price) : null,
          listing_type: listingType,
          condition:    book.condition || condition,
          category:     categoryFromGenre(book.genres),
          genres:       book.genres,
          looking_for:  listingType === 'trade' ? lookingFor.trim() : null,
          city:         city.trim(),
          location_lat: coords?.lat ?? null,
          location_lng: coords?.lng ?? null,
          images:          imageUrls,
          user_id:         user!.id,
          status:          'active',
          shipping_type:   shippingType,
          shipping_details: shippingType === 'shipping' ? shippingDetails.trim() || null : null,
        };
        console.log('[Publish] Inserting:', JSON.stringify(payload));

        const { error: insertError } = await supabase.from('books').insert(payload);
        if (insertError) {
          console.error('[Publish] INSERT ERROR:', JSON.stringify(insertError, null, 2));
          throw new Error(insertError.message);
        }
        console.log('[Publish] Insert OK');
      }

      console.log('[Publish] All done, clearing...');
      const count = books.length;
      // Bust caches so new listings appear immediately on Home + MyBooks
      useDataStore.getState().invalidateHome();
      useDataStore.getState().invalidateMyBooks();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await clearAll();
      navigation.navigate('MyBooks');
      setTimeout(() => {
        Alert.alert(
          isRTL ? '🎉 פורסם בהצלחה!' : '🎉 Published!',
          isRTL ? `${count} ספרים פורסמו בהצלחה` : `${count} book${count !== 1 ? 's' : ''} published successfully`,
        );
      }, 300);
    } catch (e: any) {
      console.error('[Publish] CAUGHT ERROR:', e.message);
      Alert.alert(isRTL ? 'שגיאה' : 'Error', e.message || 'Unknown error');
    } finally {
      console.log('[Publish] Finally: setPublishing(false)');
      setPublishing(false);
    }
  };

  // ── Auth guard ─────────────────────────────────────────────────────────────

  if (!user) {
    return (
      <View style={sh.authPrompt}>
        <View style={sh.authIconWrap}>
          <Ionicons name="library-outline" size={40} color={C.primary} />
        </View>
        <Text style={sh.authTitle}>{isRTL ? 'התחבר כדי לפרסם' : 'Sign in to publish'}</Text>
        <Text style={sh.authSub}>
          {isRTL ? 'צור חשבון כדי לשתף ספרים עם הקהילה' : 'Create an account to share books with the community'}
        </Text>
        <TouchableOpacity style={sh.authBtn} onPress={() => supabase.auth.signOut()}>
          <Text style={sh.authBtnText}>{isRTL ? 'התחבר' : 'Sign In'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Idle phase — TikTok-style live camera ─────────────────────────────────

  if (phase === 'idle') {
    return (
      <View style={sh.root}>
        <CameraCapture
          onPhotoTaken={uri => { setSourceUri(uri); setBooks([]); setPhase('ready'); }}
          onGallery={openGallery}
          isRTL={isRTL}
        />
      </View>
    );
  }

  // ── Ready phase — WhatsApp-style full-screen ──────────────────────────────

  if (phase === 'ready') {
    return (
      <View style={sh.readyRoot}>
        {/* Full-screen image — contain so nothing is cut off */}
        <Image source={{ uri: sourceUri! }} style={StyleSheet.absoluteFill} resizeMode="contain" />

        {/* Top overlay bar — X on right in RTL */}
        <View style={[sh.readyTopBar, isRTL && { flexDirection: 'row-reverse' }]}>
          <TouchableOpacity
            style={sh.readyTopBtn}
            onPress={() => { setSourceUri(null); setPhase('idle'); }}
            activeOpacity={0.8}
          >
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[sh.readyTopBtn, rotating && { opacity: 0.4 }]}
            onPress={() => handleRotate(90)}
            disabled={rotating}
            activeOpacity={0.8}
          >
            {rotating
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="reload-outline" size={22} color="#fff" />
            }
          </TouchableOpacity>
        </View>

        {/* Bottom action panel */}
        <View style={[sh.readyBottomPanel, { paddingBottom: insets.bottom + 20 }]}>
          <TouchableOpacity style={sh.readyScanBtn} onPress={runScan} activeOpacity={0.88}>
            <Ionicons name="sparkles" size={20} color="#fff" />
            <Text style={sh.readyScanText}>
              {isRTL ? 'סרוק עם AI' : 'Scan with AI'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={skipToManual} activeOpacity={0.7} style={sh.readySkipBtn}>
            <Text style={sh.readySkipText}>
              {isRTL ? 'המשך ידנית ›' : 'Continue manually ›'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Scanning phase — full-screen overlay ───────────────────────────────────

  if (phase === 'scanning') {
    return (
      <View style={sh.readyRoot}>
        <Image source={{ uri: sourceUri! }} style={StyleSheet.absoluteFill} resizeMode="contain" />
        <View style={sh.scanningOverlay}>
          <View style={sh.scanningCard}>
            <ActivityIndicator size="large" color={C.purple} />
            <Text style={sh.scanningTitle}>{isRTL ? 'מזהה ספרים...' : 'Identifying books...'}</Text>
            <Text style={sh.scanningHint}>
              {isRTL
                ? 'ה-AI מנתח את התמונה. זה עלול לקחת כמה שניות'
                : 'AI is analyzing your image. This may take a few seconds'}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  // ── Review ─────────────────────────────────────────────────────────────────

  return (
    <View style={sh.root}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {/* ── Fixed top bar ── */}
        <View style={[sh.reviewBar, { paddingTop: insets.top + 8, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <TouchableOpacity
            style={sh.reviewBarBtn}
            onPress={() => navigation.navigate('Home' as any)}
            activeOpacity={0.75}
          >
            <Ionicons name="close" size={24} color={C.text} />
          </TouchableOpacity>
          <TouchableOpacity style={sh.reviewBarChangeBtn} onPress={() => { setSourceUri(null); setPhase('idle'); }} activeOpacity={0.85}>
            <Ionicons name="camera-outline" size={15} color={C.primary} />
            <Text style={sh.reviewBarChangeTxt}>{isRTL ? 'שנה תמונה' : 'Change photo'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={sh.formScroll}
          contentContainerStyle={[sh.formContent, { paddingBottom: 120, paddingTop: 16 }]}
          keyboardShouldPersistTaps="handled"
        >

          {/* REVIEW */}
          {(
            <>
              {/* 1. Review header */}
              <View style={sh.reviewHeader}>
                <View style={sh.reviewHeaderLeft}>
                  <View style={sh.reviewCountBadge}>
                    <Ionicons name="library-outline" size={14} color={C.primary} />
                    <Text style={sh.reviewCountTxt}>{books.length}</Text>
                  </View>
                  <Text style={sh.reviewHeaderTitle}>
                    {isRTL ? 'ספרים זוהו' : books.length === 1 ? 'book found' : 'books found'}
                  </Text>
                </View>
                <TouchableOpacity style={sh.rescanBtn} onPress={handleRescan} activeOpacity={0.75}>
                  <Ionicons name="scan-outline" size={13} color={C.sub} />
                  <Text style={sh.rescanBtnTxt}>{isRTL ? 'סרוק מחדש' : 'Re-scan'}</Text>
                </TouchableOpacity>
              </View>

              {/* 2. Listing Details — above books */}
              <View style={sh.detailsCard}>
                <Text style={sh.detailsCardTitle}>{isRTL ? 'פרטי מודעה' : 'Listing Details'}</Text>
                <TouchableOpacity style={sh.cityRow} onPress={() => setCityModal(true)}>
                  <Ionicons name="location-outline" size={18} color={C.primary} />
                  <Text style={[sh.cityRowText, !city && { color: C.muted }]}>
                    {city || (isRTL ? 'בחר עיר...' : 'Select city...')}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={C.muted} />
                </TouchableOpacity>
                <Text style={sh.detailsLabel}>{isRTL ? 'סוג פרסום' : 'Listing Type'}</Text>
                <ListingTypePicker value={listingType} onChange={setListingType} isRTL={isRTL} />
                {listingType === 'sale' && (
                  <>
                    <Text style={sh.detailsLabel}>{isRTL ? 'מחיר (₪) *' : 'Price (₪) *'}</Text>
                    <TextInput style={sh.input} value={price} onChangeText={setPrice}
                      placeholder="0" keyboardType="numeric" />
                  </>
                )}
                {listingType === 'trade' && (
                  <>
                    <Text style={sh.detailsLabel}>{isRTL ? 'מחפש *' : 'Looking For *'}</Text>
                    <TextInput
                      style={[sh.input, { minHeight: 72, textAlignVertical: 'top' }]}
                      value={lookingFor} onChangeText={setLookingFor}
                      placeholder={isRTL ? 'מה אתה מחפש?' : 'What are you looking for?'}
                      multiline textAlign={isRTL ? 'right' : 'left'}
                    />
                  </>
                )}
                <Text style={sh.detailsLabel}>{isRTL ? 'מצב ברירת מחדל' : 'Default Condition'}</Text>
                <ConditionPicker value={condition} onChange={setCondition} isRTL={isRTL} />

                <Text style={sh.detailsLabel}>{isRTL ? 'אספקה' : 'Delivery'}</Text>
                <View style={sh.chipRow}>
                  {[
                    { value: 'pickup',   label: 'Pickup',   labelHe: 'איסוף עצמי' },
                    { value: 'shipping', label: 'Shipping', labelHe: 'משלוח' },
                  ].map(opt => {
                    const active = shippingType === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        style={[sh.chip, active && sh.chipActive]}
                        onPress={() => setShippingType(opt.value as 'pickup' | 'shipping')}
                      >
                        <Text style={[sh.chipText, active && sh.chipTextActive]}>
                          {isRTL ? opt.labelHe : opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {shippingType === 'shipping' && (
                  <TextInput
                    style={[sh.input, { textAlign: isRTL ? 'right' : 'left' }]}
                    value={shippingDetails}
                    onChangeText={setShippingDetails}
                    placeholder={isRTL ? 'פרטי משלוח (אופציונלי)...' : 'Shipping details (optional)...'}
                    multiline
                  />
                )}
              </View>

              {/* 3. Book cards */}
              {books.map(book => (
                <BundleBookCard
                  key={book.id}
                  book={book}
                  isRTL={isRTL}
                  onUpdate={patch => updateBook(book.id, patch)}
                  onRemove={() => removeBook(book.id)}
                  onCropPress={() => openCropEditor(book.id)}
                  onGenrePress={() => setGenrePickerFor(book.id)}
                />
              ))}

              {/* 4. Add manually */}
              <TouchableOpacity style={sh.addManualBtn} onPress={addEmptyBook}>
                <Ionicons name="add-circle-outline" size={18} color={C.primary} />
                <Text style={sh.addManualText}>{isRTL ? '+ הוסף ספר ידנית' : '+ Add Book Manually'}</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>

        {/* Sticky publish bar */}
        <View style={[sh.stickyBar, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity
            style={[sh.publishBtn, { backgroundColor: LISTING_COLORS[listingType] }, publishing && sh.btnDisabled]}
            onPress={handlePublishAll} disabled={publishing} activeOpacity={0.85}
          >
            {publishing
              ? <ActivityIndicator color={C.white} />
              : <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={sh.publishBtnText}>
                    {isRTL ? `פרסם ${books.length} ספרים` : `Publish ${books.length} Books`}
                  </Text>
                  <Ionicons name={isRTL ? 'arrow-back' : 'arrow-forward'} size={18} color={C.white} />
                </View>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <CityPickerModal
        visible={cityModal} city={city} onSelect={setCity}
        onClose={() => setCityModal(false)} isRTL={isRTL}
      />

      {/* Genre picker */}
      {genrePickerFor && (
        <GenrePickerModal
          visible={true}
          selected={books.find(b => b.id === genrePickerFor)?.genres ?? []}
          isRTL={isRTL}
          onChange={genres => {
            updateBook(genrePickerFor, { genres });
          }}
          onClose={() => setGenrePickerFor(null)}
        />
      )}

      {/* ── Manual Crop Editor Modal ── */}
      {cropTarget && (
        <ManualCropModal
          visible={true}
          sourceUri={sourceUri || ''}
          bookTitle={books.find(b => b.id === cropTarget)?.title || ''}
          onSave={(area, state) => handleCropSave(cropTarget, area as any, state)}
          onCancel={() => { setCropTarget(null); setEditorInitState(null); }}
          isRTL={isRTL}
          initialCrop={editorInitState?.initialCrop}
          initialZoom={editorInitState?.initialZoom}
          initialCroppedAreaPixels={editorInitState?.initialCroppedAreaPixels}
        />
      )}

      {/* Custom clear-all confirmation sheet */}
      {showClearConfirm && (
        <Pressable style={sh.confirmOverlay} onPress={() => setShowClearConfirm(false)}>
          <Pressable style={sh.confirmSheet} onPress={() => {}}>
            <View style={sh.confirmHandle} />
            <View style={sh.confirmIconWrap}>
              <Ionicons name="trash-outline" size={28} color={C.red} />
            </View>
            <Text style={sh.confirmTitle}>{isRTL ? 'למחוק הכל?' : 'Clear everything?'}</Text>
            <Text style={sh.confirmSub}>
              {isRTL
                ? 'כל הספרים והתמונות יימחקו ותתחיל מחדש'
                : 'All books and photos will be removed'}
            </Text>
            <TouchableOpacity
              style={sh.confirmDestructiveBtn}
              onPress={() => { setShowClearConfirm(false); clearAll(); }}
              activeOpacity={0.85}
            >
              <Ionicons name="trash-outline" size={16} color="#fff" />
              <Text style={sh.confirmDestructiveTxt}>{isRTL ? 'נקה הכל' : 'Clear All'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={sh.confirmCancelBtn}
              onPress={() => setShowClearConfirm(false)}
              activeOpacity={0.8}
            >
              <Text style={sh.confirmCancelTxt}>{isRTL ? 'ביטול' : 'Cancel'}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      )}

    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const { width: SW } = Dimensions.get('window');

const sh = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // Review top bar
  reviewBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  reviewBarBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  reviewBarChangeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: 10, borderWidth: 1, borderColor: C.border,
  },
  reviewBarChangeTxt: { fontSize: 13, fontWeight: '600', color: C.primary },

  // Auth
  authPrompt:   { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  authIconWrap: { width: 88, height: 88, borderRadius: 24, backgroundColor: C.primaryLight, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  authTitle:    { fontSize: 22, fontWeight: '700', color: C.text, textAlign: 'center', marginBottom: 8 },
  authSub:    { fontSize: 15, color: C.sub, textAlign: 'center', marginBottom: 28, lineHeight: 22 },
  authBtn:    { backgroundColor: C.primary, paddingVertical: 14, paddingHorizontal: 48, borderRadius: 12, width: '100%', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 4, elevation: 2 },
  authBtnText: { color: C.white, fontSize: 16, fontWeight: '600' },

  // Camera (idle)
  permContainer: { flex: 1, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center', padding: 32 },
  permTitle:     { fontSize: 20, fontWeight: '700', color: C.white, textAlign: 'center', marginBottom: 24 },
  grantBtn:      { backgroundColor: C.primary, paddingVertical: 14, paddingHorizontal: 32, borderRadius: 14, width: '100%', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 4, elevation: 2 },
  grantBtnText:  { color: C.white, fontSize: 16, fontWeight: '600' },
  galleryLink:   { color: C.muted, fontSize: 15, fontWeight: '500', textDecorationLine: 'underline' },
  camBottomBar:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 40, paddingTop: 20, paddingBottom: Platform.OS === 'ios' ? 44 : 20, backgroundColor: 'rgba(0,0,0,0.5)' },
  camSideBtn:    { width: 52, height: 52, justifyContent: 'center', alignItems: 'center' },
  shutterOuter:  { width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: C.white, justifyContent: 'center', alignItems: 'center' },
  shutterInner:  { width: 64, height: 64, borderRadius: 32, backgroundColor: C.white },

  // Form
  formScroll:  { flex: 1 },
  formContent: { padding: 16, paddingBottom: 40 },

  photoStrip:          { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 10, marginBottom: 12, gap: 10 },
  photoStripThumb:     { width: 44, height: 58, borderRadius: 8, backgroundColor: C.border },
  photoStripLabel:     { flex: 1, fontSize: 13, color: C.sub, fontWeight: '500' },
  photoStripChangeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: C.border },
  photoStripChangeTxt: { fontSize: 12, fontWeight: '600', color: C.primary },

  // ── Ready phase (full-screen, WhatsApp-style) ──────────────────────────────
  readyRoot:       { flex: 1, backgroundColor: '#000' },
  readyTopBar:     {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 58 : 24,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  readyTopBtn:     {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center', alignItems: 'center',
  },
  readyBottomPanel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: Platform.OS === 'ios' ? 44 : 24,
    gap: 12,
  },
  readyScanBtn:    {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.primary, borderRadius: 14, height: 54,
    gap: 10,
    shadowColor: C.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 5,
  },
  readyScanText:   { color: '#fff', fontSize: 18, fontWeight: '700' },
  readySkipBtn:    { alignItems: 'center', paddingVertical: 6 },
  readySkipText:   { fontSize: 14, color: 'rgba(255,255,255,0.7)', fontWeight: '500' },

  // ── Scanning overlay (full-screen) ─────────────────────────────────────────
  scanningOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center', gap: 14,
  },
  scanningCard: { backgroundColor: C.white, borderRadius: 16, padding: 32, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3, gap: 12 },
  scanningTitle: { fontSize: 17, fontWeight: '700', color: C.text },
  scanningHint:  { fontSize: 13, color: C.sub, textAlign: 'center', lineHeight: 18 },

  reviewHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  reviewHeaderLeft:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reviewCountBadge:  { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.primaryLight, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  reviewCountTxt:    { fontSize: 13, fontWeight: '700', color: C.primary },
  reviewHeaderTitle: { fontSize: 15, fontWeight: '600', color: C.text },
  rescanBtn:         { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: C.border },
  rescanBtnTxt:      { fontSize: 12, color: C.sub, fontWeight: '600' },

  // Book card
  bookCard:            { backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.border, marginBottom: 10, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  bookCardHeader:      { flexDirection: 'row', alignItems: 'center', padding: 12 },
  thumbWrap:           { position: 'relative', width: 60, height: 78 },
  bookThumb:           { width: 60, height: 78, borderRadius: 8, backgroundColor: C.border },
  bookThumbPlaceholder:{ justifyContent: 'center', alignItems: 'center' },
  thumbEditOverlay:    { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 4, padding: 3 },
  thumbBadge:          { position: 'absolute', bottom: 0, left: 0, right: 0, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, paddingVertical: 2, alignItems: 'center' },
  thumbBadgeText:      { color: C.white, fontSize: 9, fontWeight: '700' },
  bookTitle:           { fontSize: 14, fontWeight: '600', color: C.text },
  bookAuthor:          { fontSize: 12, color: C.sub, marginTop: 2 },
  bookChips:           { flexDirection: 'row', gap: 4, marginTop: 4, flexWrap: 'wrap' },
  confBadge:           { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  confBadgeText:       { fontSize: 11, fontWeight: '700' },
  genrePill:           { backgroundColor: '#f1f5f9', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  genrePillText:       { fontSize: 11, color: C.sub },
  trashBtn:            { padding: 6 },
  bookExpanded:        { padding: 14, borderTopWidth: 1, borderTopColor: C.border, gap: 6 },

  // Expanded section dividers
  expandSection:      { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  expandSectionRTL:   { flexDirection: 'row-reverse' },
  expandSectionLabel: { fontSize: 10, fontWeight: '700', color: C.muted, letterSpacing: 0.5, flex: 1 },

  // Genre counter badge
  genreCounter:    { backgroundColor: C.primaryMid, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  genreCounterTxt: { fontSize: 11, fontWeight: '700' },

  // Selected genre removable pills
  selectedGenres:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  selectedGenrePill:   { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.primaryLight, borderWidth: 1, borderColor: C.primary + '40', borderRadius: 20, paddingVertical: 5, paddingHorizontal: 10 },
  selectedGenrePillTxt:{ fontSize: 12, color: C.primary, fontWeight: '600' },

  // Compact genre grid
  genreGrid:          { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  genreChip:          { borderWidth: 1, borderColor: C.border, backgroundColor: C.white, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 20 },
  genreChipActive:    { borderColor: C.primary, backgroundColor: C.primaryLight },
  genreChipDisabled:  { opacity: 0.4 },
  genreChipTxt:       { fontSize: 12, color: C.sub },
  genreChipTxtActive: { color: C.primary, fontWeight: '600' },
  genreChipTxtDisabled: { color: C.muted },

  addManualBtn:  { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', padding: 14, borderWidth: 1.5, borderColor: C.primaryMid, borderStyle: 'dashed', borderRadius: 12, marginBottom: 16, backgroundColor: C.primaryLight },
  addManualText: { color: C.primary, fontWeight: '600', fontSize: 14 },

  detailsCard:      { backgroundColor: C.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2, gap: 8, marginBottom: 12 },
  detailsCardTitle: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 4 },
  detailsLabel:     { fontSize: 13, fontWeight: '600', color: C.sub, marginTop: 8 },


  cityRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, backgroundColor: '#f8fafc', borderRadius: 10, borderWidth: 1, borderColor: C.border },
  cityRowText: { flex: 1, fontSize: 15, color: C.text },
  input:       { backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 13, fontSize: 15, color: C.text },
  label:       { fontSize: 13, fontWeight: '600', color: C.sub, marginBottom: 6, marginTop: 4 },

  row3:      { flexDirection: 'row', gap: 8 },
  ltCard:    { flex: 1, alignItems: 'center', paddingVertical: 14, backgroundColor: C.white, borderRadius: 12, borderWidth: 2, borderColor: C.border, gap: 6 },
  ltIconWrap:{ width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  ltLabel:   { fontSize: 12, fontWeight: '600' },
  ltDot:     { width: 6, height: 6, borderRadius: 3 },

  chipRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:          { borderWidth: 1, borderColor: C.border, backgroundColor: C.white, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  chipActive:    { borderColor: C.primary, backgroundColor: C.primaryLight },
  chipText:      { fontSize: 13, color: C.muted },
  chipTextActive:{ color: C.primary, fontWeight: '600' },

  stickyBar:     { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, paddingBottom: 12, backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.border },
  stickyTrashBtn:{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, height: 48, borderRadius: 12, borderWidth: 1, borderColor: '#fee2e2', backgroundColor: '#fff5f5', justifyContent: 'center' },
  stickyTrashTxt: { fontSize: 13, fontWeight: '600', color: C.red },
  publishBtn:    { flex: 1, paddingVertical: 15, borderRadius: 12, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 4, elevation: 2 },
  publishBtnText:{ color: C.white, fontSize: 16, fontWeight: '600' },
  btnDisabled:   { opacity: 0.5 },

  // City modal
  modalContainer:  { flex: 1, backgroundColor: C.white },
  modalHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: C.border, paddingTop: 20 },
  modalTitle:      { fontSize: 18, fontWeight: '700', color: C.text },
  modalSearch:     { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 12, padding: 10, backgroundColor: '#f1f5f9', borderRadius: 10 },
  modalSearchInput:{ flex: 1, fontSize: 16, color: C.text },
  modalRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  modalRowActive:  { backgroundColor: C.primaryLight },
  modalRowText:    { fontSize: 16, color: C.text },

  // ── Crop modal ─────────────────────────────────────────────────────────────

  cropRoot: { flex: 1, backgroundColor: '#1a1a2e' },

  cropHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 20,
    paddingBottom: 14,
    backgroundColor: '#1a1a2e',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  cropHeaderTitle: { fontSize: 16, fontWeight: '700', color: C.white },
  cropHeaderSub:   { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 2 },

  cropImageArea: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },

  // Dark mask outside crop frame
  cropMask: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.6)' },

  // Fixed crop frame border
  cropFrameBorder: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.95)',
  },

  // Rule-of-thirds grid lines
  cropGrid: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.2)' },

  // Corner accent marks (L-shaped)
  corner: { position: 'absolute', width: 20, height: 20 },
  cornerTL: { top: -2, left: -2, borderTopWidth: 3, borderLeftWidth: 3, borderColor: C.white, borderTopLeftRadius: 2 },
  cornerTR: { top: -2, right: -2, borderTopWidth: 3, borderRightWidth: 3, borderColor: C.white, borderTopRightRadius: 2 },
  cornerBL: { bottom: -2, left: -2, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: C.white, borderBottomLeftRadius: 2 },
  cornerBR: { bottom: -2, right: -2, borderBottomWidth: 3, borderRightWidth: 3, borderColor: C.white, borderBottomRightRadius: 2 },

  // Controls panel
  cropControls: {
    backgroundColor: '#1a1a2e',
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 36 : 16,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
    gap: 10,
  },

  zoomLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  zoomLabel:    { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },
  zoomValue:    { fontSize: 13, fontWeight: '700', color: C.white },

  // Custom zoom slider
  sliderTrack: {
    height: 28, backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14, justifyContent: 'center', overflow: 'visible',
  },
  sliderFill: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    backgroundColor: C.primary, borderRadius: 14,
  },
  sliderThumb: {
    position: 'absolute', width: 24, height: 24,
    borderRadius: 12, backgroundColor: C.white,
    marginLeft: -12, top: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4, elevation: 4,
  },

  cropHint: { fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center' },

  cropBtnRow:          { flexDirection: 'row', gap: 8, marginTop: 4 },
  cropBtnOutline:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  cropBtnOutlineText:  { color: C.white, fontSize: 14, fontWeight: '600' },
  cropBtnPrimary:      { flex: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 10, backgroundColor: C.primary },
  cropBtnPrimaryText:  { color: C.white, fontSize: 14, fontWeight: '700' },

  // Confirmation overlay
  confirmOverlay:       { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', zIndex: 999 },
  confirmSheet:         { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24, alignItems: 'center', gap: 10 },
  confirmHandle:        { width: 40, height: 4, borderRadius: 2, backgroundColor: '#e7e5e4', marginBottom: 8 },
  confirmIconWrap:      { width: 64, height: 64, borderRadius: 20, backgroundColor: '#fee2e2', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  confirmTitle:         { fontSize: 19, fontWeight: '700', color: '#1c1917', textAlign: 'center' },
  confirmSub:           { fontSize: 14, color: '#78716c', textAlign: 'center', lineHeight: 20, marginBottom: 6 },
  confirmDestructiveBtn:{ flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%', backgroundColor: '#ef4444', borderRadius: 14, paddingVertical: 14, justifyContent: 'center' },
  confirmDestructiveTxt:{ fontSize: 16, fontWeight: '600', color: '#fff' },
  confirmCancelBtn:     { width: '100%', paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderColor: '#e7e5e4', alignItems: 'center', marginTop: 2 },
  confirmCancelTxt:     { fontSize: 15, fontWeight: '600', color: '#78716c' },

  // Genre picker button
  genrePickerBtn:    { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: C.primary + '55', borderStyle: 'dashed', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, alignSelf: 'flex-start', backgroundColor: C.primaryLight + '88' },
  genrePickerBtnTxt: { fontSize: 13, fontWeight: '600', color: C.primary },
});
