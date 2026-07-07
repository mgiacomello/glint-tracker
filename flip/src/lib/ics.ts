"use client";

import type { DeadlineItem } from "@/lib/store";
import { getLang } from "@/lib/i18n";
import { messages } from "@/lib/i18n/messages";

/** Non-reactive lookup for use outside React (uses the persisted language). */
function tr(key: string, vars?: Record<string, string>): string {
  const lang = getLang();
  let s = messages[lang]?.[key] ?? messages.it[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
  return s;
}

/** Pad to 2 digits. */
function p(n: number): string {
  return String(n).padStart(2, "0");
}

/** YYYYMMDD from an ISO date (all-day event). */
function toICSDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

function escapeICS(text: string): string {
  return text.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
}

/** Build an ICS calendar string for one or more deadlines (all-day, with a reminder). */
export function buildICS(items: DeadlineItem[], stamp = "20260101T000000Z"): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Chiaro//Scadenze//IT",
    "CALSCALE:GREGORIAN",
  ];

  items.forEach((d, i) => {
    if (!d.date) return;
    const start = toICSDate(d.date);
    const summary = escapeICS(tr("calendar.ics.summary", { n: d.title }));
    const desc = escapeICS(
      [
        d.docTitle && tr("calendar.ics.document", { n: d.docTitle }),
        d.amount && tr("calendar.ics.amount", { n: d.amount }),
        d.rawText,
      ]
        .filter(Boolean)
        .join("\n"),
    );
    lines.push(
      "BEGIN:VEVENT",
      `UID:chiaro-${start}-${i}@chiaro.app`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${desc}`,
      "BEGIN:VALARM",
      "TRIGGER:-P1D",
      "ACTION:DISPLAY",
      `DESCRIPTION:${summary}`,
      "END:VALARM",
      "END:VEVENT",
    );
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

/** Trigger download / open of an ICS file. On phones this opens the Calendar app to add the event(s). */
export function addToCalendar(items: DeadlineItem[], filename = tr("calendar.file.name")) {
  const datedItems = items.filter((d) => d.date);
  if (datedItems.length === 0) {
    alert(tr("calendar.noDateAlert"));
    return;
  }
  const ics = buildICS(datedItems);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
