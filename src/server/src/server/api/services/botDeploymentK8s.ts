import { type BotConfig, bots } from "~/server/db/schema";
import { eq } from "drizzle-orm";
import { type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "~/server/db/schema";
import { env } from "~/env";
import * as k8s from "@kubernetes/client-node";

// Initialize Kubernetes client
const kc = new k8s.KubeConfig();

// Load in-cluster configuration for all environments since everything runs in Kubernetes
kc.loadFromCluster();

const k8sApi = kc.makeApiClient(k8s.BatchV1Api);
// const k8sCoreApi = kc.makeApiClient(k8s.CoreV1Api); // Reserved for future use

/**
 * Selects the appropriate bot Docker image from GHCR based on meeting platform
 * @param meetingInfo - Information about the meeting, including platform
 * @returns The GHCR Docker image to use for deployment
 */
export function selectBotImage(meetingInfo: schema.MeetingInfo): string {
  const platform = meetingInfo.platform;
  
  console.log(`selectBotImage: NODE_ENV=${env.NODE_ENV}, platform=${platform}`);
  
  // Use local images for development OR local Kubernetes environment
  const isLocalDev = env.NODE_ENV === "development" ||
                     env.KUBE_NAMESPACE === "meetingbot-local" ||
                     process.env.NODE_ENV === "development";

  if (isLocalDev) {
    console.log("Using local images for local development environment");
    console.log(`Conditions: NODE_ENV=${env.NODE_ENV}, KUBE_NAMESPACE=${env.KUBE_NAMESPACE}, process.env.NODE_ENV=${process.env.NODE_ENV}`);
    switch (platform?.toLowerCase()) {
      case "google":
        return `meetingbot-meet-bot:local`;
      case "teams":
        return `meetingbot-teams-bot:local`;
      case "zoom":
        return `meetingbot-zoom-bot:local`;
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  } else {
    console.log("Using DigitalOcean Container Registry images");
    const commitSha = env.CURRENT_COMMIT_SHA?.substring(0, 7) ?? "latest";
    const registryOwner = (process.env.DOCKER_REGISTRY_OWNER ?? "xxell-ai").toLowerCase();
    console.log(`Registry: ${registryOwner}, Commit SHA: ${commitSha}`);

    // Determine tag prefix based on environment/branch
    const tagPrefix = env.NODE_ENV === "production" ? "prod" : "dev";

    switch (platform?.toLowerCase()) {
      case "google":
        return `registry.digitalocean.com/${registryOwner}/meetingbot-bots-meet:${tagPrefix}-${commitSha}`;
      case "teams":
        return `registry.digitalocean.com/${registryOwner}/meetingbot-bots-teams:${tagPrefix}-${commitSha}`;
      case "zoom":
        return `registry.digitalocean.com/${registryOwner}/meetingbot-bots-zoom:${tagPrefix}-${commitSha}`;
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
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

    // Always deploy to Kubernetes
    // Uses local images for development, registry images for production
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
          platform: bot.meetingInfo.platform ?? "unknown",
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
            restartPolicy: "Never", // Jobs should not restart automatically
            containers: [
              {
                name: "bot",
                image: selectBotImage(bot.meetingInfo),
                imagePullPolicy: (env.NODE_ENV === "development" || env.KUBE_NAMESPACE === "meetingbot-local") ? "Never" : "Always",
                env: [
                  {
                    name: "BOT_DATA",
                    value: JSON.stringify(config),
                  },
                  {
                      name: "BACKEND_URL",
                      valueFrom: {
                        configMapKeyRef: {
                          name: "meetingbot-config",
                          key: "BACKEND_URL",
                        },
                      },
                    },
                    {
                      name: "NODE_ENV",
                      valueFrom: {
                        configMapKeyRef: {
                          name: "meetingbot-config",
                          key: "NODE_ENV",
                        },
                      },
                    },
                    // DigitalOcean Spaces Configuration
                    {
                      name: "DO_SPACES_BUCKET",
                      valueFrom: {
                        secretKeyRef: {
                          name: "meetingbot-secrets",
                          key: "DO_SPACES_BUCKET",
                        },
                      },
                    },
                    {
                      name: "DO_SPACES_REGION",
                      valueFrom: {
                        configMapKeyRef: {
                          name: "meetingbot-config",
                          key: "DO_SPACES_REGION",
                        },
                      },
                    },
                    {
                      name: "DO_SPACES_ENDPOINT",
                      valueFrom: {
                        configMapKeyRef: {
                          name: "meetingbot-config",
                          key: "DO_SPACES_ENDPOINT",
                        },
                      },
                    },
                    {
                      name: "AWS_ACCESS_KEY_ID",
                      valueFrom: {
                        secretKeyRef: {
                          name: "meetingbot-secrets",
                          key: "AWS_ACCESS_KEY_ID",
                        },
                      },
                    },
                    {
                      name: "AWS_SECRET_ACCESS_KEY",
                      valueFrom: {
                        secretKeyRef: {
                          name: "meetingbot-secrets",
                          key: "AWS_SECRET_ACCESS_KEY",
                        },
                      },
                    },
                    // External System Integration (optional)
                    {
                      name: "USE_EXTERNAL_SYSTEM_UPLOAD",
                      valueFrom: {
                        configMapKeyRef: {
                          name: "meetingbot-config",
                          key: "USE_EXTERNAL_SYSTEM_UPLOAD",
                        },
                      },
                    },
                  ],
                  resources: {
                    requests: {
                      cpu: "256m",
                      memory: "500Mi",
                    },
                    limits: {
                      cpu: "500m",
                      memory: "1Gi",
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
        throw new BotDeploymentError(`Failed to create Kubernetes job: ${String(error)}`);
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
    if (!job) {
      return null;
    }
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
    if (!job) {
      return false;
    }
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