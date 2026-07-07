"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Sparkles } from "lucide-react";
import { SubPage } from "@/components/SubPage";
import { SEGMENTS, getProfile, setProfile, type SegmentCode } from "@/lib/profile";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";

export default function ProfilePage() {
  const router = useRouter();
  const t = useT();
  const [segment, setSegment] = useState<SegmentCode | null>(null);
  const [situation, setSituation] = useState("");

  useEffect(() => {
    const p = getProfile();
    setSegment(p.segment);
    setSituation(p.situation);
  }, []);

  const save = () => {
    setProfile({ segment, situation });
    router.back();
  };

  return (
    <SubPage title={t("profile.title")} subtitle={t("profile.subtitle")}>
      <div className="mb-4 flex items-start gap-2 rounded-2xl bg-flip-50 p-3 text-sm text-flip-800">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-flip-600" />
        <p>{t("profile.blurb")}</p>
      </div>

      <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-content-mute">{t("profile.whoYouAre")}</p>
      <div className="space-y-2">
        {SEGMENTS.map((s) => (
          <button
            key={s.code}
            onClick={() => setSegment(segment === s.code ? null : s.code)}
            className={cn(
              "flex w-full items-center gap-3 rounded-2xl border-2 bg-surface p-4 text-left transition",
              segment === s.code ? "border-flip-500" : "border-transparent",
            )}
          >
            <span className="text-2xl">{s.emoji}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold">{s.label}</span>
              <span className="block text-sm text-content-soft">{s.hint}</span>
            </span>
            {segment === s.code && <Check className="h-5 w-5 shrink-0 text-flip-600" />}
          </button>
        ))}
      </div>

      <p className="mb-2 mt-6 px-1 text-xs font-semibold uppercase tracking-wide text-content-mute">
        {t("profile.situation.label")}
      </p>
      <textarea
        value={situation}
        onChange={(e) => setSituation(e.target.value)}
        rows={3}
        placeholder={t("profile.situation.placeholder")}
        className="w-full rounded-2xl border border-black/10 bg-surface p-4 text-base outline-none focus:border-flip-400"
      />

      <button
        onClick={save}
        className="mt-6 w-full rounded-2xl btn-pop bg-flip-500 py-4 font-extrabold uppercase tracking-wide text-white shadow-[0_8px_20px_-8px_var(--color-flip-600)] active:scale-[0.98]"
      >
        {t("profile.save")}
      </button>
    </SubPage>
  );
}
