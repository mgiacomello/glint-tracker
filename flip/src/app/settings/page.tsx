"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Globe, Download, ShieldCheck, Volume2, ChevronRight, LogOut, UserRound } from "lucide-react";
import { SubPage } from "@/components/SubPage";
import { IconBadge, SectionLabel } from "@/components/ui";
import { useT } from "@/lib/i18n/provider";
import { promptInstall } from "@/lib/pwa";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/client";

export default function SettingsPage() {
  const router = useRouter();
  const t = useT();
  const [tts, setTts] = useState(true);
  const budget = process.env.NEXT_PUBLIC_AI_BUDGET_EUR;

  useEffect(() => {
    setTts(localStorage.getItem("flip:tts") !== "off");
  }, []);

  const toggleTts = () => {
    const next = !tts;
    setTts(next);
    localStorage.setItem("flip:tts", next ? "on" : "off");
  };

  const logout = async () => {
    if (hasSupabaseEnv) await createClient().auth.signOut();
    router.push("/login");
  };

  return (
    <SubPage title={t("settings.title")}>
      <div className="space-y-6">
        <div className="space-y-1">
          <SectionLabel>{t("settings.section.preferences")}</SectionLabel>
          <Row icon={<Volume2 className="h-5 w-5" />} tone="flip" label={t("settings.tts.label")} hint={t("settings.tts.hint")}>
            <Toggle on={tts} onClick={toggleTts} />
          </Row>
          <LinkRow href="/settings/profile" icon={<UserRound className="h-5 w-5" />} tone="flip" label={t("settings.profile.label")} />
          <LinkRow href="/settings/language" icon={<Globe className="h-5 w-5" />} tone="indigo" label={t("settings.language.label")} trailing="🇮🇹" />
        </div>

        <div className="space-y-1">
          <SectionLabel>{t("settings.section.app")}</SectionLabel>
          <button
            onClick={() => promptInstall()}
            className="flex w-full items-center gap-3 rounded-2xl p-2 text-left hover:bg-slate-50"
          >
            <IconBadge tone="indigo" className="h-10 w-10 rounded-xl">
              <Download className="h-5 w-5" />
            </IconBadge>
            <span className="flex-1 font-medium">{t("settings.installApp")}</span>
            <ChevronRight className="h-5 w-5 text-content-mute" />
          </button>
          <LinkRow href="/tutorial" icon={<ShieldCheck className="h-5 w-5" />} tone="amber" label={t("settings.reviewTutorial")} />
        </div>

        <div className="space-y-1">
          <SectionLabel>{t("settings.section.dataPrivacy")}</SectionLabel>
          <div className="rounded-2xl bg-flip-50 p-4 text-sm text-content-soft">
            <ShieldCheck className="mb-1 h-5 w-5 text-flip-600" />
            {t("settings.privacyBlurb")}
            {budget && <p className="mt-2">{t("settings.aiBudget", { budget })}</p>}
          </div>
        </div>

        <button
          onClick={logout}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-black/10 py-3 font-semibold text-content-soft"
        >
          <LogOut className="h-5 w-5" />
          {t("settings.logout")}
        </button>

        <p className="text-center text-xs text-content-mute">{t("settings.version")}</p>
      </div>
    </SubPage>
  );
}

function Row({
  icon,
  tone,
  label,
  hint,
  children,
}: {
  icon: React.ReactNode;
  tone: "flip" | "indigo" | "amber" | "rose";
  label: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl p-2">
      <IconBadge tone={tone} className="h-10 w-10 rounded-xl">
        {icon}
      </IconBadge>
      <div className="flex-1">
        <p className="font-medium">{label}</p>
        {hint && <p className="text-xs text-content-mute">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function LinkRow({
  href,
  icon,
  tone,
  label,
  trailing,
}: {
  href: string;
  icon: React.ReactNode;
  tone: "flip" | "indigo" | "amber" | "rose";
  label: string;
  trailing?: React.ReactNode;
}) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-2xl p-2 hover:bg-slate-50">
      <IconBadge tone={tone} className="h-10 w-10 rounded-xl">
        {icon}
      </IconBadge>
      <span className="flex-1 font-medium">{label}</span>
      {trailing ?? <ChevronRight className="h-5 w-5 text-content-mute" />}
    </Link>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`relative h-7 w-12 rounded-full transition ${on ? "bg-flip-500" : "bg-slate-300"}`}
      aria-pressed={on}
    >
      <span
        className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-6" : "left-1"}`}
      />
    </button>
  );
}
