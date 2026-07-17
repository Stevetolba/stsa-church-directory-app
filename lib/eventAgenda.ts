// Groups events into a date-headed agenda, mirroring the birthdays agenda
// (lib/birthdays.ts). Pure — unit-tested in lib/eventAgenda.test.ts.

import type { AppEvent } from "@/types/event";

export interface EventAgendaGroup {
  dateKey: string; // "YYYY-MM-DD"
  label: string; // "Today" | "Tomorrow" | "Sunday, July 19"
  daysUntil: number;
  events: AppEvent[];
}

function parseDateKey(key: string): Date | null {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

// Groups events by their occurrence_date, ordered chronologically. `now` sets
// the reference "today" (local date) for the Today/Tomorrow labels.
export function groupEventsByDate(
  events: AppEvent[],
  now: Date = new Date()
): EventAgendaGroup[] {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const groups = new Map<string, EventAgendaGroup>();

  for (const event of events) {
    const date = parseDateKey(event.occurrence_date);
    if (!date) continue;
    const daysUntil = Math.round((date.getTime() - todayStart.getTime()) / 86400000);

    let group = groups.get(event.occurrence_date);
    if (!group) {
      let label: string;
      if (daysUntil === 0) label = "Today";
      else if (daysUntil === 1) label = "Tomorrow";
      else if (daysUntil === -1) label = "Yesterday";
      else {
        label = date.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
        });
      }
      group = { dateKey: event.occurrence_date, label, daysUntil, events: [] };
      groups.set(event.occurrence_date, group);
    }
    group.events.push(event);
  }

  const list = Array.from(groups.values());
  for (const group of list) {
    group.events.sort((a, b) => a.start_at.localeCompare(b.start_at));
  }
  return list.sort((a, b) => a.daysUntil - b.daysUntil);
}
