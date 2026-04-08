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

const server = createServer(
  webhookCallback(bot, "http", {
    secretToken: webhookSecret,
  })
);

server.listen(port, () => {
  console.info(`Bot webhook listening on ${port}`);
});
