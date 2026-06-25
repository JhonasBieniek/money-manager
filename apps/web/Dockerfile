# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.6.5 --activate
WORKDIR /app

FROM base AS build
ARG VITE_API_URL=http://localhost:3001
ENV VITE_API_URL=$VITE_API_URL \
    TURBO_TELEMETRY_DISABLED=1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json eslint.config.mjs ./
COPY apps/web/package.json ./apps/web/
RUN --mount=type=cache,id=money-manager-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store

COPY apps/web ./apps/web
RUN --mount=type=cache,id=money-manager-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store

RUN --mount=type=cache,id=money-manager-pnpm,target=/pnpm/store \
    pnpm --filter @money-manager/web run build

FROM nginx:alpine AS runner
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
