# Build stage
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=optional
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Runtime stage — Debian slim (glibc) so the host's bws binary (gnu build)
# can be bind-mounted read-only for `bws run --` secret injection.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
# ffmpeg for placeholder rendering + Phase 4 assembly (concat, 9:16, VO mix);
# ca-certificates required by the baked-in bws CLI (TLS verification)
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# bws CLI baked in (from .build-assets, gitignored) for `bws run` secret injection
COPY .build-assets/bws /usr/local/bin/bws
RUN chmod +x /usr/local/bin/bws
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --omit=optional
COPY --from=build /app/dist ./dist
COPY fonts ./fonts
EXPOSE 8080
CMD ["node", "dist/index.js"]
