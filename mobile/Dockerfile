# ============================================
# Stage 1: Install dependencies
# ============================================
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ============================================
# Stage: DEV — Expo dev server (hot reload)
# ============================================
# Usage: docker compose up mobile
# Source code is volume-mounted from host, NOT copied.
FROM deps AS dev
WORKDIR /app
EXPOSE 8081
CMD ["npx", "expo", "start", "--web", "--port", "8081", "--host", "0.0.0.0"]

# ============================================
# Stage: BUILD — Expo web export (static)
# ============================================
FROM deps AS build
WORKDIR /app
COPY . .
ARG EXPO_PUBLIC_API_URL
ENV EXPO_PUBLIC_API_URL=${EXPO_PUBLIC_API_URL}
RUN npx expo export --platform web

# ============================================
# Stage: RUNTIME — Nginx serving static files
# ============================================
FROM nginx:1.27-alpine AS runtime

LABEL org.opencontainers.image.description="MicroFlex Mobile — Web build"

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Custom nginx config for SPA routing
RUN printf 'server {\n\
    listen 80;\n\
    server_name _;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
\n\
    # SPA fallback\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
\n\
    # Cache static assets\n\
    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {\n\
        expires 1y;\n\
        add_header Cache-Control "public, immutable";\n\
    }\n\
\n\
    # Gzip\n\
    gzip on;\n\
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;\n\
    gzip_min_length 256;\n\
}\n' > /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1
