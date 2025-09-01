import { type BotConfig, bots } from "~/server/db/schema";
import { eq } from "drizzle-orm";
import { type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "~/server/db/schema";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { env } from "~/env";
import * as k8s from "@kubernetes/client-node";

// Get the directory path using import.meta.url
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Kubernetes client
const kc = new k8s.KubeConfig();

// Load configuration based on environment
if (env.NODE_ENV === "development") {
  // In development, try to load from default kubeconfig
  try {
    kc.loadFromDefault();
  } catch (error) {
    console.warn("Could not load kubeconfig in development:", error);
  }
} else {
  // In production, load from in-cluster config
  kc.loadFromCluster();
}

const k8sApi = kc.makeApiClient(k8s.BatchV1Api);
const k8sCoreApi = kc.makeApiClient(k8s.CoreV1Api);

/**
 * Selects the appropriate bot Docker image based on meeting information
 * @param meetingInfo - Information about the meeting, including platform
 * @returns The Docker image to use for deployment
 */
export function selectBotImage(meetingInfo: schema.MeetingInfo): string {
  const platform = meetingInfo.platform;
  const commitSha = env.CURRENT_COMMIT_SHA?.substring(0, 7) || "latest";

  switch (platform?.toLowerCase()) {
    case "google":
      return `ghcr.io/meetingbot/bots/meet:sha-${commitSha}`;
    case "teams":
      return `ghcr.io/meetingbot/bots/teams:sha-${commitSha}`;
    case "zoom":
      return `ghcr.io/meetingbot/bots/zoom:sha-${commitSha}`;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

export class BotDeploymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BotDeploymentError";
  }
}

export async function deployBotKubernetes({
  botId,
  db,
}: {
  botId: number;
  db: PostgresJsDatabase<typeof schema>;
}) {
  const botResult = await db.select().from(bots).where(eq(bots.id, botId));
  if (!botResult[0]) {
    throw new Error("Bot not found");
  }
  const bot = botResult[0];
  const dev = env.NODE_ENV === "development";

  // First, update bot status to deploying
  await db.update(bots).set({ status: "DEPLOYING" }).where(eq(bots.id, botId));

  try {
    const config: BotConfig = {
      id: botId,
      userId: bot.userId,
      meetingTitle: bot.meetingTitle,
      meetingInfo: bot.meetingInfo,
      startTime: bot.startTime,
      endTime: bot.endTime,
      botDisplayName: bot.botDisplayName,
      botImage: bot.botImage ?? undefined,
      heartbeatInterval: bot.heartbeatInterval,
      automaticLeave: bot.automaticLeave,
      callbackUrl: bot.callbackUrl ?? undefined,
    };

    if (dev) {
      // Get the absolute path to the bots directory
      const botsDir = path.resolve(__dirname, "../../../../../bots");

      // Spawn the bot process locally
      const botProcess = spawn("pnpm", ["start"], {
        cwd: botsDir,
        env: {
          ...process.env,
          BOT_DATA: JSON.stringify(config),
        },
      });

      // Log output for debugging
      botProcess.stdout.on("data", (data) => {
        console.log(`Bot ${botId} stdout: ${data}`);
      });
      botProcess.stderr.on("data", (data) => {
        console.error(`Bot ${botId} stderr: ${data}`);
      });
      botProcess.on("error", (error) => {
        console.error(`Bot ${botId} process error:`, error);
      });
    } else {
      // Deploy to Kubernetes
      const namespace = env.KUBE_NAMESPACE || "default";
      const jobName = `meetingbot-${botId}-${Date.now()}`;

      const job: k8s.V1Job = {
        apiVersion: "batch/v1",
        kind: "Job",
        metadata: {
          name: jobName,
          namespace: namespace,
          labels: {
            app: "meetingbot",
            "bot-id": botId.toString(),
            platform: bot.meetingInfo.platform || "unknown",
          },
        },
        spec: {
          template: {
            metadata: {
              labels: {
                app: "meetingbot-bot",
                "bot-id": botId.toString(),
              },
            },
            spec: {
              restartPolicy: "Never",
              containers: [
                {
                  name: "bot",
                  image: selectBotImage(bot.meetingInfo),
                  env: [
                    {
                      name: "BOT_DATA",
                      value: JSON.stringify(config),
                    },
                    {
                      name: "BACKEND_URL",
                      value: `https://${env.DOMAIN_NAME || "localhost:3000"}/api/trpc`,
                    },
                    {
                      name: "DO_SPACES_BUCKET",
                      value: env.DO_SPACES_BUCKET,
                    },
                    {
                      name: "DO_SPACES_REGION",
                      value: env.DO_SPACES_REGION,
                    },
                    {
                      name: "DO_SPACES_ENDPOINT",
                      value: env.DO_SPACES_ENDPOINT,
                    },
                    {
                      name: "NODE_ENV",
                      value: "production",
                    },
                  ],
                  resources: {
                    requests: {
                      cpu: "2",
                      memory: "8Gi",
                    },
                    limits: {
                      cpu: "4",
                      memory: "16Gi",
                    },
                  },
                },
              ],
            },
          },
          backoffLimit: 0,
        },
      };

      try {
        const response = await k8sApi.createNamespacedJob(namespace, job);
        console.log(`Created Kubernetes job: ${jobName}`);
        console.log(`Job UID: ${response.body.metadata?.uid}`);
      } catch (error) {
        console.error("Failed to create Kubernetes job:", error);
        throw new BotDeploymentError(`Failed to create Kubernetes job: ${error}`);
      }
    }

    // Update status to joining call
    const result = await db
      .update(bots)
      .set({
        status: "JOINING_CALL",
        deploymentError: null,
      })
      .where(eq(bots.id, botId))
      .returning();

    if (!result[0]) {
      throw new BotDeploymentError("Bot not found");
    }

    return result[0];
  } catch (error) {
    // Update status to fatal and store error message
    await db
      .update(bots)
      .set({
        status: "FATAL",
        deploymentError:
          error instanceof Error ? error.message : "Unknown error",
      })
      .where(eq(bots.id, botId));

    throw error;
  }
}

/**
 * Get the status of a bot job in Kubernetes
 */
export async function getBotJobStatus(botId: number): Promise<string | null> {
  try {
    const namespace = env.KUBE_NAMESPACE || "default";
    
    const response = await k8sApi.listNamespacedJob(
      namespace,
      undefined,
      undefined,
      undefined,
      undefined,
      `bot-id=${botId}`
    );

    if (response.body.items.length === 0) {
      return null;
    }

    const job = response.body.items[0];
    const status = job.status;

    if (status?.succeeded) {
      return "SUCCEEDED";
    } else if (status?.failed) {
      return "FAILED";
    } else if (status?.active) {
      return "RUNNING";
    } else {
      return "PENDING";
    }
  } catch (error) {
    console.error("Failed to get bot job status:", error);
    return null;
  }
}

/**
 * Delete a bot job from Kubernetes
 */
export async function deleteBotJob(botId: number): Promise<boolean> {
  try {
    const namespace = env.KUBE_NAMESPACE || "default";
    
    const response = await k8sApi.listNamespacedJob(
      namespace,
      undefined,
      undefined,
      undefined,
      undefined,
      `bot-id=${botId}`
    );

    if (response.body.items.length === 0) {
      return false;
    }

    const job = response.body.items[0];
    const jobName = job.metadata?.name;

    if (!jobName) {
      return false;
    }

    await k8sApi.deleteNamespacedJob(jobName, namespace);
    console.log(`Deleted Kubernetes job: ${jobName}`);
    return true;
  } catch (error) {
    console.error("Failed to delete bot job:", error);
    return false;
  }
}