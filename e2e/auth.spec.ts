import { test, expect } from "./fixtures";
import {
  ACCESS_TOKEN_STORAGE_KEY,
  expectAccessTokenStored,
  expectRefreshCookie,
  loginUser,
  logoutUser,
  registerUser,
  skipOnboarding,
} from "./helpers/auth";

test.describe("autenticação", () => {
  test("cadastra conta e persiste access token no localStorage", async ({
    page,
    testUser,
  }) => {
    await skipOnboarding(page);
    await registerUser(page, testUser.email, testUser.password);
    await expectAccessTokenStored(page);
    await expectRefreshCookie(page);
  });

  test("faz login após logout com credenciais válidas", async ({
    page,
    testUser,
  }) => {
    await skipOnboarding(page);
    await registerUser(page, testUser.email, testUser.password);
    await logoutUser(page);

    await loginUser(page, testUser.email, testUser.password);
    await expectAccessTokenStored(page);
    await expectRefreshCookie(page);
    await expect(page.getByRole("heading", { name: "Bem-vindo de volta!" })).toBeVisible();
  });

  test("rejeita credenciais inválidas no login", async ({ page, testUser }) => {
    await skipOnboarding(page);
    await registerUser(page, testUser.email, testUser.password);
    await logoutUser(page);

    await page.goto("/login");
    await page.getByLabel("E-mail").fill(testUser.email);
    await page.getByLabel("Senha", { exact: true }).fill("WrongPassword!");
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("alert")).toContainText(/incorreto|entrar/i);

    const token = await page.evaluate(
      (key) => localStorage.getItem(key),
      ACCESS_TOKEN_STORAGE_KEY,
    );
    expect(token).toBeNull();
  });

  test("redireciona visitante de rota protegida para login", async ({
    page,
  }) => {
    await skipOnboarding(page);
    await page.goto("/dashboard/expenses");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  });
});
