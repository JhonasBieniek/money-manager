import { getDb, users } from "@money-manager/db";
import { isNull } from "drizzle-orm";
import { refreshBenchmarks } from "./benchmarks/benchmark.service.js";
import { hasDailyTriggerPassed, hasWeeklyElapsed, todayBrtString } from "./brt-date.js";
import { registerSnapshot } from "./patrimony.service.js";

const TICK_INTERVAL_MS = 15 * 60 * 1000;

export interface PatrimonyScheduler {
  stop(): void;
}

export function startPatrimonyScheduler(): PatrimonyScheduler {
  let lastSnapshotRunDate: string | null = null;
  let lastBenchmarkRunAt: Date | null = null;

  const tick = async (): Promise<void> => {
    const now = new Date();

    if (hasDailyTriggerPassed(now, lastSnapshotRunDate)) {
      try {
        const allUsers = await getDb()
          .select({ id: users.id })
          .from(users)
          .where(isNull(users.deletedAt));
        let succeeded = 0;
        for (const user of allUsers) {
          try {
            await registerSnapshot(user.id, now);
            succeeded += 1;
          } catch (err) {
            console.error(
              `[patrimony-scheduler] snapshot failed for user ${user.id}`,
              err,
            );
          }
        }
        lastSnapshotRunDate = todayBrtString(now);
        console.log(
          `[patrimony-scheduler] daily snapshot sweep completed for ${succeeded}/${allUsers.length} user(s)`,
        );
      } catch (err) {
        console.error("[patrimony-scheduler] daily snapshot sweep failed", err);
      }
    }

    if (hasWeeklyElapsed(now, lastBenchmarkRunAt)) {
      try {
        await refreshBenchmarks(now);
        lastBenchmarkRunAt = now;
        console.log("[patrimony-scheduler] weekly benchmark refresh completed");
      } catch (err) {
        console.error(
          "[patrimony-scheduler] weekly benchmark refresh failed",
          err,
        );
      }
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
