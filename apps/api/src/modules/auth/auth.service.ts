import { getDb, sessions, users } from "@money-manager/db";
import type { LoginSuccessBody, RegisterSuccessBody } from "@money-manager/types";
import {
  BCRYPT_DUMMY_HASH,
  generateRefreshTokenPlain,
  hashPassword,
  hashRefreshToken,
  newId,
  verifyPassword,
} from "@money-manager/utils";
import { and, eq, isNull } from "drizzle-orm";
import { signAccessToken, ACCESS_TOKEN_TTL_SEC } from "../../lib/jwt.js";
import {
  ConflictError,
  InvalidCredentialsError,
  UnauthorizedError,
} from "../../shared/errors/app-error.js";
import { REFRESH_TOKEN_DAYS } from "./auth.constants.js";
import type { LoginBody, RegisterBody } from "./auth.schema.js";

function isPostgresUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function createSessionForUser(
  userId: string,
  meta: LoginMeta,
): Promise<LoginResult> {
  const refreshPlain = generateRefreshTokenPlain();
  const tokenHash = hashRefreshToken(refreshPlain);
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
  );

  await getDb().transaction(async (tx) => {
    await tx.insert(sessions).values({
      id: newId(),
      userId,
      tokenHash,
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
      expiresAt,
    });
  });

  const accessToken = await signAccessToken(userId);

  return {
    body: {
      accessToken,
      tokenType: "Bearer",
      expiresInSeconds: ACCESS_TOKEN_TTL_SEC,
    },
    refreshTokenPlain: refreshPlain,
  };
}

export async function registerUser(
  input: RegisterBody,
  meta: LoginMeta,
): Promise<LoginResult & { body: RegisterSuccessBody }> {
  const email = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);
  const userId = newId();
  const now = new Date();

  try {
    await getDb().transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, email), isNull(users.deletedAt)))
        .for("update")
        .limit(1);

      if (existing) {
        throw new ConflictError("Email already in use");
      }

      await tx.insert(users).values({
        id: userId,
        email,
        passwordHash,
        updatedAt: now,
      });
    });
  } catch (err) {
    if (err instanceof ConflictError) {
      throw err;
    }
    if (isPostgresUniqueViolation(err)) {
      throw new ConflictError("Email already in use");
    }
    throw err;
  }

  const session = await createSessionForUser(userId, meta);

  return {
    ...session,
    body: {
      message: "Conta criada com sucesso",
      ...session.body,
    },
  };
}

export type LoginMeta = {
  userAgent?: string;
  ip?: string;
};

export type LoginResult = {
  body: LoginSuccessBody;
  refreshTokenPlain: string;
};

export async function loginUser(
  input: LoginBody,
  meta: LoginMeta,
): Promise<LoginResult> {
  const email = normalizeEmail(input.email);

  const [user] = await getDb()
    .select({
      id: users.id,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);

  const hashForCompare = user?.passwordHash ?? BCRYPT_DUMMY_HASH;
  const passwordOk = await verifyPassword(input.password, hashForCompare);

  if (!user || !passwordOk) {
    throw new InvalidCredentialsError();
  }

  return createSessionForUser(user.id, meta);
}

export async function refreshSession(
  refreshTokenPlain: string | undefined,
  meta: LoginMeta,
): Promise<LoginResult> {
  if (!refreshTokenPlain) {
    throw new UnauthorizedError();
  }

  const tokenHash = hashRefreshToken(refreshTokenPlain);
  const now = new Date();

  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, tokenHash))
      .for("update")
      .limit(1);

    if (!row) {
      throw new UnauthorizedError();
    }

    if (row.revokedAt !== null) {
      await tx
        .update(sessions)
        .set({ revokedAt: now })
        .where(and(eq(sessions.userId, row.userId), isNull(sessions.revokedAt)));
      throw new UnauthorizedError();
    }

    if (row.expiresAt <= now) {
      throw new UnauthorizedError();
    }

    await tx
      .update(sessions)
      .set({ revokedAt: now })
      .where(eq(sessions.id, row.id));

    const newPlain = generateRefreshTokenPlain();
    const newHash = hashRefreshToken(newPlain);
    const expiresAt = new Date(
      now.getTime() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
    );

    await tx.insert(sessions).values({
      id: newId(),
      userId: row.userId,
      tokenHash: newHash,
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
      expiresAt,
    });

    const accessToken = await signAccessToken(row.userId);

    return {
      body: {
        accessToken,
        tokenType: "Bearer",
        expiresInSeconds: ACCESS_TOKEN_TTL_SEC,
      },
      refreshTokenPlain: newPlain,
    };
  });
}

export async function logoutUser(
  refreshTokenPlain: string | undefined,
): Promise<void> {
  if (!refreshTokenPlain) {
    return;
  }

  const tokenHash = hashRefreshToken(refreshTokenPlain);
  const now = new Date();

  await getDb().transaction(async (tx) => {
    const [row] = await tx
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.tokenHash, tokenHash))
      .for("update")
      .limit(1);

    if (row) {
      await tx
        .update(sessions)
        .set({ revokedAt: now })
        .where(eq(sessions.id, row.id));
    }
  });
}
