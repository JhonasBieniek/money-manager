import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { createTestApp } from "../helpers/app.js";
import { registerUser } from "../helpers/auth.js";
import { describeWithDb, useIntegrationDbLifecycle } from "../helpers/db.js";

describeWithDb("tags integration", () => {
  const app = createTestApp();

  useIntegrationDbLifecycle();

  it("GET /v1/tags retorna 401 sem auth", async () => {
    const res = await request(app).get("/v1/tags");
    expect(res.status).toBe(401);
  });

  it("cria tag raiz e sub-tag", async () => {
    const { accessToken } = await registerUser(app);

    const rootRes = await request(app)
      .post("/v1/tags")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Alimentação", color: "#22c55e" });

    expect(rootRes.status).toBe(201);

    const subRes = await request(app)
      .post("/v1/tags")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Mercado",
        parentId: rootRes.body.id,
      });

    expect(subRes.status).toBe(201);

    const listSubs = await request(app)
      .get(`/v1/tags?parentId=${rootRes.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(listSubs.body.items).toHaveLength(1);
    expect(listSubs.body.items[0].name).toBe("Mercado");
  });

  it("rejeita sub-tag de sub-tag", async () => {
    const { accessToken } = await registerUser(app);

    const rootRes = await request(app)
      .post("/v1/tags")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Raiz" });

    const subRes = await request(app)
      .post("/v1/tags")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Filha", parentId: rootRes.body.id });

    const nestedRes = await request(app)
      .post("/v1/tags")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Neta", parentId: subRes.body.id });

    expect(nestedRes.status).toBe(400);
  });

  it("rejeita nome duplicado case-insensitive", async () => {
    const { accessToken } = await registerUser(app);

    await request(app)
      .post("/v1/tags")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Mercado" });

    const dupRes = await request(app)
      .post("/v1/tags")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "mercado" });

    expect(dupRes.status).toBe(409);
  });

  it("exige excluir sub-tags antes do pai", async () => {
    const { accessToken } = await registerUser(app);

    const rootRes = await request(app)
      .post("/v1/tags")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Pai" });

    await request(app)
      .post("/v1/tags")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Filha", parentId: rootRes.body.id });

    const deleteRes = await request(app)
      .delete(`/v1/tags/${rootRes.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(deleteRes.status).toBe(400);
  });
});
