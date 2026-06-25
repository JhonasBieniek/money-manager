import { describe, expect, it } from "@jest/globals";
import { EMAIL_MAX, PASSWORD_MAX } from "@money-manager/utils";
import { loginBodySchema, registerBodySchema } from "./auth.schema.js";

describe("loginBodySchema", () => {
  it("aceita email e senha dentro dos limites", () => {
    const parsed = loginBodySchema.parse({
      email: "a@b.co",
      password: "secret12",
    });
    expect(parsed.email).toBe("a@b.co");
  });

  it("rejeita email inválido", () => {
    expect(() =>
      loginBodySchema.parse({ email: "not-email", password: "ok" }),
    ).toThrow();
  });

  it("rejeita email acima do máximo", () => {
    const longLocal = "a".repeat(EMAIL_MAX);
    expect(() =>
      loginBodySchema.parse({
        email: `${longLocal}@x.co`,
        password: "ok",
      }),
    ).toThrow();
  });

  it("rejeita senha acima do máximo", () => {
    expect(() =>
      loginBodySchema.parse({
        email: "a@b.co",
        password: "x".repeat(PASSWORD_MAX + 1),
      }),
    ).toThrow();
  });
});

describe("registerBodySchema", () => {
  it("aceita email e senha dentro dos limites", () => {
    const parsed = registerBodySchema.parse({
      email: "user@example.com",
      password: "12345678",
    });
    expect(parsed.email).toBe("user@example.com");
  });

  it("rejeita senha curta", () => {
    expect(() =>
      registerBodySchema.parse({
        email: "a@b.co",
        password: "short",
      }),
    ).toThrow();
  });
});
