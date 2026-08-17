# ── Build stage ──
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo

# Install workspace deps (leverages layer caching on lockfile changes).
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY packages/design-tokens/package.json packages/design-tokens/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile=false

# Build shared packages + api.
COPY . .
RUN pnpm --filter @haala/shared build \
 && pnpm --filter @haala/api build

# ── Runtime stage ──
FROM node:22-alpine AS runtime
RUN corepack enable
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo ./
EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]
