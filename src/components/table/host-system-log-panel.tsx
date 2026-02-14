"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "@/components/i18n/language-provider";
import { useHostLogs } from "@/lib/client/use-host-logs";
import type { ServerLogEntry } from "@/lib/protocol/types";
import styles from "./host-system-log-panel.module.css";

interface HostSystemLogPanelProps {
  roomCode: string;
  token: string;
}

function formatTimestamp(value: string, language: "zh" | "en"): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value;
  }

  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function levelClass(level: ServerLogEntry["level"]): string {
  if (level === "error") {
    return styles.levelError;
  }
  if (level === "warn") {
    return styles.levelWarn;
  }
  if (level === "debug") {
    return styles.levelDebug;
  }
  return styles.levelInfo;
}

function metaAsLine(entry: ServerLogEntry): string | null {
  if (!entry.meta) {
    return null;
  }

  const pairs = Object.entries(entry.meta).map(([key, value]) => `${key}=${String(value)}`);
  if (pairs.length === 0) {
    return null;
  }
  return pairs.join(" · ");
}

export function HostSystemLogPanel({ roomCode, token }: HostSystemLogPanelProps) {
  const { t, language } = useLanguage();
  const [autoScroll, setAutoScroll] = useState(true);
  const [showDebug, setShowDebug] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const { logs, allowDebug, loading, error } = useHostLogs(roomCode, token, showDebug);

  useEffect(() => {
    if (!autoScroll || !scrollerRef.current) {
      return;
    }
    scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [logs, autoScroll]);

  useEffect(() => {
    if (!allowDebug && showDebug) {
      setShowDebug(false);
    }
  }, [allowDebug, showDebug]);

  const rows = useMemo(
    () =>
      logs.map((entry) => ({
        ...entry,
        metaLine: metaAsLine(entry),
      })),
    [logs],
  );

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <h2>{t("host.systemLog.title")}</h2>
        <div className={styles.controls}>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(event) => setAutoScroll(event.target.checked)}
            />
            {t("host.systemLog.autoScroll")}
          </label>
          {allowDebug ? (
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={showDebug}
                onChange={(event) => setShowDebug(event.target.checked)}
              />
              {t("host.systemLog.showDebug")}
            </label>
          ) : null}
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {loading && rows.length === 0 ? <p className={styles.meta}>{t("host.loading")}</p> : null}

      <div className={styles.list} ref={scrollerRef}>
        {rows.length === 0 ? <p className={styles.meta}>{t("host.systemLog.empty")}</p> : null}
        {rows.map((entry) => (
          <article key={entry.id} className={styles.item}>
            <div className={styles.itemTop}>
              <span className={`${styles.level} ${levelClass(entry.level)}`}>
                {t("host.systemLog.level", { level: entry.level.toUpperCase() })}
              </span>
              <span className={styles.scope}>
                {t("host.systemLog.scope", { scope: entry.scope })}
              </span>
              <time className={styles.time}>{formatTimestamp(entry.ts, language)}</time>
            </div>
            <p className={styles.message}>{entry.message}</p>
            {entry.metaLine ? <p className={styles.detail}>{entry.metaLine}</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
}
