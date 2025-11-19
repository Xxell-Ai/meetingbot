##### DEPENDENCIES

FROM --platform=linux/amd64 node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# Install pnpm globally first (separate layer for better caching)
RUN npm install -g pnpm@9.12.3

# Copy only dependency files (separate layer to maximize cache hits)
COPY package.json pnpm-lock.yaml ./

# Install dependencies with frozen lockfile
RUN pnpm i --frozen-lockfile

##### BUILDER

FROM --platform=linux/amd64 node:20-alpine AS builder
# Build-time arguments (optional for build, required at runtime)
ARG AUTH_SECRET
ARG AUTH_GITHUB_ID
ARG AUTH_GITHUB_SECRET
ARG DATABASE_URL
ARG GITHUB_TOKEN
ARG AWS_ACCESS_KEY_ID
ARG AWS_SECRET_ACCESS_KEY
# DigitalOcean Spaces configuration
ARG DO_SPACES_BUCKET
ARG DO_SPACES_REGION
ARG DO_SPACES_ENDPOINT
# Kubernetes configuration
ARG DEPLOYMENT_PLATFORM
ARG KUBE_NAMESPACE
ARG DOMAIN_NAME

WORKDIR /app

# Install pnpm in builder stage
RUN npm install -g pnpm@9.12.3

# Copy package files first
COPY package.json pnpm-lock.yaml ./

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY . .

# Disable Next.js telemetry for faster builds
ENV NEXT_TELEMETRY_DISABLED=1

# Build with pnpm (simplified since we know it's pnpm-based)
RUN SKIP_ENV_VALIDATION=1 pnpm run build

##### RUNNER

FROM --platform=linux/amd64 node:20-alpine AS runner
WORKDIR /app

# NODE_ENV will be set via environment variables in deployment

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy application files first
COPY --from=builder /app/next.config.js ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

# Copy drizzle migration files for database operations
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/migrate.ts ./migrate.ts
COPY --from=builder /app/src/env.js ./src/env.js
COPY --from=builder /app/start.sh ./start.sh

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy the full node_modules from deps stage to ensure migration dependencies are available
# This solves the Next.js standalone build issue that excludes unused dependencies
COPY --from=deps /app/node_modules ./node_modules

# Make startup script executable
RUN chmod +x start.sh

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check for Kubernetes
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

CMD ["./start.sh"]