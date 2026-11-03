# Content Engine — all-in-one image (Next.js standalone + JSON store).
# Works on Railway / Render / Fly / any Docker host.
#
#   docker build -t content-engine .
#   docker run -p 3000:3000 -v content-data:/app/data content-engine
#
# Env:
#   DATA_DIR     where posts.json + engagements.json live (mount a volume!)
#   OLLAMA_URL   optional — point at an Ollama host for AI generation
#   OLLAMA_MODEL optional — default qwen3.5:4b

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/app/data
RUN addgroup -S app && adduser -S app -G app \
    && mkdir -p /app/data && chown app:app /app/data
COPY --from=build /app/public ./public
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
USER app
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "server.js"]
