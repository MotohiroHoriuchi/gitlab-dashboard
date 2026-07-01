# NOTE: no `# syntax=` frontend directive on purpose — this Dockerfile uses only
# built-in syntax (multi-stage + COPY --from), so pinning docker/dockerfile:1
# would force BuildKit to pull that frontend from docker.io (fails behind DNS/
# registry restrictions, e.g. colima: "resolve docker.io/docker/dockerfile:1 … no such host").

# 1) install deps
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# 2) build (next/font is fetched + self-hosted at this step; needs network)
FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# 3) minimal runtime — standalone server + static assets only
FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=48273 \
    HOSTNAME=0.0.0.0
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# fetch-cache dir must be writable by the non-root runtime user
RUN mkdir -p .next/cache && chown -R node:node .next
EXPOSE 48273
USER node
CMD ["node", "server.js"]
