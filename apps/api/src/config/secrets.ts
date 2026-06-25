function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  if (value.length < 32) {
    throw new Error(`${name} must be at least 32 characters`);
  }
  return value;
}

export function getJwtAccessSecret(): string {
  return requireEnv("JWT_ACCESS_SECRET");
}

export function getJwtRefreshSecret(): string {
  return requireEnv("JWT_REFRESH_SECRET");
}
