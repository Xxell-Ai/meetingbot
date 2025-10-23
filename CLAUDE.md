# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MeetingBot is an open-source meeting bot API that sends bots to video meetings (Google Meet, Microsoft Teams, Zoom) to record them. It's designed for self-hosting on AWS/DigitalOcean to keep data private and costs low.

**Tech Stack**: Next.js 15, tRPC, Drizzle ORM, PostgreSQL, Playwright/Puppeteer, Kubernetes, Terraform, pnpm workspaces

## Monorepo Structure

```
src/
├── server/          # Next.js API + Dashboard (tRPC, NextAuth, Drizzle ORM)
├── bots/            # Meeting bot implementations
│   ├── meet/        # Google Meet bot (Playwright)
│   ├── teams/       # Microsoft Teams bot (Puppeteer)
│   ├── zoom/        # Zoom bot (Puppeteer)
│   └── src/         # Shared bot infrastructure
├── landing-page/    # Marketing website
├── example-app/     # Example client application
└── terraform/       # Infrastructure as Code (AWS)
```

## Common Development Commands

### Root Level
```bash
pnpm install                    # Install all workspace dependencies
pnpm typecheck                  # Type check all workspaces
```

### Server (src/server)
```bash
cd src/server
pnpm dev                        # Start Next.js dev server with Turbo
pnpm build                      # Production build
pnpm start                      # Start production server
pnpm check                      # Lint + type check
pnpm lint                       # Run ESLint
pnpm lint:fix                   # Fix ESLint issues
pnpm typecheck                  # Type check only
pnpm test                       # Run Jest tests
pnpm test:e2e                   # Run Playwright E2E tests

# Database commands (Drizzle ORM)
pnpm db:generate                # Generate migrations from schema
pnpm db:migrate                 # Run migrations (uses migrate.ts)
pnpm db:push                    # Push schema directly (dev only)
pnpm db:studio                  # Open Drizzle Studio GUI

# Code formatting
pnpm format:check               # Check Prettier formatting
pnpm format:write               # Apply Prettier formatting
```

### Bots (src/bots)
```bash
cd src/bots
pnpm dev                        # Run bot locally (requires BOT_DATA env var)
pnpm test                       # Run Jest tests for all bots
```

### Local Development Scripts
```bash
./scripts/build-local-images.sh    # Build Docker images for server and bots
./scripts/setup-local-env.sh       # Set up local Kubernetes environment
./scripts/deploy-local.sh          # Deploy to local Kubernetes
./scripts/deploy-k8s.sh            # Deploy to production Kubernetes
```

## Architecture Overview

### Server Architecture

**Backend**: Next.js API routes with tRPC providing type-safe APIs. Uses NextAuth for GitHub OAuth and API key authentication.

**Database**: PostgreSQL with Drizzle ORM. Core tables:
- `bots` - Bot instances with status, meeting info, recordings
- `events` - Event log for bot lifecycle and participant tracking
- `users`, `accounts`, `sessions` - NextAuth authentication
- `apiKeys` - API key management with expiration
- `apiRequestLogs` - Audit trail for API usage

**tRPC Routers** (src/server/src/server/api/routers/):
- `bots.ts` - Create, deploy, manage bots; receive heartbeats and events
- `events.ts` - Query bot event history
- `apiKeys.ts` - API key CRUD and usage logs
- `usage.ts` - Usage analytics

**Storage**: DigitalOcean Spaces (S3-compatible) for recordings via AWS SDK

**Bot Deployment**: Kubernetes Job orchestration via `@kubernetes/client-node`

### Bot Architecture

**Base Bot Interface** (src/bots/src/bot.ts):
- All platform bots implement `BotInterface` with `run()`, `joinMeeting()`, `endLife()`
- Factory pattern in `createBot()` dynamically imports platform-specific implementation
- Shared monitoring infrastructure for heartbeats and event reporting

**Platform Implementations**:
- **Google Meet** (meet/): Playwright-based, records via MediaRecorder API + FFmpeg to AAC
- **Microsoft Teams** (teams/): Puppeteer-based with puppeteer-stream, WebM format
- **Zoom** (zoom/): Puppeteer-based with puppeteer-stream

**Bot Lifecycle**:
1. Server creates Kubernetes Job with `BOT_DATA` env var (JSON-serialized config)
2. Bot container starts (`src/bots/src/index.ts`)
3. Reports events via tRPC: JOINING_CALL → IN_WAITING_ROOM → IN_CALL → CALL_ENDED
4. Sends periodic heartbeats to server
5. Uploads recording to DigitalOcean Spaces
6. Reports DONE event with recording key and speaker timeframes

**Timeout Configurations**:
- Waiting room timeout (default 5 min)
- No one joined timeout (default 5 min)
- Everyone left timeout (default 5 min)
- Inactivity timeout (default 5 min)

### Authentication

**Dual Authentication Strategy**:
1. **Session-based** (Dashboard UI): GitHub OAuth via NextAuth
2. **API Key-based** (External clients): `x-api-key` header validated against `apiKeys` table

Both use `protectedProcedure` in tRPC which checks for either session or valid API key.

### Database Schema Patterns

**Status Flow for Bots**:
```
READY_TO_DEPLOY → DEPLOYING → JOINING_CALL → IN_WAITING_ROOM → IN_CALL → CALL_ENDED → DONE | FATAL
```

**Event Types**: All status codes above + `PARTICIPANT_JOIN`, `PARTICIPANT_LEAVE`, `LOG`

**Schema Definition**: `src/server/src/server/db/schema.ts` uses Drizzle ORM with Zod validation via `drizzle-zod`

### Docker & Deployment

**Docker Images**:
- `meetingbot-server:TAG` - Next.js server
- `meetingbot-meet-bot:TAG` - Google Meet bot (Playwright base)
- `meetingbot-teams-bot:TAG` - Teams bot (Puppeteer base)
- `meetingbot-zoom-bot:TAG` - Zoom bot (Puppeteer base)

**CI/CD** (.github/workflows/docker.yml):
1. Builds server + bot images on push to `xxell-main` or `feature/**` branches
2. Tags with `prod-{sha}` or `dev-{sha}` based on branch
3. Pushes to DigitalOcean Container Registry
4. Updates Helm repository with new image tags for GitOps deployment

**Bot Deployment Service** (src/server/src/server/api/services/botDeploymentK8s.ts):
- Creates Kubernetes Jobs dynamically based on meeting platform
- Injects `BOT_DATA` env var with bot configuration
- Uses image tag from `BOT_IMAGE_TAG` env var

## Environment Variables

### Server (.env in src/server)
```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# Auth (NextAuth)
AUTH_SECRET=secret
AUTH_GITHUB_ID=oauth-client-id
AUTH_GITHUB_SECRET=oauth-client-secret
ALLOWED_GITHUB_USERS=user1,user2  # Optional whitelist

# Storage (DigitalOcean Spaces)
AWS_ACCESS_KEY_ID=do-spaces-key
AWS_SECRET_ACCESS_KEY=do-spaces-secret
DO_SPACES_BUCKET=bucket-name
DO_SPACES_REGION=sgp1
DO_SPACES_ENDPOINT=https://sgp1.digitaloceanspaces.com

# Deployment
NODE_ENV=development|production
DEPLOYMENT_PLATFORM=KUBERNETES
KUBE_NAMESPACE=default
BOT_IMAGE_TAG=prod-abc1234
DOMAIN_NAME=api.example.com
DOCKER_REGISTRY_OWNER=xxell-ai

# External System Integration (Optional)
USE_EXTERNAL_SYSTEM_UPLOAD=true|false
EXTERNAL_SYSTEM_BASE_URL=https://api.example.com
EXTERNAL_SYSTEM_API_KEY=key
```

### Bots (Injected by Kubernetes)
```bash
BOT_DATA={"id":1,"userId":"...","meetingInfo":{...},...}  # JSON config
DOCKER_MEETING_PLATFORM=meet|teams|zoom
NODE_ENV=development|production

# Storage (same as server)
DO_SPACES_BUCKET=...
DO_SPACES_REGION=...
DO_SPACES_ENDPOINT=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...

# Server communication
TRPC_URL=http://server-api/trpc
```

## Key Implementation Patterns

### Adding New tRPC Endpoints

1. Define schema in `src/server/src/server/api/routers/{router}.ts`
2. Use `protectedProcedure` for authenticated endpoints
3. Input validation via `.input(z.object({ ... }))`
4. Database queries via `ctx.db` (Drizzle instance)
5. Export router and register in `src/server/src/server/api/root.ts`

### Database Migrations

1. Update schema in `src/server/src/server/db/schema.ts`
2. Run `pnpm db:generate` to create migration file
3. Run `pnpm db:migrate` to apply migration
4. For development, use `pnpm db:push` to skip migrations

### Bot Event Reporting

All bots use `reportEvent()` from `src/bots/src/monitoring.ts`:
```typescript
await reportEvent(bot, EventCode.PARTICIPANT_JOIN, {
  participantId: "123",
  participantName: "John Doe"
});
```

Server automatically:
- Stores event in `events` table
- Updates bot status if event is a status code
- Calls `callbackUrl` webhook if configured

### Recording Upload Flow

1. Bot finishes recording, calls `uploadRecordingToS3()` in `src/bots/src/index.ts`
2. Primary: Upload to DigitalOcean Spaces
3. Fallback: Upload to external system if configured
4. Returns S3 key (object ID)
5. Reports DONE event with recording key
6. Server stores key in `bots.recording` field
7. Clients can fetch signed URL via `generateSignedUrl()` utility

## Testing

**Server Tests**: `pnpm test` in src/server runs Jest unit tests

**Bot Tests**: `pnpm test` in src/bots runs Jest tests for bot logic (mocks Puppeteer/Playwright)

**E2E Tests**: `pnpm test:e2e` in src/server runs Playwright browser tests

**Test Files Location**:
- Server: `src/server/__tests__/` or `*.test.ts` colocated
- Bots: `src/bots/tests/` for platform-specific tests

## Important Implementation Notes

### Platform-Specific Bot Selection

The factory pattern in `createBot()` validates that the platform in `meetingInfo.platform` matches the Docker image name set in `DOCKER_MEETING_PLATFORM` env var. This prevents accidental mismatches in Kubernetes deployments.

### Recording Format

Recent changes migrated from MP3 to AAC format for better audio quality and compression. Google Meet bot uses FFmpeg transcoding to AAC after browser MediaRecorder capture.

### Heartbeat Monitoring

Bots send heartbeats every `heartbeatInterval` milliseconds (default 5000ms). Server doesn't automatically detect timeouts - frontend polls bot status and checks `lastHeartbeat` timestamp.

### Kubernetes vs ECS

Primary deployment target is Kubernetes. ECS support exists in Terraform but bot deployment service (`botDeploymentK8s.ts`) only supports Kubernetes Jobs.

### External System Integration

Setting `USE_EXTERNAL_SYSTEM_UPLOAD=true` enables uploading recordings to an external API instead of DigitalOcean Spaces. Fallback to Spaces occurs if external upload fails.

## Common Workflows

### Creating a New Bot Platform

1. Create new directory: `src/bots/{platform}/`
2. Implement `BotInterface` in `src/bots/{platform}/src/bot.ts`
3. Create `Dockerfile` in `src/bots/{platform}/Dockerfile`
4. Update factory in `src/bots/src/bot.ts` to import new platform
5. Add to CI/CD matrix in `.github/workflows/docker.yml`
6. Update Terraform/Kubernetes manifests for new image

### Adding New Event Types

1. Add to `EventCode` enum in shared types
2. Update `reportEvent()` calls in bot implementations
3. Update event handlers in server if needed
4. Update database schema if new `data` fields needed

### Local Development Setup

1. Install dependencies: `pnpm install`
2. Set up PostgreSQL database
3. Copy `.env.example` to `.env` in `src/server` and configure
4. Run migrations: `cd src/server && pnpm db:migrate`
5. Start server: `pnpm dev`
6. Build local Docker images: `./scripts/build-local-images.sh`
7. Set up local Kubernetes: `./scripts/setup-local-env.sh`

## Repository Conventions

- **Package Manager**: pnpm with workspaces
- **TypeScript**: Strict mode enabled, ESM modules
- **Code Style**: Prettier with Tailwind plugin
- **Commit Convention**: Uses GitHub Actions for CI, commits to `xxell-main` deploy to prod
- **Branching**: `xxell-main` for production, `feature/**` for development
