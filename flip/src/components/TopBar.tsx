"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Baloo_2 } from "next/font/google";
import { MenuDrawer } from "@/components/MenuDrawer";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import type { FlipUser } from "@/lib/auth";

// Chunky, rounded display font — matches the CHIARO.info brand logo.
const baloo = Baloo_2({ subsets: ["latin"], weight: ["700", "800"] });

/** Warm terracotta of the ".info" pill (softer, less pure-red). */
const PILL_RED = "#C26B52";

/** CHIARO.info wordmark — heavy rounded uppercase + terracotta ".info" pill. */
export function FlipWordmark({ big = false }: { big?: boolean }) {
  return (
    <span className={cn(baloo.className, "inline-flex items-center leading-none")}>
      <span
        className={cn(
          "font-extrabold uppercase tracking-[-0.01em] text-content",
          big ? "text-5xl" : "text-2xl",
        )}
        style={{ fontWeight: 800 }}
      >
        Chiaro
      </span>
      <span
        className={cn(
          "inline-flex items-center rounded-full font-bold text-white",
          big ? "ml-2.5 px-3 py-1.5 text-xl" : "ml-1.5 px-2 py-0.5 text-sm",
        )}
        style={{ backgroundColor: PILL_RED, fontWeight: 700 }}
      >
        <span className="mr-[0.09em]">.</span>info
      </span>
    </span>
  );
}

export function TopBar({ user, radarCount = 0 }: { user: FlipUser; radarCount?: number }) {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between bg-canvas/80 px-5 py-4 backdrop-blur-md pt-safe">
      <FlipWordmark />
      <button
        onClick={() => setMenuOpen(true)}
        aria-label={t("topbar.menu")}
        className="grid h-10 w-10 place-items-center rounded-xl text-content hover:bg-black/5"
      >
        <Menu className="h-6 w-6" />
      </button>
      <MenuDrawer open={menuOpen} onClose={() => setMenuOpen(false)} user={user} radarCount={radarCount} />
    </header>
  );
}
