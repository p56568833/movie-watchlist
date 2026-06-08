# ── Build Stage ──────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Runtime Stage ────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

# Create data directory for SQLite volume
RUN mkdir -p /data

COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY server.js db.js ./
COPY public ./public

ENV DB_PATH=/data/movies.db
ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

USER node

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
