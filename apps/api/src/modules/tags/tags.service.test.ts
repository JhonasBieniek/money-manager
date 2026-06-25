import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { BadRequestError, ConflictError } from "../../shared/errors/app-error.js";

const dbMock = {
  select: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
};

jest.unstable_mockModule("@money-manager/db", () => ({
  getDb: () => dbMock,
  tags: {
    id: "id",
    userId: "user_id",
    name: "name",
    color: "color",
    parentId: "parent_id",
    deletedAt: "deleted_at",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
}));

jest.unstable_mockModule("@money-manager/utils", () => ({
  newId: () => "tag-id-1",
}));

const tagsService = await import("./tags.service.js");

function chainLimit<T>(value: T) {
  return {
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(value),
        orderBy: () => Promise.resolve(value),
      }),
    }),
  };
}

describe("createTag", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("cria tag raiz", async () => {
    dbMock.select.mockReturnValue(chainLimit([]));
    dbMock.insert.mockReturnValue({
      values: jest.fn().mockResolvedValue(undefined),
    });

    const result = await tagsService.createTag("user-1", { name: "Mercado" });
    expect(result.id).toBe("tag-id-1");
  });

  it("rejeita nome duplicado", async () => {
    dbMock.select.mockReturnValue(chainLimit([{ id: "existing" }]));

    await expect(
      tagsService.createTag("user-1", { name: "Mercado" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("deleteTag", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("exige excluir sub-tags antes do pai", async () => {
    const now = new Date();
    dbMock.select
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: () =>
              Promise.resolve([
                {
                  id: "tag-1",
                  userId: "user-1",
                  name: "Pai",
                  color: "#6366f1",
                  parentId: null,
                  createdAt: now,
                  updatedAt: now,
                  deletedAt: null,
                },
              ]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => Promise.resolve([{ id: "child-1" }]),
        }),
      });

    await expect(tagsService.deleteTag("user-1", "tag-1")).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });
});
