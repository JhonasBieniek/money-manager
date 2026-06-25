import { getDb, tags } from "@money-manager/db";
import type { Tag } from "@money-manager/types";
import { newId } from "@money-manager/utils";
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../../shared/errors/app-error.js";
import type { CreateTagBody, ListTagsQuery, UpdateTagBody } from "./tags.schema.js";

const DEFAULT_COLOR = "#6366f1";

type TagRow = typeof tags.$inferSelect;

function toTag(row: TagRow): Tag {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    color: row.color,
    parentId: row.parentId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function ensureUniqueName(
  userId: string,
  name: string,
  excludeId?: string,
): Promise<void> {
  const filters = [
    eq(tags.userId, userId),
    sql`lower(${tags.name}) = lower(${name})`,
    isNull(tags.deletedAt),
  ];

  if (excludeId) {
    filters.push(ne(tags.id, excludeId));
  }

  const [existing] = await getDb()
    .select({ id: tags.id })
    .from(tags)
    .where(and(...filters))
    .limit(1);

  if (existing) {
    throw new ConflictError("Já existe uma tag ativa com este nome");
  }
}

async function validateParent(
  userId: string,
  parentId: string | null | undefined,
  selfId?: string,
): Promise<void> {
  if (!parentId) {
    return;
  }
  if (selfId && parentId === selfId) {
    throw new BadRequestError("Uma tag não pode ser pai de si mesma");
  }
  const parent = await getTag(userId, parentId);
  if (parent.parentId) {
    throw new BadRequestError(
      "Sub-tags só podem ter um nível (tag pai deve ser raiz)",
    );
  }
}

export async function listTags(
  userId: string,
  query: ListTagsQuery = {},
): Promise<{ items: Tag[] }> {
  const filters = [eq(tags.userId, userId), isNull(tags.deletedAt)];

  if (query.parentId === "root") {
    filters.push(isNull(tags.parentId));
  } else if (query.parentId) {
    filters.push(eq(tags.parentId, query.parentId));
  }

  const rows = await getDb()
    .select()
    .from(tags)
    .where(and(...filters))
    .orderBy(tags.name);

  return { items: rows.map(toTag) };
}

export async function createTag(
  userId: string,
  input: CreateTagBody,
): Promise<{ id: string }> {
  await ensureUniqueName(userId, input.name);
  await validateParent(userId, input.parentId ?? null);

  const id = newId();
  const now = new Date();
  await getDb()
    .insert(tags)
    .values({
      id,
      userId,
      name: input.name,
      color: input.color ?? DEFAULT_COLOR,
      parentId: input.parentId ?? null,
      createdAt: now,
      updatedAt: now,
    });

  return { id };
}

export async function getTag(userId: string, tagId: string): Promise<Tag> {
  const [row] = await getDb()
    .select()
    .from(tags)
    .where(
      and(
        eq(tags.id, tagId),
        eq(tags.userId, userId),
        isNull(tags.deletedAt),
      ),
    )
    .limit(1);

  if (!row) {
    throw new NotFoundError("Tag não encontrada");
  }

  return toTag(row);
}

export async function updateTag(
  userId: string,
  tagId: string,
  input: UpdateTagBody,
): Promise<Tag> {
  await getTag(userId, tagId);

  if (input.name) {
    await ensureUniqueName(userId, input.name, tagId);
  }

  if (input.parentId !== undefined) {
    await validateParent(userId, input.parentId, tagId);
    if (input.parentId) {
      const children = await getDb()
        .select({ id: tags.id })
        .from(tags)
        .where(
          and(
            eq(tags.parentId, tagId),
            eq(tags.userId, userId),
            isNull(tags.deletedAt),
          ),
        );
      if (children.length > 0) {
        throw new BadRequestError("Tag com sub-tags não pode virar sub-tag");
      }
    }
  }

  const patch: Partial<typeof tags.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.name !== undefined) {
    patch.name = input.name;
  }
  if (input.color !== undefined) {
    patch.color = input.color;
  }
  if (input.parentId !== undefined) {
    patch.parentId = input.parentId;
  }

  const [updated] = await getDb()
    .update(tags)
    .set(patch)
    .where(and(eq(tags.id, tagId), eq(tags.userId, userId)))
    .returning();

  if (!updated) {
    throw new NotFoundError("Tag não encontrada");
  }

  return toTag(updated);
}

export async function deleteTag(userId: string, tagId: string): Promise<void> {
  await getTag(userId, tagId);

  const children = await getDb()
    .select({ id: tags.id })
    .from(tags)
    .where(
      and(
        eq(tags.parentId, tagId),
        eq(tags.userId, userId),
        isNull(tags.deletedAt),
      ),
    );

  if (children.length > 0) {
    throw new BadRequestError("Exclua as sub-tags antes de excluir esta tag");
  }

  await getDb()
    .update(tags)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(tags.id, tagId), eq(tags.userId, userId)));
}

export async function assertTagsBelongToUser(
  userId: string,
  tagIds: string[],
): Promise<void> {
  if (tagIds.length === 0) {
    return;
  }

  const rows = await getDb()
    .select({ id: tags.id })
    .from(tags)
    .where(
      and(
        eq(tags.userId, userId),
        isNull(tags.deletedAt),
        inArray(tags.id, tagIds),
      ),
    );

  if (rows.length !== tagIds.length) {
    throw new BadRequestError("Uma ou mais tags são inválidas");
  }
}
