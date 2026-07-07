"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { ResultView } from "@/components/document/ResultView";
import { getDocument, type StoredDocument } from "@/lib/store";
import { useT } from "@/lib/i18n/provider";

export function DocumentScreen({ id }: { id: string }) {
  const t = useT();
  const [doc, setDoc] = useState<StoredDocument | null | undefined>(undefined);

  useEffect(() => {
    setDoc(getDocument(id) ?? null);
  }, [id]);

  if (doc === undefined) {
    return <div className="flex min-h-dvh items-center justify-center text-content-mute">{t("doc.loading")}</div>;
  }

  if (doc === null) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-8 text-center">
        <FileQuestion className="h-12 w-12 text-content-mute" />
        <p className="font-bold">{t("doc.notFound")}</p>
        <Link href="/documents" className="font-semibold text-flip-600">
          {t("doc.goToDocuments")}
        </Link>
      </div>
    );
  }

  return <ResultView id={doc.id} fileName={doc.fileName} analysis={doc.analysis} />;
}
