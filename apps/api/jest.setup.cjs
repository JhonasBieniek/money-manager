process.env.JWT_ACCESS_SECRET ??=
  "test-access-secret-min-32-characters-long";
process.env.JWT_REFRESH_SECRET ??=
  "test-refresh-secret-min-32-characters-long";
process.env.NODE_ENV = "test";

if (process.env.GITHUB_ACTIONS === "true") {
  process.env.DATABASE_URL ??=
    "postgresql://money_manager:changeme@localhost:5432/money_manager";
} else {
  process.env.DATABASE_URL ??=
    "postgresql://money_manager:changeme@localhost:15432/money_manager";
}
