"use client";

import { useLanguage } from "./language-provider";

export function LanguageSwitch() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div className="languageSwitch" role="group" aria-label={t("language.switchAria")}>
      <button
        type="button"
        className={language === "zh" ? "active" : ""}
        aria-pressed={language === "zh"}
        aria-label="切换到中文"
        onClick={() => setLanguage("zh")}
      >
        中
      </button>
      <button
        type="button"
        className={language === "en" ? "active" : ""}
        aria-pressed={language === "en"}
        aria-label="Switch to English"
        onClick={() => setLanguage("en")}
      >
        EN
      </button>
    </div>
  );
}
