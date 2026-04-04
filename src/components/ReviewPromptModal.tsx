import React from 'react';
import { Modal, Pressable, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useLanguageStore } from '../stores/languageStore';

interface Props {
  visible: boolean;
  onYes: () => void;
  onNotNow: () => void;
  onDismiss: () => void;
}

export function ReviewPromptModal({ visible, onYes, onNotNow, onDismiss }: Props) {
  const isRTL = useLanguageStore(s => s.isRTL);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onNotNow}>
      <Pressable style={s.overlay} onPress={onNotNow}>
        <Pressable style={s.sheet} onPress={() => {}}>
          <Text style={s.emoji}>⭐</Text>
          <Text style={s.title}>{isRTL ? 'נהנה מ-BookLoop?' : 'Enjoying BookLoop?'}</Text>
          <Text style={s.sub}>
            {isRTL
              ? 'דירוג קצר עוזר לנו לגדול ולהביא עוד ספרים לקהילה'
              : 'A quick rating helps us grow and bring more books to the community'}
          </Text>
          <TouchableOpacity style={s.yesBtn} onPress={onYes} activeOpacity={0.85}>
            <Text style={s.yesTxt}>{isRTL ? 'כן, אוהב את האפליקציה! ⭐' : 'Yes, I love it! ⭐'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.noBtn} onPress={onNotNow} activeOpacity={0.8}>
            <Text style={s.noTxt}>{isRTL ? 'לא עכשיו' : 'Not right now'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onDismiss} activeOpacity={0.7}>
            <Text style={s.dismissTxt}>{isRTL ? 'אל תשאל שוב' : "Don't ask again"}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  sheet:      { backgroundColor: '#fff', borderRadius: 20, padding: 28, width: '100%', alignItems: 'center', gap: 8 },
  emoji:      { fontSize: 40, marginBottom: 4 },
  title:      { fontSize: 20, fontWeight: '700', color: '#1c1917', textAlign: 'center' },
  sub:        { fontSize: 14, color: '#78716c', textAlign: 'center', lineHeight: 20, marginBottom: 8 },
  yesBtn:     { backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 13, paddingHorizontal: 24, width: '100%', alignItems: 'center' },
  yesTxt:     { color: '#fff', fontSize: 15, fontWeight: '600' },
  noBtn:      { borderWidth: 1, borderColor: '#e7e5e4', borderRadius: 12, paddingVertical: 11, paddingHorizontal: 24, width: '100%', alignItems: 'center' },
  noTxt:      { color: '#78716c', fontSize: 15, fontWeight: '500' },
  dismissTxt: { fontSize: 13, color: '#a8a29e', marginTop: 4, textDecorationLine: 'underline' },
});
