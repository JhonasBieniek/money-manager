import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { createTestApp } from "../helpers/app.js";
import { registerUser } from "../helpers/auth.js";
import { describeWithDb, useIntegrationDbLifecycle } from "../helpers/db.js";

describeWithDb("users integration", () => {
  const app = createTestApp();

  useIntegrationDbLifecycle();

  it("GET /v1/me retorna 401 sem auth", async () => {
    const res = await request(app).get("/v1/me");

    expect(res.status).toBe(401);
  });

  it("GET /v1/me retorna id e email com token", async () => {
    const { accessToken, email } = await registerUser(app);

    const res = await request(app)
      .get("/v1/me")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(email);
    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBeUndefined();
    expect(res.body.avatarUrl).toBeUndefined();
  });
});
