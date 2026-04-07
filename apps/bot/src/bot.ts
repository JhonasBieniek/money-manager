import "dotenv/config";
import { Bot, webhookCallback } from "grammy";
import { createServer } from "node:http";
import { handleCancel, handleHelp, handleStart } from "./handlers/command.handler.js";
import { handlePhoto } from "./handlers/photo.handler.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
const allowedChatId = process.env.TELEGRAM_ALLOWED_CHAT_ID;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
const port = Number(process.env.BOT_PORT ?? 3002);

if (!token) {
  throw new Error("TELEGRAM_BOT_TOKEN is required");
}
if (!allowedChatId) {
  throw new Error("TELEGRAM_ALLOWED_CHAT_ID is required");
}

const ocrServiceUrl = process.env.OCR_SERVICE_URL ?? "http://localhost:8000";
const allowed = BigInt(allowedChatId);

const bot = new Bot(token);

bot.use(async (ctx, next) => {
  const chatId = ctx.chat?.id;
  if (chatId === undefined || BigInt(chatId) !== allowed) {
    return;
  }
  await next();
});

bot.command("start", handleStart);
bot.command("help", handleHelp);
bot.command("cancel", handleCancel);
bot.on("message:photo", (ctx) =>
  handlePhoto(ctx, { ocrServiceUrl })
);

const server = createServer(
  webhookCallback(bot, "http", {
    secretToken: webhookSecret,
  })
);

server.listen(port, () => {
  console.info(`Bot webhook listening on ${port}`);
});
