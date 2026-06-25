import bcrypt from "bcrypt";

export const BCRYPT_COST = 12;

/** Hash bcrypt válido usado quando o email não existe — comparação sempre roda (anti enumeração). */
export const BCRYPT_DUMMY_HASH =
  "$2b$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
