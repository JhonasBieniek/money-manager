import type { Api } from "grammy";

const TELEGRAM_FILE_DOWNLOAD_TIMEOUT_MS = 30_000;
const TELEGRAM_FILE_DOWNLOAD_MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }
  const code =
    (err as NodeJS.ErrnoException).code ??
    (err.cause as NodeJS.ErrnoException | undefined)?.code;
  return (
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "EAI_AGAIN" ||
    err.name === "AbortError" ||
    err.name === "TimeoutError"
  );
}

function formatNetworkError(err: unknown): string {
  if (!(err instanceof Error)) {
    return String(err);
  }
  const code =
    (err as NodeJS.ErrnoException).code ??
    (err.cause as NodeJS.ErrnoException | undefined)?.code;
  return code ? `${err.message} (${code})` : err.message;
}

async function fetchTelegramFileBytes(url: string): Promise<Buffer> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= TELEGRAM_FILE_DOWNLOAD_MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(TELEGRAM_FILE_DOWNLOAD_TIMEOUT_MS),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastError = err;
      const retryable = isRetryableNetworkError(err);
      if (!retryable || attempt === TELEGRAM_FILE_DOWNLOAD_MAX_RETRIES) {
        break;
      }
      await sleep(attempt * 1_000);
    }
  }

  throw new Error(
    `Telegram file download failed after ${TELEGRAM_FILE_DOWNLOAD_MAX_RETRIES} attempt(s): ${formatNetworkError(lastError)}`,
    { cause: lastError },
  );
}

export async function downloadTelegramFile(
  api: Api,
  fileId: string,
): Promise<Buffer> {
  const file = await api.getFile(fileId);
  if (!file.file_path) {
    throw new Error("Telegram file path missing");
  }
  const url = `https://api.telegram.org/file/bot${api.token}/${file.file_path}`;
  return fetchTelegramFileBytes(url);
}
