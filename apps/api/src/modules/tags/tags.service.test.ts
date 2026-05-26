import { beforeEach, describe, expect, it, vi } from "vitest";
import * as tagsService from "./tags.service.js";

const dbMock = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@money-manager/db", () => ({
  db: dbMock,
  tags: {
    id: "id",
    name: "name",
    parentId: "parent_id",
    deletedAt: "deleted_at",
  },
}));

vi.mock("@money-manager/utils", () => ({
  newId: () => "tag-uuid",
}));

describe("tags.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cria tag raiz", async () => {
    dbMock.select.mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    });
    dbMock.insert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });

    const result = await tagsService.createTag({ name: "Mercado" });
    expect(result.id).toBe("tag-uuid");
  });
});
