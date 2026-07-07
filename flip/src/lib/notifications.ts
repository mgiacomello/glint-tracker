"use client";

import type { DeadlineItem } from "@/lib/store";
import { getLang } from "@/lib/i18n";
import { messages } from "@/lib/i18n/messages";

/** Non-reactive lookup for use outside React (uses the persisted language). */
function tr(key: string): string {
  const lang = getLang();
  return messages[lang]?.[key] ?? messages.it[key] ?? key;
}

export interface ScheduleResult {
  native: boolean;
  scheduled: number;
  permission: "granted" | "denied" | "unsupported";
}

const ID_BASE = 1000;
const ID_MAX = 1100;

async function isNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Schedules a local reminder (1 day before, 9:00) for each upcoming deadline.
 * Fully works on the installed native app (Capacitor). On web it just asks for
 * notification permission — the OS-level scheduling requires the native app.
 */
export async function scheduleDeadlineReminders(items: DeadlineItem[]): Promise<ScheduleResult> {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = items.filter((d) => d.date && d.date >= today).slice(0, 90);

  if (await isNative()) {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== "granted") return { native: true, scheduled: 0, permission: "denied" };

    await cancelDeadlineReminders();

    const notifications = upcoming
      .map((d, i) => {
        const at = new Date(d.date + "T09:00:00");
        at.setDate(at.getDate() - 1); // remind the day before
        return {
          id: ID_BASE + i,
          title: tr("calendar.notif.title"),
          body: `${d.title}${d.amount ? ` (${d.amount})` : ""} · ${d.docTitle}`,
          schedule: { at },
        };
      })
      .filter((n) => n.schedule.at.getTime() > Date.now());

    if (notifications.length) await LocalNotifications.schedule({ notifications });
    return { native: true, scheduled: notifications.length, permission: "granted" };
  }

  // Web fallback: permission only (background scheduling needs the native app).
  if (typeof Notification === "undefined") return { native: false, scheduled: 0, permission: "unsupported" };
  const perm = await Notification.requestPermission();
  return { native: false, scheduled: 0, permission: perm === "granted" ? "granted" : "denied" };
}

export async function cancelDeadlineReminders(): Promise<void> {
  if (!(await isNative())) return;
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  const pending = await LocalNotifications.getPending();
  const ids = pending.notifications
    .filter((n) => n.id >= ID_BASE && n.id < ID_MAX)
    .map((n) => ({ id: n.id }));
  if (ids.length) await LocalNotifications.cancel({ notifications: ids });
}
