import "dotenv/config";
import { Bot, webhookCallback } from "grammy";
import { createServer } from "node:http";
import { createInternalClient } from "./api/internal.client.js";
import {
  createHandleStart,
  handleCancel,
  handleHelp,
} from "./handlers/command.handler.js";
import { handlePhoto } from "./handlers/photo.handler.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
const port = Number(process.env.BOT_PORT ?? 3002);
const apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://localhost:3001";
const internalApiKey = process.env.INTERNAL_API_KEY ?? "";
const usePolling = process.env.TELEGRAM_USE_POLLING === "true";

if (!token) {
  throw new Error("TELEGRAM_BOT_TOKEN is required");
}
if (!internalApiKey) {
  throw new Error("INTERNAL_API_KEY is required");
}

const ocrServiceUrl = process.env.OCR_SERVICE_URL ?? "http://localhost:8000";

const internal = createInternalClient({
  apiBaseUrl: apiInternalUrl,
  internalApiKey,
});

const bot = new Bot(token);

bot.command("start", createHandleStart(internal));
bot.command("help", handleHelp);
bot.command("cancel", handleCancel);
bot.on("message:photo", (ctx) =>
  handlePhoto(ctx, { ocrServiceUrl, internal })
);

async function main() {
  if (usePolling) {
    await bot.api.deleteWebhook({ drop_pending_updates: false });
    await bot.start({
      onStart: (me) => {
        console.info(
          `Bot @${me.username} — long polling (TELEGRAM_USE_POLLING=true). Use um token de bot de dev se o de prod ainda tiver webhook.`
        );
      },
    });
    const stop = async () => {
      await bot.stop();
      process.exit(0);
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  } else {
    const server = createServer(
      webhookCallback(bot, "http", {
        secretToken: webhookSecret,
      })
    );
    server.listen(port, () => {
      console.info(`Bot webhook listening on ${port}`);
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
