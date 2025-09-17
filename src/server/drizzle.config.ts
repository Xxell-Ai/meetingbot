import { type Config } from "drizzle-kit";

import { env } from "~/env";

export default {
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: env.DATABASE_URL,
    ssl: env.NODE_ENV === "production" ? "require" : undefined,
  },
  tablesFilter: ["server_*"],
  strict: true,
} satisfies Config;
