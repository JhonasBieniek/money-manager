import { describe, expect, it } from "vitest";
import { parseBankNotification } from "./services/parser.service.js";

describe("@money-manager/bot", () => {
  it("parser stub returns object", () => {
    expect(parseBankNotification("foo")).toEqual({});
  });
});
