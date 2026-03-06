import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguageStore } from '../stores/languageStore';

const C = {
  white:        '#ffffff',
  bg:           '#fafaf9',
  border:       '#e7e5e4',
  text:         '#1c1917',
  sub:          '#78716c',
  muted:        '#a8a29e',
  primary:      '#2563eb',
  primaryLight: '#eff6ff',
  red:          '#ef4444',
  redLight:     '#fee2e2',
};

interface Category {
  key:     string;
  labelEn: string;
  labelHe: string;
}

const CATEGORIES: Category[] = [
  { key: 'spam',          labelEn: 'Spam',                 labelHe: 'ספאם'              },
  { key: 'harassment',    labelEn: 'Harassment',           labelHe: 'הטרדה'             },
  { key: 'inappropriate', labelEn: 'Inappropriate content',labelHe: 'תוכן לא הולם'      },
  { key: 'fake_account',  labelEn: 'Fake account',         labelHe: 'חשבון מזויף'       },
  { key: 'other',         labelEn: 'Other',                labelHe: 'אחר'               },
];

interface Props {
  visible:   boolean;
  onClose:   () => void;
  /** Called with (category, details) when the user taps Submit */
  onSubmit:  (category: string, details: string) => Promise<void>;
  titleEn:   string;
  titleHe:   string;
}

export function ReportModal({ visible, onClose, onSubmit, titleEn, titleHe }: Props) {
  const { isRTL } = useLanguageStore();

  const [selected,    setSelected]    = useState<string | null>(null);
  const [details,     setDetails]     = useState('');
  const [submitting,  setSubmitting]  = useState(false);

  const reset = () => {
    setSelected(null);
    setDetails('');
    setSubmitting(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    if (!selected || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(selected, details.trim());
      reset();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={s.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Dim overlay — tap to close */}
        <Pressable style={s.overlay} onPress={handleClose} />

        {/* Sheet */}
        <View style={s.sheet}>
          {/* Handle */}
          <View style={s.handle} />

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.scrollContent}
          >
            {/* Title */}
            <Text style={[s.title, isRTL && s.rAlign]}>
              {isRTL ? titleHe : titleEn}
            </Text>
            <Text style={[s.subtitle, isRTL && s.rAlign]}>
              {isRTL ? 'בחר סיבה לדיווח:' : 'Select a reason:'}
            </Text>

            {/* Category chips */}
            <View style={[s.chips, isRTL && s.chipsRTL]}>
              {CATEGORIES.map(cat => {
                const active = selected === cat.key;
                return (
                  <TouchableOpacity
                    key={cat.key}
                    style={[s.chip, active && s.chipActive]}
                    onPress={() => setSelected(cat.key)}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.chipTxt, active && s.chipTxtActive]}>
                      {isRTL ? cat.labelHe : cat.labelEn}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Details input */}
            <Text style={[s.inputLabel, isRTL && s.rAlign]}>
              {isRTL ? 'פרטים נוספים (אופציונלי)' : 'Additional details (optional)'}
            </Text>
            <TextInput
              style={[s.input, isRTL && s.inputRTL]}
              value={details}
              onChangeText={setDetails}
              placeholder={isRTL ? 'ספר לנו עוד...' : 'Tell us more...'}
              placeholderTextColor={C.muted}
              multiline
              maxLength={300}
              textAlignVertical="top"
              textAlign={isRTL ? 'right' : 'left'}
            />
            <Text style={[s.charCount, isRTL && s.rAlign]}>
              {details.length}/300
            </Text>

            {/* Actions */}
            <TouchableOpacity
              style={[s.submitBtn, !selected && s.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={!selected || submitting}
              activeOpacity={0.85}
            >
              {submitting
                ? <Text style={s.submitTxt}>{isRTL ? 'שולח...' : 'Sending...'}</Text>
                : (
                  <>
                    <Ionicons name="flag" size={16} color={C.white} />
                    <Text style={s.submitTxt}>{isRTL ? 'שלח דיווח' : 'Submit report'}</Text>
                  </>
                )
              }
            </TouchableOpacity>

            <TouchableOpacity style={s.cancelBtn} onPress={handleClose} activeOpacity={0.7}>
              <Text style={s.cancelTxt}>{isRTL ? 'ביטול' : 'Cancel'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  kav: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: C.white,
    borderTopLeftRadius:  20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: C.border,
    height: '72%',
  },
  handle: {
    width: 36, height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    paddingTop: 16,
  },

  title:    { fontSize: 20, fontWeight: '700', color: C.text, marginBottom: 6 },
  subtitle: { fontSize: 14, color: C.sub, marginBottom: 16 },
  rAlign:   { textAlign: 'right' },

  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  chipsRTL: { flexDirection: 'row-reverse' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.bg,
  },
  chipActive: {
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
  },
  chipTxt:       { fontSize: 13, fontWeight: '500', color: C.sub },
  chipTxtActive: { color: C.red, fontWeight: '600' },

  inputLabel: { fontSize: 13, fontWeight: '600', color: C.sub, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    backgroundColor: C.bg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: C.text,
    minHeight: 88,
    maxHeight: 140,
  },
  inputRTL: { textAlign: 'right' },
  charCount: { fontSize: 11, color: C.muted, marginTop: 4, marginBottom: 24 },

  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.red,
    borderRadius: 12,
    paddingVertical: 15,
    marginBottom: 12,
  },
  submitBtnDisabled: { backgroundColor: '#fca5a5' },
  submitTxt: { color: C.white, fontSize: 15, fontWeight: '600' },

  cancelBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelTxt: { fontSize: 15, color: C.muted, fontWeight: '500' },
});
