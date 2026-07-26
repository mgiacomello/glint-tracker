"use client";

import { useRouter } from "next/navigation";
import {
  Download,
  Lightbulb,
  Settings,
  Globe,
  LogOut,
  ChevronRight,
  User as UserIcon,
} from "lucide-react";
import { BottomSheet } from "@/components/BottomSheet";
import { IconBadge, SectionLabel, CountBadge } from "@/components/ui";
import { promptInstall } from "@/lib/pwa";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n/provider";
import type { FlipUser } from "@/lib/auth";

type Item = {
  label: string;
  icon: React.ReactNode;
  tone: "flip" | "indigo" | "amber" | "rose";
  href?: string;
  onClick?: () => void;
  badge?: number;
  trailing?: React.ReactNode;
};

export function MenuDrawer({
  open,
  onClose,
  user,
}: {
  open: boolean;
  onClose: () => void;
  user: FlipUser;
}) {
  const t = useT();
  const router = useRouter();

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  const onInstall = async () => {
    const res = await promptInstall();
    if (res === "unavailable") {
      alert(t("menu.installUnavailable"));
    }
    onClose();
  };

  const onLogout = async () => {
    if (hasSupabaseEnv) {
      await createClient().auth.signOut();
    }
    onClose();
    router.push("/login");
  };

  const sections: { label: string; items: Item[] }[] = [
    {
      label: t("menu.sectionApp"),
      items: [
        { label: t("menu.installApp"), icon: <Download className="h-5 w-5" />, tone: "indigo", onClick: onInstall },
        { label: t("menu.reviewTutorial"), icon: <Lightbulb className="h-5 w-5" />, tone: "amber", href: "/tutorial" },
      ],
    },
    {
      label: t("menu.sectionPrefs"),
      items: [
        { label: t("menu.profile"), icon: <UserIcon className="h-5 w-5" />, tone: "flip", href: "/settings/profile" },
        { label: t("menu.settings"), icon: <Settings className="h-5 w-5" />, tone: "flip", href: "/settings" },
        { label: t("menu.language"), icon: <Globe className="h-5 w-5" />, tone: "indigo", href: "/settings/language", trailing: <span className="text-lg">🇮🇹</span> },
      ],
    },
  ];

  return (
    <BottomSheet open={open} onClose={onClose} className="max-h-[92dvh] overflow-y-auto no-scrollbar">
      {/* Profile */}
      <div className="mb-5 flex items-center gap-3 rounded-2xl bg-flip-50 p-4">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-flip-100 text-flip-600">
          <UserIcon className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-bold">{user.name}</p>
          <p className="truncate text-sm text-content-soft">{user.email ?? t("menu.notConnected")}</p>
        </div>
      </div>

      <div className="space-y-5">
        {sections.map((section) => (
          <div key={section.label} className="space-y-1">
            <SectionLabel>{section.label}</SectionLabel>
            {section.items.map((item) => (
              <button
                key={item.label}
                onClick={() => (item.onClick ? item.onClick() : item.href && go(item.href))}
                className="flex w-full items-center gap-3 rounded-2xl p-2 text-left transition hover:bg-slate-50"
              >
                <IconBadge tone={item.tone} className="h-10 w-10 rounded-xl">
                  {item.icon}
                </IconBadge>
                <span className="flex-1 font-medium">{item.label}</span>
                {item.badge ? <CountBadge count={item.badge} /> : null}
                {item.trailing ?? <ChevronRight className="h-5 w-5 text-content-mute" />}
              </button>
            ))}
          </div>
        ))}

        <div className="border-t border-black/5 pt-3">
          <button
            onClick={onLogout}
            className="flex w-full items-center gap-3 rounded-2xl p-2 text-left text-risk-danger transition hover:bg-rose-50"
          >
            <IconBadge tone="rose" className="h-10 w-10 rounded-xl">
              <LogOut className="h-5 w-5" />
            </IconBadge>
            <span className="flex-1 font-medium">{t("menu.logout")}</span>
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
