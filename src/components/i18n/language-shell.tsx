"use client";

import type { PropsWithChildren } from "react";
import { LanguageProvider } from "./language-provider";
import { LanguageSwitch } from "./language-switch";

export function LanguageShell({ children }: PropsWithChildren) {
  return (
    <LanguageProvider>
      <LanguageSwitch />
      {children}
    </LanguageProvider>
  );
}
