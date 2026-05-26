import { describe, expect, it } from "vitest";
import { createTagSchema } from "./modules/tags/tags.schema.js";

describe("@money-manager/api", () => {
  it("validates create tag schema", () => {
    const parsed = createTagSchema.parse({ name: "Mercado" });
    expect(parsed.name).toBe("Mercado");
  });
});
