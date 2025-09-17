# Database Migration Guide

This project uses a standardized Drizzle ORM migration approach that works consistently across both development and production environments.

## Overview

We use the `migrate()` function from `drizzle-orm` to ensure reliable and consistent database migrations across all environments. This approach is based on the best practices outlined in the [Drizzle migrations blog post](https://budivoogt.com/blog/drizzle-migrations).

## Key Files

- `drizzle.config.ts` - Drizzle configuration with SSL settings for production
- `migrate.ts` - Standardized migration script using the `migrate()` function
- `start.sh` - Startup script that runs migrations before starting the server (production)

## Development Workflow

### 1. Making Schema Changes

Edit your schema in `src/server/db/schema.ts`:

```typescript
// Example: Add a new column
export const users = pgTable("user", {
  id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  // Add new column
  createdAt: timestamp("createdAt").defaultNow(),
});
```

### 2. Generate Migration

```bash
pnpm db:generate
```

This creates a new migration file in the `./drizzle` directory.

### 3. Run Migration

For development:
```bash
pnpm db:migrate
```

This uses our standardized `migrate.ts` script which:
- ✅ Works in both dev and prod
- ✅ Handles SSL configuration automatically
- ✅ Provides clear logging
- ✅ Handles errors gracefully

## Production Deployment

### Automatic Migrations

In production, migrations run automatically when the container starts:

1. Container starts
2. `start.sh` script executes
3. Migrations run via `npx tsx migrate.ts`
4. Next.js server starts

### Manual Migration (if needed)

If you need to run migrations manually in production:

```bash
npx tsx migrate.ts
```

## Environment Configuration

### SSL Configuration

The system automatically handles SSL configuration:

- **Development**: SSL disabled (unless `sslmode=disable` is in DATABASE_URL)
- **Production**: SSL required (`ssl: "require"`)

### Environment Variables

Required environment variables:

```env
DATABASE_URL=postgresql://user:password@host:port/database
NODE_ENV=production # (for production)
```

## Migration Script Features

The `migrate.ts` script provides:

- **Automatic SSL handling** based on environment
- **Connection management** with proper cleanup
- **Error handling** with clear error messages
- **Logging** with emoji indicators for better visibility
- **Process exit codes** for container orchestration

## Package Scripts

- `pnpm db:generate` - Generate new migrations from schema changes (uses drizzle-kit - dev only)
- `pnpm db:migrate` - Run migrations using our standardized approach (uses drizzle-orm - production safe)
- `pnpm db:migrate:kit` - Run migrations using drizzle-kit (development only)
- `pnpm db:push` - Push schema changes directly (development only)
- `pnpm db:studio` - Open Drizzle Studio (development only)

## Best Practices

1. **Development Workflow**:
   - Use `drizzle-kit` (devDependency) to generate migrations: `pnpm db:generate`
   - Test with `pnpm db:migrate` (uses production-safe drizzle-orm)
   - Never use `db:push` in production

2. **Production Deployment**:
   - Only `drizzle-orm` and `postgres` are needed (already in dependencies)
   - Uses `migrate()` function from `drizzle-orm` - no drizzle-kit required
   - Automatic migration tracking via `__drizzle_migrations` table

3. **Migration Safety**:
   - Always review generated migration files before committing
   - Test migrations locally before deploying
   - Monitor migration logs during deployment

## Troubleshooting

### Common Issues

1. **SSL Connection Error**
   - Ensure `DATABASE_URL` includes SSL configuration for production
   - Check if your database requires SSL

2. **Migration Timeout**
   - Increase connection timeout in `migrate.ts` if needed
   - Check database connectivity

3. **Permission Errors**
   - Ensure database user has migration permissions
   - Check table ownership and privileges

### Debugging

Enable verbose logging by modifying `migrate.ts`:

```typescript
const client = postgres(dbUrl, {
  max: 1,
  ssl: /* SSL config */,
  debug: true, // Add this for verbose logging
});
```

## Migration vs Push

| Command | Use Case | Environment |
|---------|----------|-------------|
| `db:migrate` | Production deployments, schema versioning | All |
| `db:push` | Quick prototyping, development iterations | Development only |

Always use `db:migrate` for production deployments to ensure proper schema versioning and rollback capabilities.
