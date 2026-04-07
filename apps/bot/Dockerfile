# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.6.5 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/bot/package.json ./apps/bot/
RUN pnpm install --frozen-lockfile

COPY apps/bot ./apps/bot
RUN pnpm install --frozen-lockfile

RUN pnpm exec turbo run build --filter=@money-manager/bot

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/bot ./apps/bot

EXPOSE 3002
CMD ["node", "apps/bot/dist/bot.js"]
