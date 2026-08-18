# syntax=docker/dockerfile:1

# ── Build stage ──────────────────────────────────────────────────────────
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo

# Manifests first so a source-only change reuses the dependency layer.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/design-tokens/package.json packages/design-tokens/
COPY apps/api/package.json apps/api/

# Frozen: the lockfile is committed precisely so a deployed build resolves the
# same tree as a local one. `--frozen-lockfile=false` would silently drift.
#
# `node-linker=isolated` overrides the repo's `.npmrc`, which sets `hoisted` for
# Metro's benefit. Hoisted linking flattens the *entire* lockfile into one
# node_modules and ignores `--filter`, which dragged Next.js, React Native, Expo
# and the Android toolchain into this image — ~600MB the API never loads.
# Isolated linking honours the filter, and nothing server-side needs hoisting.
RUN pnpm install --frozen-lockfile --config.node-linker=isolated --filter @haala/api...

COPY packages/ packages/
COPY apps/api/ apps/api/
COPY tsconfig.base.json ./

RUN pnpm --filter @haala/shared build \
 && pnpm --filter @haala/api build

# Drop dev dependencies now that compilation is done — tsc, drizzle-kit and the
# type packages have no business in a runtime image. `pnpm prune` doesn't accept
# a filter in a workspace, so this reinstalls prod-only instead, which achieves
# the same thing. It runs after the builds, so `dist/` survives.
RUN pnpm install --frozen-lockfile --prod --config.node-linker=isolated --filter @haala/api...

# ── Runtime stage ────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
RUN corepack enable
WORKDIR /repo

ENV NODE_ENV=production

# Run as a non-root user. The base image ships `node` (uid 1000) for this.
# Isolated linking symlinks from each package's node_modules into the virtual
# store, so both the root tree and the per-package trees have to come across
# together or the links dangle.
COPY --from=build --chown=node:node /repo/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/package.json /repo/pnpm-workspace.yaml /repo/pnpm-lock.yaml ./
COPY --from=build --chown=node:node /repo/packages ./packages
COPY --from=build --chown=node:node /repo/apps/api ./apps/api

USER node

# Railway injects PORT; this is only the default and documents the contract.
ENV PORT=4000
EXPOSE 4000

# Migrations run as a separate deploy step (railway.json preDeployCommand),
# not here — a container that migrates on boot races itself when scaled to more
# than one instance.
CMD ["node", "apps/api/dist/index.js"]
