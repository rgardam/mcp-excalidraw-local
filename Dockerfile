# Dockerfile for MCP Excalidraw Server
# Builds the MCP server with SQLite persistence

# Stage 1: Build backend (TypeScript compilation + native modules)
FROM node:20-slim AS builder

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
# Install all dependencies and build native modules (including better-sqlite3)
RUN --mount=type=cache,target=/root/.npm npm ci

COPY src ./src
COPY tsconfig.json ./
RUN npm run build:server

# Stage 2: Production MCP Server
FROM node:20-slim AS production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --gid 1001 nodejs

WORKDIR /app

COPY package*.json ./
# Install production dependencies without scripts first
RUN npm ci --omit=dev --ignore-scripts

# Copy compiled TypeScript and built native modules from builder
COPY --from=builder /app/dist ./dist
# Copy only the native modules that were compiled with proper build tools
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3

RUN mkdir -p /app/data && chown -R nodejs:nodejs /app
USER nodejs

ENV NODE_ENV=production
ENV EXPRESS_SERVER_URL=http://canvas:3000
ENV ENABLE_CANVAS_SYNC=true
ENV EXCALIDRAW_DB_PATH=/app/data/excalidraw.db

CMD ["node", "dist/index.js"]

LABEL org.opencontainers.image.source="https://github.com/sanjibdevnathlabs/mcp-excalidraw-local"
LABEL org.opencontainers.image.description="MCP Excalidraw Server - Model Context Protocol for AI agents (with SQLite persistence & multi-tenancy)"
LABEL org.opencontainers.image.licenses="MIT"
