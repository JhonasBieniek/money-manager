import { getDb, users } from "@money-manager/db";
import type { UserProfile } from "@money-manager/types";
import { and, eq, isNull } from "drizzle-orm";
import { NotFoundError } from "../../shared/errors/app-error.js";

export async function getUserProfile(userId: string): Promise<UserProfile> {
  const [row] = await getDb()
    .select({
      id: users.id,
      email: users.email,
    })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);

  if (!row) {
    throw new NotFoundError("User not found");
  }

  return {
    id: row.id,
    email: row.email,
  };
}
