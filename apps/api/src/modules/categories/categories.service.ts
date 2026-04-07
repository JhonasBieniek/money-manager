import type { CreateCategoryBody } from "./categories.schema.js";

export async function createCategory(
  _userId: string,
  _input: CreateCategoryBody
): Promise<{ ok: true }> {
  return { ok: true };
}
