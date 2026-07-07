"use client";

import { useEffect, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { BottomNav } from "@/components/BottomNav";
import { LottieMascot } from "@/components/LottieMascot";
import { AnalyzeSheet } from "@/components/AnalyzeSheet";
import { Upload } from "lucide-react";
import { useT, useLang } from "@/lib/i18n/provider";
import { SCAM_STORIES, FOX_LINES } from "@/lib/i18n/messages/nav";
import type { FlipUser } from "@/lib/auth";

function greetingKey(hour: number): "greeting.morning" | "greeting.afternoon" | "greeting.evening" {
  if (hour < 12) return "greeting.morning";
  if (hour < 18) return "greeting.afternoon";
  return "greeting.evening";
}

export function HomeView({ user, fooledCount }: { user: FlipUser; fooledCount: number }) {
  const t = useT();
  const lang = useLang();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Time-based selection must happen after mount so SSR renders a stable
  // placeholder (index 0) and there is no hydration mismatch.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    // Rotate the fox line every 5s like the original.
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const stories = SCAM_STORIES[lang] ?? SCAM_STORIES.it;
  const foxLines = FOX_LINES[lang] ?? FOX_LINES.it;

  const storyIndex = now === null ? 0 : Math.floor(now / (1000 * 60 * 5)) % stories.length;
  const foxIndex = now === null ? 0 : Math.floor(now / 5000) % foxLines.length;
  const story = stories[storyIndex];
  const foxLine = foxLines[foxIndex];

  const hour = now === null ? new Date().getHours() : new Date(now).getHours();
  const greetingText = t(greetingKey(hour));

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar user={user} />

      <main className="flex flex-1 flex-col items-center overflow-y-auto no-scrollbar px-6 pb-6 text-center">
        <h1 className="mt-3 text-3xl font-extrabold">
          {greetingText}, {user.name}
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
            {foxLine}
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

      <BottomNav />
      <AnalyzeSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </div>
  );
}
