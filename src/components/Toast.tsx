import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// ── Toast ─────────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error';

interface ToastAction {
  label: string;
  onPress: () => void;
}

interface ToastData {
  message: string;
  visible: boolean;
  type: ToastType;
  action?: ToastAction;
}

export function useToast() {
  const [toast, setToast] = useState<ToastData>({ message: '', visible: false, type: 'success' });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: ToastType = 'success', action?: ToastAction) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ message, visible: true, type, action });
    timer.current = setTimeout(() => {
      setToast(t => ({ ...t, visible: false }));
    }, 3500);
  }, []);

  return { showToast, toast };
}

export function Toast({ message, visible, type = 'success', action }: ToastData) {
  const opacity  = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(visible);

  useEffect(() => {
    if (visible) {
      setShown(true);
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    } else {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
        setShown(false);
      });
    }
  }, [visible]);

  if (!shown) return null;

  return (
    <Animated.View
      style={[ts.container, type === 'error' && ts.error, { opacity }]}
      pointerEvents="box-none"
    >
      <Ionicons
        name={type === 'success' ? 'checkmark-circle' : 'alert-circle'}
        size={17}
        color="#fff"
      />
      <Text style={ts.text}>{message}</Text>
      {action && (
        <TouchableOpacity onPress={action.onPress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={ts.actionTxt}>{action.label}</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

const ts = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 28,
    left: 20,
    right: 20,
    backgroundColor: '#1c1917',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 999,
  },
  error: { backgroundColor: '#ef4444' },
  text:      { color: '#fff', fontSize: 14, fontWeight: '600', flex: 1 },
  actionTxt: { color: '#93c5fd', fontSize: 14, fontWeight: '700' },
});

// ── Fetch error banner ────────────────────────────────────────────────────────

interface FetchErrorBannerProps {
  message: string;
  retryLabel?: string;
  onRetry?: () => void;
}

export function FetchErrorBanner({ message, retryLabel, onRetry }: FetchErrorBannerProps) {
  return (
    <View style={fb.container}>
      <Ionicons name="cloud-offline-outline" size={15} color="#ef4444" />
      <Text style={fb.text}>{message}</Text>
      {onRetry && retryLabel ? (
        <TouchableOpacity onPress={onRetry} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={fb.retry}>{retryLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const fb = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fee2e2',
    borderRadius: 10,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  text:  { flex: 1, fontSize: 13, color: '#ef4444' },
  retry: { fontSize: 13, fontWeight: '600', color: '#ef4444', textDecorationLine: 'underline' },
});
