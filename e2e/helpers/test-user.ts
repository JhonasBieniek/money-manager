export type TestUser = {
  email: string;
  password: string;
};

export function createTestUser(prefix = "e2e"): TestUser {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    email: `${prefix}-${id}@example.com`,
    password: "TestPass123!",
  };
}
