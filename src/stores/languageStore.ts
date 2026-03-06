import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '../lib/i18n';

interface LanguageState {
  language: string;
  isRTL: boolean;
  setLanguage: (lang: string) => Promise<void>;
  initializeLanguage: () => Promise<void>;
}

export const useLanguageStore = create<LanguageState>((set) => ({
  language: 'he',
  isRTL: true,

  setLanguage: async (lang: string) => {
    try {
      await AsyncStorage.setItem('app_language', lang);
      i18n.locale = lang;
      const isRTL = lang === 'he';
      // RTL layout is handled entirely in JS (custom tab bar + explicit isRTL checks).
      // Do NOT call I18nManager.forceRTL — it conflicts with our JS reversal.
      set({ language: lang, isRTL });
    } catch (error) {
      console.error('Error setting language:', error);
    }
  },

  initializeLanguage: async () => {
    try {
      // Try to get saved language
      const savedLang = await AsyncStorage.getItem('app_language');

      let language = savedLang;

      // If no saved language, default to Hebrew
      if (!language) {
        language = 'he';
      }

      // Update i18n and state
      i18n.locale = language;
      const isRTL = language === 'he';
      set({ language, isRTL });
    } catch (error) {
      console.error('Error initializing language:', error);
    }
  },
}));
