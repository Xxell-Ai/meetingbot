import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "~/env";

/**
 * Storage configuration interface
 */
interface StorageConfig {
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
  bucketName: string;
}

/**
 * Get DigitalOcean Spaces storage configuration
 */
function getStorageConfig(): StorageConfig {
  // Validate required credentials
  if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
    throw new Error("DigitalOcean Spaces credentials are required (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)");
  }
  
  if (!env.DO_SPACES_BUCKET) {
    throw new Error("DO_SPACES_BUCKET is required for DigitalOcean Spaces");
  }

  return {
    region: env.DO_SPACES_REGION,
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    endpoint: env.DO_SPACES_ENDPOINT,
    bucketName: env.DO_SPACES_BUCKET,
  };
}

/**
 * Create S3Client for DigitalOcean Spaces
 */
function createS3Client(): S3Client {
  const config = getStorageConfig();
  
  const clientConfig: {
    region: string;
    credentials?: {
      accessKeyId: string;
      secretAccessKey: string;
    };
    endpoint?: string;
    forcePathStyle?: boolean;
  } = {
    region: config.region,
  };

  // Add credentials if provided
  if (config.accessKeyId && config.secretAccessKey) {
    clientConfig.credentials = {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    };
  }

  // Add custom endpoint for DigitalOcean Spaces
  if (config.endpoint) {
    clientConfig.endpoint = config.endpoint;
    clientConfig.forcePathStyle = false; // Use virtual hosted-style for DO Spaces
  }

  return new S3Client(clientConfig);
}

/**
 * Singleton S3Client manager
 */
class StorageClientSingleton {
  private static instance: S3Client | null = null;

  public static getInstance(): S3Client {
    StorageClientSingleton.instance ??= createS3Client();
    return StorageClientSingleton.instance;
  }

  public static resetInstance(): void {
    StorageClientSingleton.instance = null;
  }
}

/**
 * Get the configured bucket name
 */
export function getBucketName(): string {
  const config = getStorageConfig();
  if (!config.bucketName) {
    throw new Error("No bucket name configured for DigitalOcean Spaces");
  }
  return config.bucketName;
}

/**
 * Get DigitalOcean Spaces provider information
 */
export function getStorageProvider(): {
  provider: string;
  region: string;
  endpoint?: string;
  bucketName: string;
} {
  const config = getStorageConfig();
  return {
    provider: "DO_SPACES",
    region: config.region,
    endpoint: config.endpoint,
    bucketName: config.bucketName,
  };
}

/**
 * Generate signed URL for accessing stored objects
 */
export const generateSignedUrl = async (key: string, expiresIn = 3600): Promise<string> => {
  const s3Client = StorageClientSingleton.getInstance();
  const bucketName = getBucketName();

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
};

/**
 * Get S3Client instance (for direct usage)
 */
export const getS3Client = (): S3Client => {
  return StorageClientSingleton.getInstance();
};

// Export for backward compatibility
export { StorageClientSingleton };
