import type { Context } from "grammy";

export async function handleStart(ctx: Context): Promise<void> {
  await ctx.reply("Money Manager bot. Envie um print de notificação ou use /help.");
}

export async function handleHelp(ctx: Context): Promise<void> {
  await ctx.reply("Comandos: /start, /help, /cancel");
}

export async function handleCancel(ctx: Context): Promise<void> {
  await ctx.reply("Operação cancelada.");
}
