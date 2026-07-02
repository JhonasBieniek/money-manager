import { test as base, type Page } from "@playwright/test";
import { loginUser, registerUser, skipOnboarding } from "./helpers/auth";
import { createTestUser, type TestUser } from "./helpers/test-user";

type E2EFixtures = {
  testUser: TestUser;
  authenticatedPage: Page;
};

export const test = base.extend<E2EFixtures>({
  testUser: async ({}, use) => {
    await use(createTestUser());
  },

  authenticatedPage: async ({ page, testUser }, use) => {
    await skipOnboarding(page);
    await registerUser(page, testUser.email, testUser.password);
    await use(page);
  },
});

export { expect } from "@playwright/test";
