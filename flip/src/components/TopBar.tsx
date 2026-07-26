"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { MenuDrawer } from "@/components/MenuDrawer";
import { LottieLogo } from "@/components/LottieLogo";
import { useT } from "@/lib/i18n/provider";
import type { FlipUser } from "@/lib/auth";

export function TopBar({ user }: { user: FlipUser }) {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between bg-canvas/80 px-5 py-4 backdrop-blur-md pt-safe">
      <LottieLogo height={30} />
      <button
        onClick={() => setMenuOpen(true)}
        aria-label={t("topbar.menu")}
        className="grid h-10 w-10 place-items-center rounded-xl text-content hover:bg-black/5"
      >
        <Menu className="h-6 w-6" />
      </button>
      <MenuDrawer open={menuOpen} onClose={() => setMenuOpen(false)} user={user} />
    </header>
  );
}
