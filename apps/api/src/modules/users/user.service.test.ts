import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { NotFoundError } from "../../shared/errors/app-error.js";

const dbMock = {
  select: jest.fn(),
};

jest.unstable_mockModule("@money-manager/db", () => ({
  getDb: () => dbMock,
  users: {},
}));

const userService = await import("./user.service.js");

describe("getUserProfile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("retorna id e email do usuário", async () => {
    dbMock.select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve([
              {
                id: "550e8400-e29b-41d4-a716-446655440000",
                email: "user@example.com",
              },
            ]),
        }),
      }),
    });

    const profile = await userService.getUserProfile(
      "550e8400-e29b-41d4-a716-446655440000",
    );

    expect(profile).toEqual({
      id: "550e8400-e29b-41d4-a716-446655440000",
      email: "user@example.com",
    });
  });

  it("lança NotFoundError quando usuário não existe", async () => {
    dbMock.select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
        }),
      }),
    });

    await expect(
      userService.getUserProfile("550e8400-e29b-41d4-a716-446655440000"),
    ).rejects.toThrow(NotFoundError);
  });
});
