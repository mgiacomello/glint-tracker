"use client";

import { useRouter } from "next/navigation";
import { Camera, Upload, ScanEye, ChevronRight, Sparkles } from "lucide-react";
import { BottomSheet } from "@/components/BottomSheet";
import { IconBadge } from "@/components/ui";
import { useT } from "@/lib/i18n/provider";

type Method = {
  key: string;
  href: string;
  titleKey: string;
  descKey: string;
  icon: React.ReactNode;
  tone: "flip" | "indigo" | "amber";
  spark?: boolean;
};

const METHODS: Method[] = [
  {
    key: "camera",
    href: "/analyze?mode=camera",
    titleKey: "sheet.cameraTitle",
    descKey: "sheet.cameraDesc",
    icon: <Camera className="h-6 w-6" />,
    tone: "flip",
  },
  {
    key: "upload",
    href: "/analyze?mode=upload",
    titleKey: "sheet.uploadTitle",
    descKey: "sheet.uploadDesc",
    icon: <Upload className="h-6 w-6" />,
    tone: "indigo",
  },
  {
    key: "eyes",
    href: "/eyes",
    titleKey: "sheet.eyesTitle",
    descKey: "sheet.eyesDesc",
    icon: <ScanEye className="h-6 w-6" />,
    tone: "amber",
    spark: true,
  },
];

export function AnalyzeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const router = useRouter();

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t("sheet.analyzeTitle")}
      subtitle={t("sheet.analyzeSubtitle")}
    >
      <div className="space-y-3">
        {METHODS.map((m) => (
          <button
            key={m.key}
            onClick={() => {
              onClose();
              router.push(m.href);
            }}
            className="flex w-full items-center gap-4 rounded-2xl border border-black/5 bg-surface-2 p-4 text-left transition hover:bg-flip-50 active:scale-[0.99]"
          >
            <IconBadge tone={m.tone}>{m.icon}</IconBadge>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 font-bold">
                {t(m.titleKey)}
                {m.spark && <Sparkles className="h-4 w-4 text-amber-500" />}
              </p>
              <p className="text-sm leading-snug text-content-soft">{t(m.descKey)}</p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-content-mute" />
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
