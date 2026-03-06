import { I18n } from 'i18n-js';
import * as Localization from 'expo-localization';
import { en } from '../locales/en';
import { he } from '../locales/he';

const i18n = new I18n({
  en,
  he,
});

// Set the locale based on device settings
const deviceLocale = Localization.locale || Localization.getLocales()[0]?.languageCode || 'en';
const languageCode = deviceLocale.split('-')[0]; // Get 'en' from 'en-US'
i18n.locale = languageCode === 'he' ? 'he' : 'en';

// Enable fallback to English if translation is missing
i18n.enableFallback = true;
i18n.defaultLocale = 'en';

export default i18n;
