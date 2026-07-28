import { getDb, users } from "@money-manager/db";
import { hasDailyTriggerPassed, todayBrtString } from "../brt-date.js";
import { refreshAllRvHoldingsForUser } from "./quote-refresh.service.js";

const TICK_INTERVAL_MS = 15 * 60 * 1000;

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
