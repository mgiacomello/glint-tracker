"use client";

import { useEffect, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { LottieMascot } from "@/components/LottieMascot";
import { AnalyzeSheet } from "@/components/AnalyzeSheet";
import { Upload } from "lucide-react";
import { useT, useLang } from "@/lib/i18n/provider";
import { SCAM_STORIES, FOX_LINES } from "@/lib/i18n/messages/nav";
import type { LangCode } from "@/lib/i18n";
import type { FlipUser } from "@/lib/auth";

type GreetKey = "greeting.morning" | "greeting.afternoon" | "greeting.evening";
function greetingKey(hour: number): GreetKey {
  if (hour < 12) return "greeting.morning";
  if (hour < 18) return "greeting.afternoon";
  return "greeting.evening";
}

export function HomeView({ user, fooledCount }: { user: FlipUser; fooledCount: number }) {
  const t = useT();
  const lang = useLang();
  const [sheetOpen, setSheetOpen] = useState(false);

  const stories = SCAM_STORIES[lang] ?? SCAM_STORIES.it;

  // Pick greeting + story once after mount (stable → the page no longer
  // re-renders every 5s; only the fox line ticks, isolated below). SSR renders
  // index 0 / "morning" so there's no hydration mismatch.
  const [story, setStory] = useState(stories[0]);
  const [greetKey, setGreetKey] = useState<GreetKey>("greeting.morning");
  useEffect(() => {
    const now = Date.now();
    setStory(stories[Math.floor(now / (1000 * 60 * 5)) % stories.length]);
    setGreetKey(greetingKey(new Date(now).getHours()));
  }, [stories]);

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar user={user} />

      <main className="flex flex-1 flex-col items-center overflow-y-auto no-scrollbar px-6 pb-6 text-center">
        <h1 className="mt-3 text-3xl font-extrabold">
          {t(greetKey)}, {user.name}
        </h1>

        {/* Highlighted live stat — the scare-number up top */}
        <div className="mt-3 inline-flex items-center gap-3 rounded-2xl bg-rose-50 px-4 py-2.5">
          <span className="text-4xl font-extrabold leading-none text-risk-danger">{fooledCount}</span>
          <span className="max-w-[12rem] text-left text-sm font-bold leading-tight text-rose-700">
            {t("home.fooledLabel")}
          </span>
        </div>

        {/* Story card */}
        <div className="mt-3 w-full rounded-2xl border-l-4 border-risk-warn bg-surface p-4 shadow-[var(--shadow-card)] animate-rise">
          <p className="text-justify text-[15px] leading-relaxed text-content-soft hyphens-auto">{story}</p>
        </div>

        {/* Mascot + CTA */}
        <div className="mt-6 flex flex-col items-center">
          {/* speech bubble */}
          <div className="relative mb-1 rounded-2xl bg-surface px-4 py-2 text-[15px] font-bold text-content shadow-[var(--shadow-card)]">
            <FoxLine lang={lang} />
            <span className="absolute -bottom-1 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 rounded-[3px] bg-surface" />
          </div>

          <LottieMascot size={96} />

          {/* One-tap primary action — chunky 3D button */}
          <button
            onClick={() => setSheetOpen(true)}
            className="btn-pop mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-flip-500 py-4 text-base font-extrabold uppercase tracking-wide text-white"
          >
            <Upload className="h-5 w-5" />
            {t("home.uploadCta")}
          </button>
          <p className="mt-3 text-sm font-bold text-flip-600">
            {t("home.uploadHint")}
          </p>
        </div>
      </main>

      <AnalyzeSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </div>
  );
}

/** Rotating mascot speech line — isolated so only this ticks every 5s, not the whole home. */
function FoxLine({ lang }: { lang: LangCode }) {
  const lines = FOX_LINES[lang] ?? FOX_LINES.it;
  const [i, setI] = useState(0);
  useEffect(() => {
    setI(0);
    const id = setInterval(() => setI((x) => (x + 1) % lines.length), 5000);
    return () => clearInterval(id);
  }, [lines.length]);
  return <>{lines[i]}</>;
}
