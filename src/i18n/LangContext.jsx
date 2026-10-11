/* eslint-disable react-refresh/only-export-components */
/**
 * One language setting for the whole app (persisted). The landing page keeps its
 * original copy object (`t` from useLang); newer screens use `useT()`, which takes the
 * English text as the key and looks it up in src/i18n/messages.js.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { TRANSLATIONS } from './landing';
import { MESSAGES } from './messages';

const LangCtx = createContext({ lang: 'fr', setLang: () => {}, t: TRANSLATIONS.fr, dir: 'ltr' });
const STORAGE_KEY = 'hk_lang';

function readStoredLang() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return TRANSLATIONS[stored] ? stored : 'fr';
  } catch {
    return 'fr';
  }
}

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(readStoredLang);
  const setLang = useCallback((next) => {
    setLangState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* storage unavailable */ }
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const value = useMemo(() => ({ lang, setLang, t: TRANSLATIONS[lang], dir: TRANSLATIONS[lang].dir }), [lang, setLang]);
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

export const useLang = () => useContext(LangCtx);

/** Build a translator. English text is the key; `{name}` placeholders are interpolated. */
export function makeT(lang) {
  const dict = MESSAGES[lang] ?? {};
  const t = (key, vars) => {
    let s = dict[key] ?? key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
    return s;
  };
  t.has = (key) => lang === 'en' || Object.prototype.hasOwnProperty.call(dict, key);
  t.lang = lang;
  return t;
}

/**
 * @param {{ dashboard?: boolean }} [opts] dashboards are French/English only (Arabic falls back to French).
 */
export function useT({ dashboard = false } = {}) {
  const { lang } = useLang();
  const effective = dashboard && lang === 'ar' ? 'fr' : lang;
  return useMemo(() => makeT(effective), [effective]);
}

/** Pick the translated catalogue field: name / nameEn / nameAr (falls back to the French base). */
export function localized(obj, field, lang) {
  if (!obj) return '';
  const suffix = lang === 'en' ? 'En' : lang === 'ar' ? 'Ar' : '';
  return (suffix && obj[`${field}${suffix}`]) || obj[field] || '';
}
