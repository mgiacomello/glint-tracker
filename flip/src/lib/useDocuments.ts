"use client";

import { useEffect, useState } from "react";
import { listDocuments, type StoredDocument } from "@/lib/store";

/** Reactive list of stored documents (re-renders on changes). */
export function useDocuments(): { docs: StoredDocument[]; unread: number; ready: boolean } {
  const [docs, setDocs] = useState<StoredDocument[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setDocs(listDocuments());
      setReady(true);
    };
    refresh();
    window.addEventListener("flip:documents-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("flip:documents-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return { docs, unread: docs.filter((d) => !d.read).length, ready };
}
