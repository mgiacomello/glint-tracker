"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ScanEye, Volume2, ShieldCheck, ArrowRight, X } from "lucide-react";
import { FlipMark } from "@/components/FlipOrb";
import { useT } from "@/lib/i18n/provider";

const SLIDES = [
  { icon: <ShieldCheck className="h-10 w-10" />, key: "s1" },
  { icon: <Camera className="h-10 w-10" />, key: "s2" },
  { icon: <Volume2 className="h-10 w-10" />, key: "s3" },
  { icon: <ScanEye className="h-10 w-10" />, key: "s4" },
] as const;

export default function TutorialPage() {
  const router = useRouter();
  const t = useT();
  const [i, setI] = useState(0);
  const last = i === SLIDES.length - 1;
  const s = SLIDES[i];

  const finish = () => {
    localStorage.setItem("flip:tutorial-seen", "1");
    router.push("/");
  };

  return (
    <div className="flex min-h-dvh flex-col px-7 py-6">
      <div className="flex justify-end">
        <button onClick={finish} aria-label={t("tutorial.skip")} className="grid h-9 w-9 place-items-center rounded-full hover:bg-black/5">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <span className="grid h-24 w-24 place-items-center rounded-[28px] flip-gradient text-white shadow-[var(--shadow-float)]">
          {i === 0 ? <FlipMark size={52} /> : s.icon}
        </span>
        <h1 className="mt-8 text-2xl font-extrabold">{t(`tutorial.${s.key}.title`)}</h1>
        <p className="mt-3 max-w-xs text-content-soft">{t(`tutorial.${s.key}.text`)}</p>
      </div>

      <div className="mb-6 flex justify-center gap-2">
        {SLIDES.map((_, idx) => (
          <span
            key={idx}
            className={`h-2 rounded-full transition-all ${idx === i ? "w-6 bg-flip-500" : "w-2 bg-slate-300"}`}
          />
        ))}
      </div>

      <button
        onClick={() => (last ? finish() : setI((v) => v + 1))}
        className="flex w-full items-center justify-center gap-2 rounded-2xl btn-pop bg-flip-500 py-4 font-extrabold uppercase tracking-wide text-white shadow-[0_8px_20px_-8px_var(--color-flip-600)]"
      >
        {last ? t("tutorial.start") : t("tutorial.next")}
        <ArrowRight className="h-5 w-5" />
      </button>
    </div>
  );
}
