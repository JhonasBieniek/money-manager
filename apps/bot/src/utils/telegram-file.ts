import type { Context } from "grammy";

export async function downloadTelegramFile(
  ctx: Context,
  fileId: string
): Promise<Buffer> {
  const file = await ctx.api.getFile(fileId);
  if (!file.file_path) {
    throw new Error("Telegram file path missing");
  }
  const url = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download Telegram file: ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
