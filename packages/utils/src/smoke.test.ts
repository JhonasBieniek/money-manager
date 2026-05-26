import { describe, expect, it } from "vitest";
import { newId } from "./id.js";

describe("@money-manager/utils", () => {
  it("exports newId as RFC 4122 shaped string", () => {
    const id = newId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });
});
