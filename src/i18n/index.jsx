import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { translations, LANGS } from './translations.js';
import { setMuted as setSoundMuted, isMuted } from '../game/sound.js';

const SUPPORTED = LANGS.map((l) => l.code);
const DEFAULT_LANG = 'pt';

// ─── idioma (módulo, acessível fora do React, ex.: reducers) ──────────────────
function detectLang() {
  try {
    const saved = localStorage.getItem('lang');
    if (saved && SUPPORTED.includes(saved)) return saved;
  } catch {
    // ignore
  }
  const nav = (typeof navigator !== 'undefined' && navigator.language) || '';
  const base = nav.toLowerCase().split('-')[0];
  if (SUPPORTED.includes(base)) return base;
  return DEFAULT_LANG;
}

let currentLang = detectLang();

function interpolate(str, params) {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (k in params ? params[k] : m));
}

// Tradução fora do React (reducers, sound, etc.)
export function tr(key, params) {
  const dict = translations[currentLang] || translations[DEFAULT_LANG];
  const value = dict[key] ?? translations[DEFAULT_LANG][key] ?? key;
  return interpolate(value, params);
}

export function setCurrentLang(lang) {
  currentLang = SUPPORTED.includes(lang) ? lang : DEFAULT_LANG;
  try {
    localStorage.setItem('lang', currentLang);
  } catch {
    // ignore
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = currentLang === 'pt' ? 'pt-BR' : currentLang;
    document.title = tr('app.title');
  }
}

export function getCurrentLang() {
  return currentLang;
}

// ─── tema ─────────────────────────────────────────────────────────────────────
function detectTheme() {
  try {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // ignore
  }
  return 'dark';
}

function applyTheme(theme) {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#eef1ff' : '#07071a');
  }
}

// Aplica idioma e tema o quanto antes (na importação, antes do primeiro paint).
setCurrentLang(currentLang);
applyTheme(detectTheme());

// ─── contexto React ───────────────────────────────────────────────────────────
const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [lang, setLangState] = useState(currentLang);
  const [theme, setThemeState] = useState(detectTheme);
  const [muted, setMutedState] = useState(isMuted);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem('theme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const setLang = useCallback((next) => {
    setCurrentLang(next);
    setLangState(getCurrentLang());
  }, []);

  const setTheme = useCallback((next) => setThemeState(next), []);
  const toggleTheme = useCallback(
    () => setThemeState((t) => (t === 'light' ? 'dark' : 'light')),
    []
  );

  const setMuted = useCallback((value) => {
    setSoundMuted(value);
    setMutedState(isMuted());
  }, []);
  const toggleSound = useCallback(() => setMuted(!isMuted()), [setMuted]);

  // recriado quando o idioma muda → força re-render dos consumidores
  const t = useCallback((key, params) => tr(key, params), [lang]);

  const value = {
    lang,
    setLang,
    theme,
    setTheme,
    toggleTheme,
    muted,
    setMuted,
    toggleSound,
    t,
  };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings deve ser usado dentro de <SettingsProvider>');
  return ctx;
}

// Atalho: só a função de tradução
export function useT() {
  return useSettings().t;
}
