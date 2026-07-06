import "./load-env.js";
import { Bot, webhookCallback } from "grammy";
import { createServer } from "node:http";
import { createInternalClient } from "./api/internal.client.js";
import {
  createHandleStart,
  createHandleCancel,
  createHandleFinalize,
  handleHelp,
} from "./handlers/command.handler.js";
import { handleCallback } from "./handlers/callback.handler.js";
import { handleReply } from "./handlers/reply.handler.js";
import { handleText } from "./handlers/text.handler.js";
import { handleVoice } from "./handlers/voice.handler.js";
import { startInboundRetryWorker } from "./services/inbound-retry.service.js";

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

const sttServiceUrl = process.env.STT_SERVICE_URL ?? "http://localhost:8001";

const internal = createInternalClient({
  apiBaseUrl: apiInternalUrl,
  internalApiKey,
});

const bot = new Bot(token);
const syncEnv = { sttServiceUrl, internal };

bot.command("start", createHandleStart(internal));
bot.command("help", handleHelp);
bot.command("cancel", createHandleCancel(internal));
bot.command("finalizar", createHandleFinalize(internal));

bot.on("callback_query:data", (ctx) => handleCallback(ctx, { internal }));

bot.on("message", async (ctx, next) => {
  if (ctx.message?.reply_to_message) {
    const handled = await handleReply(ctx, { internal });
    if (handled) {
      return;
    }
  }
  await next();
});

bot.on("message:text", (ctx) => handleText(ctx, { internal }));
bot.on(["message:voice", "message:audio"], (ctx) =>
  handleVoice(ctx, syncEnv),
);

async function main() {
  void startInboundRetryWorker(bot.api, syncEnv);

  if (usePolling) {
    await bot.api.deleteWebhook({ drop_pending_updates: false });
    await bot.start({
      onStart: (me) => {
        console.info(
          `Bot @${me.username} — long polling (TELEGRAM_USE_POLLING=true).`,
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
      }),
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
