import type { RegisterBody } from "./auth.schema.js";

export async function registerUser(_input: RegisterBody): Promise<{ ok: true }> {
  // Implementação: hash bcrypt, insert users com transação Drizzle
  return { ok: true };
}
