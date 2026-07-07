"use client";

import type { DocumentAnalysis, ExtractedDeadline } from "@/lib/analysis/types";

export interface StoredDocument {
  id: string;
  fileName: string;
  createdAt: number;
  read: boolean;
  analysis: DocumentAnalysis;
}

const KEY = "flip:documents";

function read(): StoredDocument[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function write(docs: StoredDocument[]) {
  localStorage.setItem(KEY, JSON.stringify(docs));
  window.dispatchEvent(new Event("flip:documents-changed"));
}

export function listDocuments(): StoredDocument[] {
  return read().sort((a, b) => b.createdAt - a.createdAt);
}

export function getDocument(id: string): StoredDocument | undefined {
  return read().find((d) => d.id === id);
}

export function saveDocument(fileName: string, analysis: DocumentAnalysis): StoredDocument {
  const doc: StoredDocument = {
    id: crypto.randomUUID(),
    fileName,
    createdAt: Date.now(),
    read: false,
    analysis,
  };
  write([doc, ...read()]);
  return doc;
}

export function markRead(id: string) {
  write(read().map((d) => (d.id === id ? { ...d, read: true } : d)));
}

export function removeDocument(id: string) {
  write(read().filter((d) => d.id !== id));
}

export function unreadCount(): number {
  return read().filter((d) => !d.read).length;
}

export interface DeadlineItem extends ExtractedDeadline {
  docId: string;
  docTitle: string;
}

export function allDeadlines(): DeadlineItem[] {
  return read()
    .flatMap((d) =>
      d.analysis.deadlines.map((dl) => ({ ...dl, docId: d.id, docTitle: d.analysis.title })),
    )
    .sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.localeCompare(b.date);
    });
}
