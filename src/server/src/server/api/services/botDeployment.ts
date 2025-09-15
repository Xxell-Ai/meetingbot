import { type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "~/server/db/schema";

export class BotDeploymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BotDeploymentError";
  }
}

/**
 * Deploy a bot using Kubernetes (production) or local process (development)
 * This is the main entry point for bot deployment
 */
export async function deployBot({
  botId,
  db,
}: {
  botId: number;
  db: PostgresJsDatabase<typeof schema>;
}) {
  // Always use Kubernetes deployment for production
  // Development mode is handled within the Kubernetes deployment service
  const { deployBotKubernetes } = await import("./botDeploymentK8s");
  return await deployBotKubernetes({ botId, db });
}

export async function shouldDeployImmediately(
  startTime: Date | undefined | null,
): Promise<boolean> {
  if (!startTime) {
    return true; // Deploy immediately if no start time is specified
  }

  const now = new Date();
  const timeDifference = startTime.getTime() - now.getTime();
  const fiveMinutesInMs = 5 * 60 * 1000;

  // Deploy if start time is within 5 minutes or has already passed
  return timeDifference <= fiveMinutesInMs;
}