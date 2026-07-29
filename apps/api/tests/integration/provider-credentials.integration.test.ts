import { afterEach, describe, expect, it, jest } from "@jest/globals";
import request from "supertest";
import { createTestApp } from "../helpers/app.js";
import { registerUser } from "../helpers/auth.js";
import { describeWithDb, useIntegrationDbLifecycle } from "../helpers/db.js";

function mockValidBrapiFetch() {
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      results: [{ symbol: "PETR4", regularMarketPrice: 38.42 }],
    }),
  }) as unknown as typeof fetch;
}

describeWithDb("provider credentials integration", () => {
  const app = createTestApp();
  const originalFetch = globalThis.fetch;

  useIntegrationDbLifecycle();

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("GET /v1/me/provider-credentials retorna 401 sem auth", async () => {
    const res = await request(app).get("/v1/me/provider-credentials");
    expect(res.status).toBe(401);
  });

  it("PUT /v1/me/provider-credentials/brapi retorna 401 sem auth", async () => {
    const res = await request(app)
      .put("/v1/me/provider-credentials/brapi")
      .send({ apiKey: "qualquer-coisa" });
    expect(res.status).toBe(401);
  });

  it("PUT com :provider inválido retorna 400", async () => {
    const { accessToken } = await registerUser(app);

    const res = await request(app)
      .put("/v1/me/provider-credentials/yahoo")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ apiKey: "qualquer-coisa" });

    expect(res.status).toBe(400);
  });

  it("PUT com apiKey vazia retorna 400", async () => {
    const { accessToken } = await registerUser(app);

    const res = await request(app)
      .put("/v1/me/provider-credentials/brapi")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ apiKey: "" });

    expect(res.status).toBe(400);
  });

  it("PUT com chave válida salva e GET lista a credencial", async () => {
    const { accessToken } = await registerUser(app);
    mockValidBrapiFetch();

    const putRes = await request(app)
      .put("/v1/me/provider-credentials/brapi")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ apiKey: "chave-valida" });
    expect(putRes.status).toBe(204);

    const getRes = await request(app)
      .get("/v1/me/provider-credentials")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.items).toHaveLength(1);
    expect(getRes.body.items[0].provider).toBe("brapi");
    expect(typeof getRes.body.items[0].updatedAt).toBe("string");
  });

  it("PUT com chave rejeitada pelo provider retorna 400 e não salva nada", async () => {
    const { accessToken } = await registerUser(app);
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
    }) as unknown as typeof fetch;

    const putRes = await request(app)
      .put("/v1/me/provider-credentials/brapi")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ apiKey: "chave-invalida" });
    expect(putRes.status).toBe(400);
    expect(putRes.body.code).toBe("BAD_REQUEST");

    const getRes = await request(app)
      .get("/v1/me/provider-credentials")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(getRes.body.items).toHaveLength(0);
  });

  it("DELETE remove uma credencial configurada", async () => {
    const { accessToken } = await registerUser(app);
    mockValidBrapiFetch();
    await request(app)
      .put("/v1/me/provider-credentials/brapi")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ apiKey: "chave-valida" });

    const deleteRes = await request(app)
      .delete("/v1/me/provider-credentials/brapi")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(deleteRes.status).toBe(204);

    const getRes = await request(app)
      .get("/v1/me/provider-credentials")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(getRes.body.items).toHaveLength(0);
  });

  it("DELETE em provider sem credencial cadastrada retorna 404", async () => {
    const { accessToken } = await registerUser(app);

    const res = await request(app)
      .delete("/v1/me/provider-credentials/coingecko")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });
});
