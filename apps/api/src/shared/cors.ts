const DEFAULT_DEV_CORS_ORIGINS = ["http://localhost:5173"];

export function getAllowedCorsOrigins(): string[] | false {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (!raw) {
    return process.env.NODE_ENV === "production" ? false : DEFAULT_DEV_CORS_ORIGINS;
  }

  const origins = raw.split(",").map((origin) => origin.trim()).filter(Boolean);
  return origins.length > 0 ? origins : false;
}
