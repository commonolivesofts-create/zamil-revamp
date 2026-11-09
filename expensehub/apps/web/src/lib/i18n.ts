// UI-UX §9 — every UI string lives in locales/*.json from day 1 (Arabic in phase 3).
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en.json';

export const resources = { en: { translation: en } } as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  initAsync: false,
  interpolation: { escapeValue: false },
  showSupportNotice: false,
});

export default i18n;
