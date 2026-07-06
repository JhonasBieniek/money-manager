import type { Api } from "grammy";
import type { InternalApiClient } from "../api/internal.client.js";
import type { InboundMessageRecord } from "./message-sync.service.js";
import { processInboundRecord, type MessageSyncEnv } from "./message-sync.service.js";

const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000];
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let retryWorkerStarted = false;

function isRecoverableError(syncError: string | null | undefined): boolean {
  return (
    syncError === "Falha no download do Telegram" ||
    syncError === "Falha na transcrição STT"
  );
}

async function patchRetry(
  internal: InternalApiClient,
  recordId: string,
  retryCount: number,
  nextRetryAt: Date | null,
): Promise<void> {
  await internal.patchJson(`/v1/internal/telegram/messages/${recordId}`, {
    retryCount,
    nextRetryAt: nextRetryAt?.toISOString() ?? null,
  });
}

export async function scheduleInboundRetry(
  api: Api,
  record: InboundMessageRecord,
  env: MessageSyncEnv,
  retryCount: number,
): Promise<void> {
  if (retryCount >= 3) {
    return;
  }

  const delay = RETRY_DELAYS_MS[retryCount] ?? RETRY_DELAYS_MS[2]!;
  const nextRetryAt = new Date(Date.now() + delay);
  await patchRetry(env.internal, record.id, retryCount, nextRetryAt);

  const existing = timers.get(record.id);
  if (existing) {
    clearTimeout(existing);
  }

  timers.set(
    record.id,
    setTimeout(() => {
      void runInboundRetry(api, record, env, retryCount + 1);
    }, delay),
  );
}

async function runInboundRetry(
  api: Api,
  record: InboundMessageRecord,
  env: MessageSyncEnv,
  attempt: number,
): Promise<void> {
  timers.delete(record.id);
  const result = await processInboundRecord(api, record, env);
  if (result.status === "failed" && isRecoverableError(result.syncError)) {
    if (attempt >= 3) {
      await patchRetry(env.internal, record.id, attempt, null);
      return;
    }
    await scheduleInboundRetry(api, record, env, attempt);
  } else {
    await patchRetry(env.internal, record.id, attempt, null);
  }
}

export async function startInboundRetryWorker(
  api: Api,
  env: MessageSyncEnv,
): Promise<void> {
  const syncEligible = async () => {
    try {
      const res = await env.internal.getJson(
        "/v1/internal/telegram/messages/retry-eligible?maxAgeHours=24&limit=50",
      );
      if (!res.ok) {
        return;
      }
      const body = (await res.json()) as { items: InboundMessageRecord[] };
      for (const record of body.items ?? []) {
        if (record.retryCount < 3 && !timers.has(record.id)) {
          await scheduleInboundRetry(api, record, env, record.retryCount);
        }
      }
    } catch (error) {
      console.warn("[bot] Retry worker aguardando API ficar disponível.", error);
    }
  };

  await syncEligible();

  if (!retryWorkerStarted) {
    retryWorkerStarted = true;
    setInterval(() => {
      void syncEligible();
    }, 60_000);
  }
}
