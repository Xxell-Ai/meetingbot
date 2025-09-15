import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    AUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string()
        : z.string().optional(),
    AUTH_GITHUB_ID:
      process.env.NODE_ENV === "test"
        ? z.preprocess(() => "fake_github_id", z.string())
        : z.string(),
    AUTH_GITHUB_SECRET:
      process.env.NODE_ENV === "test"
        ? z.preprocess(() => "fake_github_secret", z.string())
        : z.string(),
    DATABASE_URL:
      process.env.NODE_ENV === "test"
        ? z.preprocess(
            () => "postgresql://fake_user:fake_password@localhost:5432/fake_db",
            z.string(),
          )
        : z.string().url().startsWith("postgresql://"),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    // DigitalOcean Spaces credentials (uses AWS SDK env var names)
    AWS_ACCESS_KEY_ID: 
      process.env.NODE_ENV === "test"
        ? z.preprocess(() => "fake_access_key", z.string())
        : z.string(),
    AWS_SECRET_ACCESS_KEY: 
      process.env.NODE_ENV === "test"
        ? z.preprocess(() => "fake_secret_key", z.string())
        : z.string(),
    // Note: AWS ECS variables removed - using Kubernetes only deployment
    // DigitalOcean Spaces configuration (required for Kubernetes deployment)
    DOMAIN_NAME: z.string().optional(),
    DO_SPACES_BUCKET: 
      process.env.NODE_ENV === "test"
        ? z.preprocess(() => "fake_bucket", z.string())
        : z.string(),
    DO_SPACES_REGION: 
      process.env.NODE_ENV === "test"
        ? z.preprocess(() => "sgp1", z.string())
        : z.string().default("sgp1"),
    DO_SPACES_ENDPOINT: 
      process.env.NODE_ENV === "test"
        ? z.preprocess(() => "https://sgp1.digitaloceanspaces.com", z.string())
        : z.string().default("https://sgp1.digitaloceanspaces.com"),
    KUBE_NAMESPACE: z.string().default("default"),
    CURRENT_COMMIT_SHA: z.string().optional(),
    // Deployment platform - Kubernetes only
    DEPLOYMENT_PLATFORM: z.enum(["KUBERNETES"]).default("KUBERNETES"),
    // Note: Using DigitalOcean Spaces only for Kubernetes deployment
    // External system integration
    EXTERNAL_SYSTEM_BASE_URL: z.string().url().optional().describe("Base URL for external system API"),
    EXTERNAL_SYSTEM_API_KEY: z.string().optional().describe("API key for external system"),
    // Recording upload preference
    USE_EXTERNAL_SYSTEM_UPLOAD: z.boolean().default(false).describe("Whether to upload recordings to external system instead of S3"),
    // Docker registry configuration
    DOCKER_REGISTRY_OWNER: z.string().optional().describe("Docker registry owner/organization name"),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    // NEXT_PUBLIC_CLIENTVAR: z.string(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_GITHUB_ID: process.env.AUTH_GITHUB_ID,
    AUTH_GITHUB_SECRET: process.env.AUTH_GITHUB_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    // DigitalOcean and Kubernetes runtime environment
    DOMAIN_NAME: process.env.DOMAIN_NAME,
    DO_SPACES_BUCKET: process.env.DO_SPACES_BUCKET,
    DO_SPACES_REGION: process.env.DO_SPACES_REGION,
    DO_SPACES_ENDPOINT: process.env.DO_SPACES_ENDPOINT,
    KUBE_NAMESPACE: process.env.KUBE_NAMESPACE,
    CURRENT_COMMIT_SHA: process.env.CURRENT_COMMIT_SHA,
    DEPLOYMENT_PLATFORM: process.env.DEPLOYMENT_PLATFORM,
    EXTERNAL_SYSTEM_BASE_URL: process.env.EXTERNAL_SYSTEM_BASE_URL,
    EXTERNAL_SYSTEM_API_KEY: process.env.EXTERNAL_SYSTEM_API_KEY,
    USE_EXTERNAL_SYSTEM_UPLOAD: process.env.USE_EXTERNAL_SYSTEM_UPLOAD === 'true',
    DOCKER_REGISTRY_OWNER: process.env.DOCKER_REGISTRY_OWNER,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
