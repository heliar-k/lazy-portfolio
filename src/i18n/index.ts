import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import zh from './locales/zh.json';

const savedLang = localStorage.getItem('i18nextLng');
const browserLang = navigator.language.startsWith('zh') ? 'zh' : 'en';
const defaultLang = savedLang || browserLang;

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
  },
  lng: defaultLang,
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

if (defaultLang) {
  document.documentElement.lang = defaultLang;
}

export default i18n;
