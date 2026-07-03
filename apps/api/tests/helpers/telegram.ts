import type { Express } from "express";
import request from "supertest";

export const INTERNAL_API_KEY =
  process.env.INTERNAL_API_KEY ?? "dev-internal-key-change-me";

/** Vincula um chat Telegram ao usuário autenticado via API interna. */
export async function linkTelegramChat(
  app: Express,
  accessToken: string,
  chatId: string,
): Promise<void> {
  const tokenRes = await request(app)
    .post("/v1/telegram/link-token")
    .set("Authorization", `Bearer ${accessToken}`);

  await request(app)
    .post("/v1/internal/telegram/link")
    .set("x-internal-api-key", INTERNAL_API_KEY)
    .send({ token: tokenRes.body.token, chatId });
}
