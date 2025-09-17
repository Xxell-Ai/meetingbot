#!/bin/sh
set -e

echo "🚀 Starting application..."

# Run database migrations
echo "📦 Running database migrations..."
npx tsx migrate.ts

# Start the Next.js server
echo "🌐 Starting Next.js server..."
exec node server.js

