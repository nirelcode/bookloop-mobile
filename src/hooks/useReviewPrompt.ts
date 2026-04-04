import { useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import { useAuthStore } from '../stores/authStore';

const REVIEW_KEY = 'bookloop_review_v2';
const WISHLIST_COUNT_KEY = 'bookloop_wishlist_add_count';
const MAX_ASKS = 3;
const COOLDOWN = 45 * 24 * 60 * 60 * 1000; // 45 days
const MIN_AGE = 7 * 24 * 60 * 60 * 1000; // account must be ≥ 7 days old

interface ReviewData {
  status: string | null;
  askCount: number;
  askedAt: number;
}

function getReviewData(raw: string | null): ReviewData {
  return raw ? JSON.parse(raw) : { status: null, askCount: 0, askedAt: 0 };
}

export function useReviewPrompt() {
  const [visible, setVisible] = useState(false);
  const profile = useAuthStore(s => s.profile);

  /** Check if we should show the review prompt (with full guards: age, cooldown, max asks) */
  const maybeShow = useCallback(async () => {
    try {
      const createdAt = profile?.created_at ? new Date(profile.created_at).getTime() : Date.now();
      if (Date.now() - createdAt < MIN_AGE) return;

      const raw = await AsyncStorage.getItem(REVIEW_KEY);
      const data = getReviewData(raw);

      if (data.status === 'dismissed') return;
      if (data.status === 'reviewed') return;
      if (data.askCount >= MAX_ASKS) return;
      if (data.askedAt && Date.now() - data.askedAt < COOLDOWN) return;

      setVisible(true);
    } catch {}
  }, [profile]);

  /** Show review prompt without time guards — only blocks if already reviewed or dismissed */
  const maybeShowDirect = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(REVIEW_KEY);
      const data = getReviewData(raw);

      if (data.status === 'dismissed') return;
      if (data.status === 'reviewed') return;

      setVisible(true);
    } catch {}
  }, []);

  /**
   * Check if we should show after a wishlist add.
   * Only triggers after 3+ total wishlist adds. No time guards.
   */
  const maybeShowAfterWishlist = useCallback(async () => {
    try {
      const countRaw = await AsyncStorage.getItem(WISHLIST_COUNT_KEY);
      const count = (countRaw ? parseInt(countRaw, 10) : 0) + 1;
      await AsyncStorage.setItem(WISHLIST_COUNT_KEY, String(count));
      if (count >= 3) {
        await maybeShowDirect();
      }
    } catch {}
  }, [maybeShowDirect]);

  /** User tapped "Yes" — open store review, never ask again */
  const handleYes = useCallback(async () => {
    setVisible(false);
    try {
      await AsyncStorage.setItem(REVIEW_KEY, JSON.stringify({
        status: 'reviewed', askedAt: Date.now(),
      }));
      const ok = await StoreReview.isAvailableAsync();
      if (ok) StoreReview.requestReview();
    } catch {}
  }, []);

  /** User tapped "Not now" — increment count, respect cooldown */
  const handleNotNow = useCallback(async () => {
    setVisible(false);
    try {
      const raw = await AsyncStorage.getItem(REVIEW_KEY);
      const data = getReviewData(raw);
      await AsyncStorage.setItem(REVIEW_KEY, JSON.stringify({
        ...data, askedAt: Date.now(), askCount: (data.askCount || 0) + 1,
      }));
    } catch {}
  }, []);

  /** User tapped "Don't ask again" — permanent dismiss */
  const handleDismiss = useCallback(async () => {
    setVisible(false);
    try {
      await AsyncStorage.setItem(REVIEW_KEY, JSON.stringify({ status: 'dismissed' }));
    } catch {}
  }, []);

  return { visible, maybeShow, maybeShowDirect, maybeShowAfterWishlist, handleYes, handleNotNow, handleDismiss };
}
