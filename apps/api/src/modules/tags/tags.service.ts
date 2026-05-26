import { db, tags } from "@money-manager/db";
import { newId } from "@money-manager/utils";
import { and, eq, isNull, ne } from "drizzle-orm";
import { ciEqual } from "../../shared/db/sql-helpers.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/app-error.js";
import type { CreateTagBody, ListTagsQuery, UpdateTagBody } from "./tags.schema.js";

async function ensureUniqueName(name: string, excludeId?: string) {
  const filters = [ciEqual(tags.name, name), isNull(tags.deletedAt)];

  if (excludeId) {
    filters.push(ne(tags.id, excludeId));
  }

  const [existing] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(...filters))
    .limit(1);

  if (existing) {
    throw new ConflictError("Já existe uma tag ativa com este nome");
  }
}

async function validateParent(parentId: string | null | undefined, selfId?: string) {
  if (!parentId) {
    return;
  }
  if (selfId && parentId === selfId) {
    throw new ValidationError("Uma tag não pode ser pai de si mesma");
  }
  const parent = await getTag(parentId);
  if (parent.parentId) {
    throw new ValidationError("Sub-tags só podem ter um nível (tag pai deve ser raiz)");
  }
}

export async function listTags(
  query: ListTagsQuery = {}
): Promise<{ items: (typeof tags.$inferSelect)[] }> {
  const filters = [isNull(tags.deletedAt)];

  if (query.parentId === "root") {
    filters.push(isNull(tags.parentId));
  } else if (query.parentId) {
    filters.push(eq(tags.parentId, query.parentId));
  }

  const items = await db
    .select()
    .from(tags)
    .where(and(...filters))
    .orderBy(tags.name);

  return { items };
}

export async function createTag(input: CreateTagBody): Promise<{ id: string }> {
  await ensureUniqueName(input.name);
  await validateParent(input.parentId ?? null);

  const id = newId();
  const now = new Date();
  await db.insert(tags).values({
    id,
    name: input.name,
    parentId: input.parentId ?? null,
    createdAt: now,
  });

  return { id };
}

export async function getTag(tagId: string): Promise<typeof tags.$inferSelect> {
  const [tag] = await db
    .select()
    .from(tags)
    .where(and(eq(tags.id, tagId), isNull(tags.deletedAt)))
    .limit(1);

  if (!tag) {
    throw new NotFoundError("Tag não encontrada");
  }

  return tag;
}

export async function updateTag(
  tagId: string,
  input: UpdateTagBody
): Promise<typeof tags.$inferSelect> {
  const current = await getTag(tagId);

  if (input.name) {
    await ensureUniqueName(input.name, tagId);
  }

  if (input.parentId !== undefined) {
    await validateParent(input.parentId, tagId);
    if (input.parentId === null && current.parentId) {
      // ok: move to root
    }
    if (input.parentId) {
      const children = await db
        .select({ id: tags.id })
        .from(tags)
        .where(and(eq(tags.parentId, tagId), isNull(tags.deletedAt)));
      if (children.length > 0) {
        throw new ValidationError("Tag com sub-tags não pode virar sub-tag");
      }
    }
  }

  const updatedRows = (await db
    .update(tags)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
    })
    .where(eq(tags.id, tagId))
    .returning()) as (typeof tags.$inferSelect)[];
  const updated = updatedRows[0];
  if (!updated) {
    throw new NotFoundError("Tag não encontrada");
  }

  return updated;
}

export async function deleteTag(tagId: string): Promise<void> {
  await getTag(tagId);

  const children = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.parentId, tagId), isNull(tags.deletedAt)));

  if (children.length > 0) {
    throw new ValidationError("Exclua as sub-tags antes de excluir esta tag");
  }

  await db.update(tags).set({ deletedAt: new Date() }).where(eq(tags.id, tagId));
}
