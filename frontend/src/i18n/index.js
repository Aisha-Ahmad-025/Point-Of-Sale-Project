import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enCommon from './locales/en/common.json';
import enPages from './locales/en/pages.json';

// The app is English-only. i18next is kept purely as an organised text catalogue (locales/en/*.json),
// so no user-facing strings are scattered through the components.
i18n.use(initReactI18next).init({
  resources: { en: { translation: { ...enCommon, ...enPages } } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});
document.documentElement.lang = 'en';
document.documentElement.dir = 'ltr';

export default i18n;
