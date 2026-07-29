import { describe, expect, it, afterEach, beforeEach } from "@jest/globals";
import { encryptSecret, decryptSecret } from "./secret-encryption.js";

describe("encryptSecret / decryptSecret", () => {
  const originalKey = process.env.SETTINGS_ENCRYPTION_KEY;

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.SETTINGS_ENCRYPTION_KEY;
    } else {
      process.env.SETTINGS_ENCRYPTION_KEY = originalKey;
    }
  });

  beforeEach(() => {
    process.env.SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
      "base64",
    );
  });

  it("decryptSecret(encryptSecret(x)) === x", () => {
    const encrypted = encryptSecret("minha-chave-super-secreta");
    expect(decryptSecret(encrypted)).toBe("minha-chave-super-secreta");
  });

  it("gera um iv diferente a cada chamada, mesmo para o mesmo texto", () => {
    const first = encryptSecret("mesma-chave");
    const second = encryptSecret("mesma-chave");
    expect(first.iv).not.toBe(second.iv);
    expect(first.encryptedValue).not.toBe(second.encryptedValue);
  });

  it("lança erro ao descriptografar com authTag adulterada", () => {
    const encrypted = encryptSecret("qualquer-coisa");
    const tampered = {
      ...encrypted,
      authTag: Buffer.from(encrypted.authTag, "base64")
        .map((b, i) => (i === 0 ? b ^ 0xff : b))
        .toString("base64"),
    };
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("lança erro quando SETTINGS_ENCRYPTION_KEY não está configurada", () => {
    delete process.env.SETTINGS_ENCRYPTION_KEY;
    expect(() => encryptSecret("x")).toThrow(
      "SETTINGS_ENCRYPTION_KEY não configurada",
    );
  });
});
