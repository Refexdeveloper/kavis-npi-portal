# Single Cloud Run service: Vite SPA (client/out) + Express API
# Attach Cloud SQL + set STORAGE_BACKEND=gcs / GCS_BUCKET (see GCP_HOSTING.md)
# Build context: repository root

FROM node:22-bookworm-slim AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:22-bookworm-slim AS server-deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
ENV STORAGE_BACKEND=gcs

COPY --from=server-deps /app/server/node_modules ./server/node_modules
COPY server/package.json server/package-lock.json ./server/
COPY server/src ./server/src
COPY server/tsconfig.json ./server/
COPY --from=client-build /app/client/out ./client/out

WORKDIR /app/server
EXPOSE 8080
CMD ["npm", "start"]
