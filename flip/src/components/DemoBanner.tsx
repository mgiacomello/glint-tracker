"use client";

import { useEffect, useState } from "react";
import { FlaskConical } from "lucide-react";
import { useT } from "@/lib/i18n/provider";

/** Shows a clear notice when the app is running WITHOUT an AI key (demo mode). */
export function DemoBanner() {
  const t = useT();
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => alive && setDemo(!d.ai))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!demo) return null;

  return (
    <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
      <FlaskConical className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
      <p>
        <b>{t("demo.title")}</b> {t("demo.body")}
      </p>
    </div>
  );
}
