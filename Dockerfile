# ============================================
# Stage 1: Install dependencies
# ============================================
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN npm ci

# ============================================
# Stage: DEV — hot reload (tsx watch + Vite HMR)
# ============================================
# Usage: docker compose up (auto-loads override)
# Source code is volume-mounted from host, NOT copied.
FROM deps AS dev
RUN apk add --no-cache tini
WORKDIR /app
EXPOSE 5000 5173
ENTRYPOINT ["tini", "--"]
CMD ["npx", "tsx", "watch", "--clear-screen=false", "apps/api/index.ts"]

# ============================================
# Stage: INIT — one-shot DB schema push + seed
# ============================================
# Usage: docker compose service "db-init" (runs once then exits)
# Needs full source (schema, drizzle config, seed) + all deps (drizzle-kit, tsx)
FROM deps AS init
RUN apk add --no-cache unzip
WORKDIR /app
COPY . .
ENTRYPOINT ["sh", "-c"]
CMD ["sh scripts/download-geonames.sh && npm run db:migrate && node --import tsx scripts/ensure-sql.ts && node --import tsx seeds/seed-prod.ts"]

# ============================================
# Stage: TEST — unit + integration tests
# ============================================
# Usage: docker compose run --rm test-unit
FROM deps AS test
WORKDIR /app
COPY . .
ENTRYPOINT ["npx"]
CMD ["vitest", "run"]

# ============================================
# Stage: TEST-E2E — Playwright browser tests
# ============================================
# Usage: docker compose run --rm test-e2e
# Uses Debian (not Alpine) because Playwright browsers need glibc
FROM node:24-bookworm-slim AS test-e2e
WORKDIR /app
COPY package.json ./
RUN npm install && npx playwright install --with-deps chromium
COPY . .
ENTRYPOINT ["npx"]
CMD ["playwright", "test"]

# ============================================
# Stage 2: Build application
# ============================================
FROM node:24-alpine AS build
WORKDIR /app
ARG TENANT_CONFIG_FILE=config/tenants/microflex.json
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
RUN test -f "$TENANT_CONFIG_FILE" && cp "$TENANT_CONFIG_FILE" dist/tenant-config.json

# ============================================
# Stage 3: Production runtime
# ============================================
FROM node:24-alpine AS runtime

# OCI labels
LABEL org.opencontainers.image.source="https://github.com/owner/microflex"
LABEL org.opencontainers.image.description="MicroFlex Platform"
LABEL org.opencontainers.image.licenses="MIT"

# Create non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

# Install wget for healthcheck (curl not in alpine by default)
RUN apk add --no-cache wget tini

WORKDIR /app

ENV NODE_ENV=production
ENV TENANT_CONFIG_PATH=dist/tenant-config.json

# Install production dependencies only
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN npm ci --omit=dev && npm cache clean --force

# Copy build artifacts
COPY --from=build /app/dist ./dist

# Set ownership
RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 5000

# Healthcheck for Docker and orchestrators
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health || exit 1

# Use tini as PID 1 for proper signal handling
ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/index.cjs"]
