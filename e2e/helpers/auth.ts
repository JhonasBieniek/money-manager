import { expect, type Page } from "@playwright/test";

export const ACCESS_TOKEN_STORAGE_KEY = "mm_access_token";
export const ONBOARDING_STORAGE_KEY = "mm-onboarding-completed";
export const REFRESH_COOKIE_NAME = "refreshToken";

export async function skipOnboarding(page: Page) {
  await page.addInitScript((key) => {
    window.localStorage.setItem(key, "1");
  }, ONBOARDING_STORAGE_KEY);
}

export async function registerUser(
  page: Page,
  email: string,
  password: string,
) {
  await page.goto("/register");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);

  const registerResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/v1/auth/register") &&
      response.request().method() === "POST",
  );

  await page.getByRole("button", { name: "Cadastrar" }).click();
  const response = await registerResponse;

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Register failed (${response.status()}): ${body}`);
  }

  await expect(page).toHaveURL(/\/dashboard/);
}

export async function loginUser(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);

  const loginResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/v1/auth/login") &&
      response.request().method() === "POST",
  );

  await page.getByRole("button", { name: "Entrar" }).click();
  const response = await loginResponse;

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Login failed (${response.status()}): ${body}`);
  }

  await expect(page).toHaveURL(/\/dashboard/);
}

export async function expectAccessTokenStored(page: Page) {
  const token = await page.evaluate(
    (key) => localStorage.getItem(key),
    ACCESS_TOKEN_STORAGE_KEY,
  );
  expect(token).toBeTruthy();
  expect(typeof token).toBe("string");
  expect((token as string).length).toBeGreaterThan(10);
}

export async function expectRefreshCookie(page: Page) {
  const cookies = await page.context().cookies();
  const refresh = cookies.find((cookie) => cookie.name === REFRESH_COOKIE_NAME);
  expect(refresh).toBeDefined();
  expect(refresh?.httpOnly).toBe(true);
}

export async function logoutUser(page: Page) {
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login/);
  const token = await page.evaluate(
    (key) => localStorage.getItem(key),
    ACCESS_TOKEN_STORAGE_KEY,
  );
  expect(token).toBeNull();
}
