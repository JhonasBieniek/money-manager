import { db, sessions, telegramLinkTokens, users } from "@money-manager/db";
import type { LoginSuccessBody, RegisterSuccessBody } from "@money-manager/types";
import { newId } from "@money-manager/utils";
import { and, eq, isNull } from "drizzle-orm";
import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import { signAccessToken } from "../../lib/jwt.js";
import { generateRefreshTokenPlain, hashRefreshToken } from "../../lib/refresh-token.js";
import {
  ConflictError,
  InvalidCredentialsError,
  UnauthorizedError,
} from "../../shared/errors/app-error.js";
import {
  ACCESS_TOKEN_TTL_SEC,
  BCRYPT_COST,
  BCRYPT_DUMMY_HASH,
  REFRESH_TOKEN_DAYS,
  TELEGRAM_LINK_EXPLANATION,
  TELEGRAM_LINK_EXPIRES_SEC,
} from "./auth.constants.js";
import type { LoginBody, RegisterBody } from "./auth.schema.js";

function isPostgresUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}

export async function registerUser(input: RegisterBody): Promise<RegisterSuccessBody> {
  const email = normalizeEmail(input.email);
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  const userId = newId();
  const linkToken = randomBytes(32).toString("hex");
  const linkExpiresAt = new Date(Date.now() + TELEGRAM_LINK_EXPIRES_SEC * 1000);
  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, email), isNull(users.deletedAt)))
        .for("update")
        .limit(1);

      if (existing) {
        throw new ConflictError();
      }

      await tx.insert(users).values({
        id: userId,
        email,
        passwordHash,
        updatedAt: now,
      });

      await tx.insert(telegramLinkTokens).values({
        id: newId(),
        userId,
        token: linkToken,
        expiresAt: linkExpiresAt,
      });
    });
  } catch (err) {
    if (err instanceof ConflictError) {
      throw err;
    }
    if (isPostgresUniqueViolation(err)) {
      throw new ConflictError();
    }
    throw err;
  }

  return {
    telegramStartText: `/start ${linkToken}`,
    telegramExplanation: TELEGRAM_LINK_EXPLANATION,
    expiresInSeconds: TELEGRAM_LINK_EXPIRES_SEC,
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type LoginResult = {
  body: LoginSuccessBody;
  refreshTokenPlain: string;
};

export async function loginUser(input: LoginBody, meta: LoginMeta): Promise<LoginResult> {
  const email = normalizeEmail(input.email);

  const [user] = await db
    .select({
      id: users.id,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);

  const hashForCompare = user?.passwordHash ?? BCRYPT_DUMMY_HASH;
  const passwordOk = await bcrypt.compare(input.password, hashForCompare);

  if (!user || !passwordOk) {
    throw new InvalidCredentialsError();
  }

  const refreshPlain = generateRefreshTokenPlain();
  const tokenHash = hashRefreshToken(refreshPlain);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

  await db.transaction(async (tx) => {
    await tx.insert(sessions).values({
      id: newId(),
      userId: user.id,
      tokenHash,
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
      expiresAt,
    });
  });

  const accessToken = await signAccessToken(user.id);

  return {
    body: {
      accessToken,
      tokenType: "Bearer",
      expiresInSeconds: ACCESS_TOKEN_TTL_SEC,
    },
    refreshTokenPlain: refreshPlain,
  };
}

export type LoginMeta = {
  userAgent?: string;
  ip?: string;
};

export async function refreshSession(
  refreshTokenPlain: string | undefined,
  meta: LoginMeta
): Promise<LoginResult> {
  if (!refreshTokenPlain) {
    throw new UnauthorizedError();
  }

  const tokenHash = hashRefreshToken(refreshTokenPlain);
  const now = new Date();

  return db.transaction(async (tx) => {
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
    const expiresAt = new Date(now.getTime() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

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
