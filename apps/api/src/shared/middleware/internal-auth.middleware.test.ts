import { afterEach, describe, expect, it, jest } from "@jest/globals";
import type { NextFunction, Request, Response } from "express";
import { requireInternalApiKey } from "./internal-auth.js";

function mockResponse() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

describe("requireInternalApiKey", () => {
  const originalKey = process.env.INTERNAL_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.INTERNAL_API_KEY;
    } else {
      process.env.INTERNAL_API_KEY = originalKey;
    }
  });

  it("retorna 500 quando INTERNAL_API_KEY não está configurada", () => {
    delete process.env.INTERNAL_API_KEY;
    const req = { headers: {} } as Request;
    const res = mockResponse();
    const next = jest.fn() as NextFunction;

    requireInternalApiKey(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Internal error" });
    expect(next).not.toHaveBeenCalled();
  });

  it("retorna 401 quando a chave está ausente ou incorreta", () => {
    process.env.INTERNAL_API_KEY = "expected-key";
    const req = { headers: { "x-internal-api-key": "wrong" } } as Request;
    const res = mockResponse();
    const next = jest.fn() as NextFunction;

    requireInternalApiKey(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  it("chama next quando a chave é válida", () => {
    process.env.INTERNAL_API_KEY = "expected-key";
    const req = {
      headers: { "x-internal-api-key": "expected-key" },
    } as Request;
    const res = mockResponse();
    const next = jest.fn() as NextFunction;

    requireInternalApiKey(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
