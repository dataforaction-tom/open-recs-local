# syntax=docker/dockerfile:1.7

# ---- base -----------------------------------------------------------------
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN corepack enable \
 && corepack prepare pnpm@10.29.3 --activate
ENV NEXT_TELEMETRY_DISABLED=1

# ---- deps (full install for build) ---------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ---- build ----------------------------------------------------------------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# ---- prod deps (runtime-only node_modules) -------------------------------
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

# ---- app-runtime ----------------------------------------------------------
FROM base AS app-runtime
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
EXPOSE 3000
CMD ["pnpm", "start"]

# ---- worker-runtime -------------------------------------------------------
# Placeholder until Phase 2 implements src/worker.ts + a "worker" script.
# Keeps the image target real so compose can resolve it today.
FROM base AS worker-runtime
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
CMD ["node", "-e", "console.log('worker stub — implemented in Phase 2'); setInterval(() => {}, 60000);"]
