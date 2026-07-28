import { getDb, users } from "@money-manager/db";
import { refreshAllRvHoldingsForUser } from "./quote-refresh.service.js";

const TICK_INTERVAL_MS = 15 * 60 * 1000;
const DAILY_TRIGGER_HOUR_BRT = 8;

function todayBrtString(now: Date): string {
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

export interface QuoteScheduler {
  stop(): void;
}

export function startQuoteScheduler(): QuoteScheduler {
  let lastRunDate: string | null = null;

  const tick = async (): Promise<void> => {
    const now = new Date();
    if (!hasDailyTriggerPassed(now, lastRunDate)) return;

    try {
      const allUsers = await getDb().select({ id: users.id }).from(users);
      for (const user of allUsers) {
        await refreshAllRvHoldingsForUser(user.id, now);
      }
      lastRunDate = todayBrtString(now);
      console.log(
        `[quote-scheduler] daily refresh sweep completed for ${allUsers.length} user(s)`,
      );
    } catch (err) {
      console.error("[quote-scheduler] daily refresh sweep failed", err);
    }
  };

  const interval = setInterval(() => {
    void tick();
  }, TICK_INTERVAL_MS);

  return {
    stop(): void {
      clearInterval(interval);
    },
  };
}
