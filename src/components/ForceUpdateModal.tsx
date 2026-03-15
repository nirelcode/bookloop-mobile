import { Modal, View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.bookloop.mobile';

const C = {
  bg: '#fafaf9',
  text: '#1c1917',
  sub: '#78716c',
  primary: '#2563eb',
  white: '#ffffff',
  border: '#e7e5e4',
};

interface Props {
  mode: 'force' | 'suggest' | 'none';
  onDismiss: () => void;
}

export function ForceUpdateModal({ mode, onDismiss }: Props) {
  if (mode === 'none') return null;

  const isForce = mode === 'force';

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={isForce ? undefined : onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="arrow-up-circle" size={48} color={C.primary} />
          </View>
          <Text style={styles.title}>
            {isForce ? 'עדכון נדרש' : 'עדכון זמין'}
          </Text>
          <Text style={styles.body}>
            {isForce
              ? 'גרסה חדשה של BookLoop זמינה.\nיש לעדכן את האפליקציה כדי להמשיך.'
              : 'גרסה חדשה של BookLoop זמינה.\nמומלץ לעדכן לחוויה הטובה ביותר.'}
          </Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => Linking.openURL(PLAY_STORE_URL)}
            activeOpacity={0.85}
          >
            <Text style={styles.buttonText}>עדכן עכשיו</Text>
          </TouchableOpacity>
          {!isForce && (
            <TouchableOpacity style={styles.dismissButton} onPress={onDismiss} activeOpacity={0.7}>
              <Text style={styles.dismissText}>אחר כך</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  card: {
    backgroundColor: C.white,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    borderWidth: 1,
    borderColor: C.border,
  },
  iconWrap: {
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: C.text,
    marginBottom: 10,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    color: C.sub,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  button: {
    backgroundColor: C.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 40,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: C.white,
    fontSize: 15,
    fontWeight: '600',
  },
  dismissButton: {
    marginTop: 14,
    paddingVertical: 6,
  },
  dismissText: {
    fontSize: 14,
    color: C.sub,
  },
});
