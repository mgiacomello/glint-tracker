"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { CountBadge } from "@/components/ui";
import { useDocuments } from "@/lib/useDocuments";
import { useT } from "@/lib/i18n/provider";

export function BottomNav({ docCount }: { docCount?: number }) {
  const t = useT();
  const pathname = usePathname();
  const { unread } = useDocuments();
  const items = [
    { href: "/", label: t("nav.home"), icon: Home, badge: 0 },
    { href: "/documents", label: t("nav.documents"), icon: FileText, badge: docCount ?? unread },
  ];

  return (
    <nav className="sticky bottom-0 z-30 border-t border-black/5 bg-surface/90 backdrop-blur-md pb-safe">
      <div className="grid grid-cols-2">
        {items.map(({ href, label, icon: Icon, badge }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative flex flex-col items-center gap-1 py-3 text-xs font-medium transition",
                active ? "text-flip-600" : "text-content-mute",
              )}
            >
              {active && (
                <span className="absolute top-0 h-0.5 w-12 rounded-full bg-flip-500" />
              )}
              <span className="relative">
                <Icon className="h-6 w-6" strokeWidth={2} />
                <CountBadge count={badge} className="absolute -right-3 -top-2" />
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
