import i18n from '../lib/i18n';

// Simple utility to get translations
export const t = (key: string, params?: Record<string, string | number>): string => {
  return i18n.t(key, params);
};

// Get nested translation
export const tn = (path: string): string => {
  const keys = path.split('.');
  let value: any = i18n.translations[i18n.locale];

  for (const key of keys) {
    value = value?.[key];
  }

  return value || path;
};
