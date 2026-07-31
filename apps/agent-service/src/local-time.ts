import { env } from "./env.js";

export type LocalParts = {
  dateKey: string;
  minutes: number;
  hour: number;
};

/**
 * Doc's wall clock, not the server's and not UTC. The daily initiative counter
 * used UTC dates, which rolled the day over at 03:00 in Istanbul and handed her
 * a fresh quota in the middle of the night.
 */
export function localParts(now = new Date(), tz = env.docTimezone): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = new Map(
    fmt.formatToParts(now).map((p) => [p.type, p.value] as const),
  );
  const hour = Number(parts.get("hour") ?? "0") % 24;
  const minute = Number(parts.get("minute") ?? "0");
  return {
    dateKey: `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}`,
    minutes: hour * 60 + minute,
    hour,
  };
}

function parseHhMm(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function inQuietHours(now = new Date()): boolean {
  const start = parseHhMm(env.quietHoursStart);
  const end = parseHhMm(env.quietHoursEnd);
  if (start === null || end === null) return false;
  const { minutes } = localParts(now);
  if (start <= end) return minutes >= start && minutes < end;
  return minutes >= start || minutes < end;
}
