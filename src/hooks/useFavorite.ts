import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';

export function useFavorite(bookId: string) {
  const user             = useAuthStore(s => s.user);
  const isFavorite       = useDataStore(s => s.favoriteIds.includes(bookId));
  const addFavoriteId    = useDataStore(s => s.addFavoriteId);
  const removeFavoriteId = useDataStore(s => s.removeFavoriteId);
  const invalidateWishlist = useDataStore(s => s.invalidateWishlist);
  const [loading, setLoading] = useState(false);

  const toggleFavorite = useCallback(async () => {
    if (!user) return;
    const wasInFavorites = isFavorite;

    // Optimistic update
    if (wasInFavorites) removeFavoriteId(bookId);
    else addFavoriteId(bookId);

    setLoading(true);
    try {
      if (wasInFavorites) {
        await supabase.from('favorites').delete().eq('user_id', user.id).eq('book_id', bookId);
      } else {
        await supabase.from('favorites').insert({ user_id: user.id, book_id: bookId });
      }
      // Invalidate wishlist cache so WishlistScreen refreshes on next visit
      invalidateWishlist();
    } catch (error: any) {
      // Revert optimistic update on failure
      if (wasInFavorites) addFavoriteId(bookId);
      else removeFavoriteId(bookId);
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  }, [user, bookId, isFavorite, addFavoriteId, removeFavoriteId, invalidateWishlist]);

  return { isFavorite, toggleFavorite, loading };
}
