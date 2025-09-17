import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

async function runMigration() {
  console.log('🚀 Migration started...');

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('❌ DATABASE_URL environment variable is not set');
  }

  // Create a connection specifically for migrations with max 1 connection
  const client = postgres(dbUrl, {
    max: 1,
    ssl: process.env.NODE_ENV === 'production' ? 'require' : dbUrl.includes('sslmode=disable') ? false : {
      rejectUnauthorized: false,
    },
  });

  const db = drizzle(client);

  try {
    console.log('📦 Running migrations...');
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    console.log('🔌 Closing database connection...');
    await client.end();
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled promise rejection in migration:', error);
  process.exit(1);
});

// Run the migration
runMigration().catch((error) => {
  console.error('❌ Error in migration process:', error);
  process.exit(1);
});

