# ============================================
# Stage 1: Install dependencies
# ============================================
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install

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
CMD ["npx", "tsx", "watch", "--clear-screen=false", "server/index.ts"]

# ============================================
# Stage 2: Build application
# ============================================
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ============================================
# Stage 3: Production runtime
# ============================================
FROM node:20-alpine AS runtime

# OCI labels
LABEL org.opencontainers.image.source="https://github.com/owner/cofinco"
LABEL org.opencontainers.image.description="Cofinco Platform"
LABEL org.opencontainers.image.licenses="MIT"

# Create non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

# Install wget for healthcheck (curl not in alpine by default)
RUN apk add --no-cache wget tini

WORKDIR /app

ENV NODE_ENV=production

# Install production dependencies only
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

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
