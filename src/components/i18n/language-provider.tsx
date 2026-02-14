"use client";

import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  detectLanguage,
  translate,
  type Language,
} from "@/lib/i18n/messages";

const LANGUAGE_STORAGE_KEY = "holdem:language";

interface LanguageContextValue {
  language: Language;
  setLanguage: (next: Language) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: PropsWithChildren) {
  const [language, setLanguageState] = useState<Language>("zh");

  useEffect(() => {
    const storedRaw = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (storedRaw === "zh" || storedRaw === "en") {
      setLanguageState(storedRaw);
      return;
    }

    const detected = detectLanguage([...(navigator.languages ?? []), navigator.language]);
    setLanguageState(detected);
  }, []);

  useEffect(() => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage: setLanguageState,
      t: (key, vars) => translate(language, key, vars),
    }),
    [language],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }

  return context;
}
