# ── Stage 1: build React client ──────────────────────────────────────────────
FROM node:22-alpine AS client-build

WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# ── Stage 2: production server ────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

# Server deps
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev

# Server source
COPY server/ ./server/

# React build → server/dist so index.js can serve it
COPY --from=client-build /app/client/dist ./server/dist

EXPOSE 3001

ENV NODE_ENV=production

CMD ["node", "server/index.js"]
