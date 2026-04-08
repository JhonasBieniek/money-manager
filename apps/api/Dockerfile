# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.6.5 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/utils/package.json ./packages/utils/
COPY packages/types/package.json ./packages/types/
COPY packages/db/package.json ./packages/db/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile

COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile

RUN pnpm exec turbo run build --filter=@money-manager/api...

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/tsconfig.base.json ./tsconfig.base.json

COPY apps/api/docker-entrypoint.sh /app/apps/api/docker-entrypoint.sh
RUN chmod +x /app/apps/api/docker-entrypoint.sh

EXPOSE 3001
ENTRYPOINT ["/app/apps/api/docker-entrypoint.sh"]
