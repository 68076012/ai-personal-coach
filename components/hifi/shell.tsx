import * as React from "react";
import { TabBar, type TabLabels } from "./tab-bar";
import { t, type Lang } from "@/lib/i18n";

// Shell sets data-design="hifi" + data-accent so all tokens flip per user.
// Renders the optional sticky AppBar above the scroll area and the bottom
// TabBar below. Children are the page body — they should NOT include their
// own scroll container; the shell handles overflow.
export function HiFiShell({
  accent,
  lang,
  appBar,
  children,
  showTabBar = true,
}: {
  accent: "coral" | "teal";
  lang: Lang;
  appBar?: React.ReactNode;
  children: React.ReactNode;
  showTabBar?: boolean;
}) {
  const tabLabels: TabLabels = {
    home: t("home", lang),
    plan: t("plan", lang),
    chat: t("chat", lang),
    progress: t("progress", lang),
    settings: t("settings", lang),
  };
  return (
    <div
      data-design="hifi"
      data-accent={accent}
      data-lang={lang}
      className="flex min-h-screen flex-col bg-[var(--bg)]"
    >
      {appBar}
      <main className="flex-1 overflow-y-auto">{children}</main>
      {showTabBar && <TabBar labels={tabLabels} />}
    </div>
  );
}
