import { describe, expect, it } from "@jest/globals";
import { newId } from "./id.js";

describe("newId", () => {
  it("gera UUID v7 válido", () => {
    const id = newId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("gera ids distintos", () => {
    const a = newId();
    const b = newId();
    expect(a).not.toBe(b);
  });
});
