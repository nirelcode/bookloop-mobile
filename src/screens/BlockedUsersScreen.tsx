import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';
import { useDataStore } from '../stores/dataStore';
import { useToast, Toast } from '../components/Toast';

const C = {
  bg:      '#fafaf9',
  white:   '#ffffff',
  border:  '#e7e5e4',
  text:    '#1c1917',
  sub:     '#78716c',
  muted:   '#a8a29e',
  primary: '#2563eb',
  primaryLight: '#eff6ff',
  red:     '#ef4444',
  redLight:'#fee2e2',
};

interface BlockedUser {
  blocked_id: string;
  profile: { id: string; name: string; avatar_url?: string } | null;
}

export default function BlockedUsersScreen() {
  const navigation = useNavigation<any>();
  const { user }   = useAuthStore();
  const { isRTL }  = useLanguageStore();
  const { removeBlockedId, addBlockedId } = useDataStore();
  const { showToast, toast } = useToast();

  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    navigation.setOptions({
      title: isRTL ? 'משתמשים חסומים' : 'Blocked Users',
    });
  }, [isRTL]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('blocked_users')
      .select('blocked_id, profile:profiles!blocked_users_blocked_id_fkey(id, name, avatar_url)')
      .eq('blocker_id', user.id)
      .order('created_at', { ascending: false });
    setBlockedUsers((data as any[]) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const handleUnblock = async (item: BlockedUser) => {
    if (!user) return;
    // Optimistic: remove from list immediately
    removeBlockedId(item.blocked_id);
    setBlockedUsers(prev => prev.filter(u => u.blocked_id !== item.blocked_id));
    await supabase.from('blocked_users').delete()
      .eq('blocker_id', user.id)
      .eq('blocked_id', item.blocked_id);
    showToast(
      isRTL ? 'החסימה בוטלה' : 'User unblocked',
      'success',
      {
        label: isRTL ? 'בטל' : 'Undo',
        onPress: async () => {
          await supabase.from('blocked_users').insert({
            blocker_id: user.id,
            blocked_id: item.blocked_id,
          });
          addBlockedId(item.blocked_id);
          setBlockedUsers(prev => [...prev, item]);
        },
      },
    );
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={C.primary} />
      </View>
    );
  }

  if (blockedUsers.length === 0) {
    return (
      <View style={s.center}>
        <View style={s.emptyIconWrap}>
          <Ionicons name="shield-checkmark-outline" size={44} color={C.muted} />
        </View>
        <Text style={s.emptyTitle}>{isRTL ? 'אין משתמשים חסומים' : 'No blocked users'}</Text>
        <Text style={s.emptySub}>
          {isRTL
            ? 'משתמשים שחסמת יופיעו כאן'
            : 'Users you block will appear here'}
        </Text>
      </View>
    );
  }

  const renderItem = ({ item }: { item: BlockedUser }) => {
    const name    = item.profile?.name || 'Unknown user';
    const initial = name.charAt(0).toUpperCase();
    const avatar  = item.profile?.avatar_url;

    return (
      <View style={[s.row, isRTL && s.rowRTL]}>
        {/* Avatar */}
        <View style={[s.avatar, s.avatarFallback]}>
          <Text style={s.avatarTxt}>{initial}</Text>
          {avatar && (
            <Image
              source={{ uri: avatar }}
              style={StyleSheet.absoluteFillObject}
              contentFit="cover"
            />
          )}
        </View>

        {/* Name */}
        <Text style={[s.name, { flex: 1 }]} numberOfLines={1}>{name}</Text>

        {/* Unblock button */}
        <TouchableOpacity
          style={s.unblockBtn}
          onPress={() => handleUnblock(item)}
          activeOpacity={0.75}
        >
          <Text style={s.unblockTxt}>{isRTL ? 'בטל חסימה' : 'Unblock'}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={s.container}>
      <FlatList
        data={blockedUsers}
        renderItem={renderItem}
        keyExtractor={item => item.blocked_id}
        contentContainerStyle={s.list}
        ItemSeparatorComponent={() => <View style={s.separator} />}
      />
      <Toast {...toast} />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  list:      { paddingBottom: 32 },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },

  emptyIconWrap: {
    width: 96, height: 96, borderRadius: 28,
    backgroundColor: '#f5f5f4',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: C.text, marginBottom: 8, textAlign: 'center' },
  emptySub:   { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 21 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: C.white,
    gap: 12,
  },
  rowRTL: { flexDirection: 'row-reverse' },

  avatar: { width: 46, height: 46, borderRadius: 23, overflow: 'hidden', flexShrink: 0 },
  avatarFallback: {
    backgroundColor: C.primaryLight,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarTxt: { fontSize: 18, fontWeight: '700', color: C.primary },

  name: { fontSize: 15, fontWeight: '500', color: C.text },

  unblockBtn: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.red,
  },
  unblockTxt: { fontSize: 13, fontWeight: '600', color: C.red },

  separator: { height: 1, backgroundColor: C.border, marginLeft: 74 },
});
