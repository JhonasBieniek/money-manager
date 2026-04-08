#!/bin/sh
set -eu

# Opcional: defina RUN_DB_MIGRATIONS=false se várias réplicas da API rodarem migrations
# via job único no Coolify (evita corrida entre pods).
if [ "${RUN_DB_MIGRATIONS:-true}" = "true" ]; then
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "docker-entrypoint: DATABASE_URL is required when RUN_DB_MIGRATIONS=true" >&2
    exit 1
  fi
  cd /app
  pnpm --filter @money-manager/db run db:migrate:runtime
fi

exec node /app/apps/api/dist/server.js
