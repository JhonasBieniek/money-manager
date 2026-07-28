const DAILY_TRIGGER_HOUR_BRT = 8;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function todayBrtString(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function hasDailyTriggerPassed(
  now: Date,
  lastRunDate: string | null,
): boolean {
  const todayBrt = todayBrtString(now);
  if (lastRunDate === todayBrt) return false;

  const hourParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);
  const hourBrt =
    Number(hourParts.find((p) => p.type === "hour")?.value ?? "0") % 24;

  return hourBrt >= DAILY_TRIGGER_HOUR_BRT;
}

export function hasWeeklyElapsed(
  now: Date,
  lastRunAt: Date | null,
  intervalDays = 7,
): boolean {
  if (!lastRunAt) return true;
  return now.getTime() - lastRunAt.getTime() >= intervalDays * MS_PER_DAY;
}
