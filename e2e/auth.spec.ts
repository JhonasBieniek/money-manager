import { test, expect } from "./fixtures";
import {
  ACCESS_TOKEN_STORAGE_KEY,
  expectAccessTokenInSession,
  expectRefreshCookie,
  loginUser,
  logoutUser,
  registerUser,
  skipOnboarding,
} from "./helpers/auth";

test.describe("auth", () => {
  test("registers a new account and stores the access token in sessionStorage", async ({
    page,
    testUser,
  }) => {
    await skipOnboarding(page);
    await registerUser(page, testUser.email, testUser.password);
    await expectAccessTokenInSession(page);
    await expectRefreshCookie(page);
  });

  test("logs in with valid credentials after logout", async ({ page, testUser }) => {
    await skipOnboarding(page);
    await registerUser(page, testUser.email, testUser.password);
    await logoutUser(page);

    await loginUser(page, testUser.email, testUser.password);
    await expectAccessTokenInSession(page);
    await expectRefreshCookie(page);
    await expect(page.getByRole("heading", { name: "Bem-vindo de volta!" })).toBeVisible();
  });

  test("rejects invalid login credentials", async ({ page, testUser }) => {
    await skipOnboarding(page);
    await registerUser(page, testUser.email, testUser.password);
    await logoutUser(page);

    await page.goto("/login");
    await page.getByLabel("E-mail").fill(testUser.email);
    await page.getByLabel("Senha").fill("WrongPassword!");
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("alert")).toContainText(/incorreto|entrar/i);

    const token = await page.evaluate(
      (key) => sessionStorage.getItem(key),
      ACCESS_TOKEN_STORAGE_KEY,
    );
    expect(token).toBeNull();
  });
});
