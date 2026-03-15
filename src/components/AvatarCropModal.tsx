/**
 * AvatarCropModal
 * Full-screen drag + pinch-to-zoom avatar cropper.
 * Uses PanResponder + Animated (no extra gesture libraries needed).
 * Web: scroll-wheel zoom via addEventListener('wheel').
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { cropImage, getImageDimensions } from '../lib/imageUtils';

// ── Constants ────────────────────────────────────────────────────────────────

const CROP_D = 280; // crop circle diameter in dp
const { width: SW, height: SH } = Dimensions.get('window');

// ── Types ────────────────────────────────────────────────────────────────────

interface Props {
  uri:       string | null;
  isRTL?:    boolean;
  onConfirm: (croppedUri: string) => void;
  onCancel:  () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function AvatarCropModal({ uri, isRTL, onConfirm, onCancel }: Props) {
  const [dims, setDims]             = useState<{ w: number; h: number } | null>(null);
  const [processing, setProcessing] = useState(false);

  // ── Animated values (stable refs — never re-created) ──
  const pan     = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const scaleAV = useRef(new Animated.Value(1)).current;

  // ── Raw mirrors for crop math (always up-to-date) ──
  const panR   = useRef({ x: 0, y: 0 });
  const scaleR = useRef(1);
  const fitR   = useRef(1); // scale: fills the crop circle at scaleR=1

  // ── Gesture helpers ──
  const pinching = useRef(false);
  const prevDist = useRef(0);

  // ── Reset + load dimensions when uri changes ──────────────────────────────
  useEffect(() => {
    if (!uri) return;

    pan.setValue({ x: 0, y: 0 });
    scaleAV.setValue(1);
    panR.current   = { x: 0, y: 0 };
    scaleR.current = 1;
    fitR.current   = 1;
    setDims(null);
    setProcessing(false);

    getImageDimensions(uri).then(({ width, height }) => {
      // Fill the crop circle (larger dimension = CROP_D)
      fitR.current = Math.max(CROP_D / width, CROP_D / height);
      setDims({ w: width, h: height });
    });
  }, [uri]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Web: scroll-wheel zoom ────────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'web' || !uri) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const next = clamp(scaleR.current * (e.deltaY < 0 ? 1.08 : 0.93), 0.4, 8);
      scaleR.current = next;
      scaleAV.setValue(next);
    };
    (window as any).addEventListener('wheel', onWheel, { passive: false });
    return () => (window as any).removeEventListener('wheel', onWheel);
  }, [uri]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── PanResponder ─────────────────────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      // Always claim immediately — avoids Android dropping single-touch drag
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      // Never yield to another responder once we have the gesture
      onPanResponderTerminationRequest: () => false,

      onPanResponderGrant: (e) => {
        const ts = e.nativeEvent.touches;
        if (ts && ts.length >= 2) {
          pinching.current = true;
          prevDist.current = touchDist(ts[0], ts[1]);
          // Don't touch pan offset — position stays as-is during pinch
        } else {
          pinching.current = false;
          prevDist.current = 0;
          // Offset accumulates previous pan so dx/dy are relative to grant point
          pan.setOffset(panR.current);
          pan.setValue({ x: 0, y: 0 });
        }
      },

      onPanResponderMove: (e, gs) => {
        const ts = e.nativeEvent.touches;
        if (ts && ts.length >= 2) {
          // Transition: single touch → pinch
          if (!pinching.current) {
            pinching.current = true;
            // Commit the pan accumulated so far, then start fresh for pinch
            pan.flattenOffset();
            panR.current = { x: panR.current.x + gs.dx, y: panR.current.y + gs.dy };
            prevDist.current = touchDist(ts[0], ts[1]);
            return;
          }
          const d = touchDist(ts[0], ts[1]);
          if (prevDist.current > 0) {
            const next = clamp(scaleR.current * (d / prevDist.current), 0.4, 8);
            scaleR.current = next;
            scaleAV.setValue(next);
          }
          prevDist.current = d;
        } else if (!pinching.current) {
          pan.setValue({ x: gs.dx, y: gs.dy });
        }
      },

      onPanResponderRelease: (_e, gs) => {
        if (!pinching.current) {
          pan.flattenOffset();
          panR.current = {
            x: panR.current.x + gs.dx,
            y: panR.current.y + gs.dy,
          };
        }
        pinching.current = false;
        prevDist.current  = 0;
      },

      onPanResponderTerminate: () => {
        pinching.current = false;
        prevDist.current = 0;
        pan.flattenOffset();
      },
    })
  ).current;

  // ── Confirm: crop → resize → return URI ──────────────────────────────────
  const handleConfirm = useCallback(async () => {
    if (!uri || !dims) return;
    setProcessing(true);
    try {
      // Total display scale: how many screen dp per original image pixel
      const ds = fitR.current * scaleR.current;

      // Where is the crop circle's centre in original-image pixel coordinates?
      // Image centre on screen = (SW/2 + panR.x, SH/2 + panR.y)
      // Circle centre on screen = (SW/2, SH/2)
      // Offset of circle from image centre = (-panR.x, -panR.y)
      // In original px = (-panR.x / ds, -panR.y / ds)
      const cx = dims.w / 2 - panR.current.x / ds;
      const cy = dims.h / 2 - panR.current.y / ds;

      // Crop radius in original px
      const r = (CROP_D / 2) / ds;

      const ox = clamp(Math.round(cx - r), 0, dims.w - 1);
      const oy = clamp(Math.round(cy - r), 0, dims.h - 1);
      const sz = Math.min(
        Math.round(r * 2),
        dims.w - ox,
        dims.h - oy,
      );

      // Crop square region
      const cropped = await cropImage(uri, ox, oy, sz, sz);

      // Resize to ≤512 px (never upscale) + JPEG compression
      const targetSide = Math.min(sz, 512);
      const final = await ImageManipulator.manipulateAsync(
        cropped,
        targetSide < sz ? [{ resize: { width: targetSide, height: targetSide } }] : [],
        { compress: 0.88, format: ImageManipulator.SaveFormat.JPEG },
      );

      onConfirm(final.uri);
    } catch (err) {
      console.warn('[AvatarCropModal] error:', err);
      setProcessing(false);
    }
  }, [uri, dims, onConfirm]);

  // ── Layout helpers ────────────────────────────────────────────────────────
  if (!uri) return null;

  const baseW = dims ? dims.w * fitR.current : CROP_D;
  const baseH = dims ? dims.h * fitR.current : CROP_D;
  const padH  = (SH - CROP_D) / 2;
  const padX  = (SW - CROP_D) / 2;

  return (
    <Modal
      visible
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <View style={s.root}>

        {/* ── Draggable / zoomable image ── */}
        <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers}>
          <View style={s.center}>
            {dims ? (
              <Animated.Image
                source={{ uri }}
                style={{
                  width:  baseW,
                  height: baseH,
                  transform: [
                    { translateX: pan.x },
                    { translateY: pan.y },
                    { scale: scaleAV },
                  ],
                }}
                resizeMode="cover"
              />
            ) : (
              <ActivityIndicator color="#fff" size="large" />
            )}
          </View>
        </View>

        {/* ── Dark mask: 4 bars + circle ring ── */}
        <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' } as any]}>
          {/* Top */}
          <View style={[s.mask, { top: 0, left: 0, right: 0, height: padH }]} />
          {/* Bottom */}
          <View style={[s.mask, { top: padH + CROP_D, left: 0, right: 0, bottom: 0 }]} />
          {/* Left */}
          <View style={[s.mask, { top: padH, left: 0, width: padX, height: CROP_D }]} />
          {/* Right */}
          <View style={[s.mask, { top: padH, right: 0, width: padX, height: CROP_D }]} />
          {/* White circle border ring */}
          <View style={[s.ring, { top: padH - 2, left: padX - 2 }]} />
        </View>

        {/* ── Hint text ── */}
        <View style={[s.hintWrap, { top: padH + CROP_D + 16, pointerEvents: 'none' } as any]}>
          <Text style={s.hintTxt}>
            {isRTL ? 'גרור • צבוט לזום' : 'Drag  •  Pinch to zoom'}
          </Text>
          {Platform.OS === 'web' && (
            <Text style={[s.hintTxt, { marginTop: 3 }]}>
              {isRTL ? 'גלגלת עכבר לזום' : 'Scroll wheel to zoom'}
            </Text>
          )}
        </View>

        {/* ── Action buttons ── */}
        <View style={[s.btnRow, isRTL && { flexDirection: 'row-reverse' }]}>
          <TouchableOpacity
            style={s.cancelBtn}
            onPress={onCancel}
            disabled={processing}
            activeOpacity={0.8}
          >
            <Text style={s.cancelTxt}>{isRTL ? 'ביטול' : 'Cancel'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.useBtn}
            onPress={handleConfirm}
            disabled={processing}
            activeOpacity={0.8}
          >
            {processing
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.useTxt}>{isRTL ? 'אישור' : 'Use Photo'}</Text>
            }
          </TouchableOpacity>
        </View>

      </View>
    </Modal>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number) {
  return Math.min(Math.max(v, lo), hi);
}

function touchDist(
  a: { pageX: number; pageY: number },
  b: { pageX: number; pageY: number },
) {
  return Math.hypot(b.pageX - a.pageX, b.pageY - a.pageY);
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#0d0d0d' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Dark overlay bars
  mask: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.68)',
  },

  // White circle ring marking the crop boundary
  ring: {
    position:     'absolute',
    width:        CROP_D + 4,
    height:       CROP_D + 4,
    borderRadius: (CROP_D + 4) / 2,
    borderWidth:  2.5,
    borderColor:  '#ffffff',
  },

  // Hint text below the circle
  hintWrap: {
    position: 'absolute',
    left: 0, right: 0,
    alignItems: 'center',
  },
  hintTxt: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    letterSpacing: 0.2,
  },

  // Buttons
  btnRow: {
    position:  'absolute',
    bottom:    44,
    left:      24,
    right:     24,
    flexDirection: 'row',
    gap:       10,
  },
  cancelBtn: {
    flex:           1,
    paddingVertical: 14,
    borderRadius:   12,
    borderWidth:    1,
    borderColor:    'rgba(255,255,255,0.28)',
    alignItems:     'center',
  },
  cancelTxt: { color: '#fff', fontSize: 15, fontWeight: '500' },

  useBtn: {
    flex:            2,
    paddingVertical: 14,
    borderRadius:    12,
    backgroundColor: '#2563eb',
    alignItems:      'center',
  },
  useTxt: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
