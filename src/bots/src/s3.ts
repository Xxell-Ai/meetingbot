import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { readFileSync, promises as fsPromises } from "fs";
import { Bot } from "./bot";
import { randomUUID } from "crypto";

/**
 * Creates an S3 Connection to the bucket (works with both AWS S3 and DigitalOcean Spaces).
 * 
 * @param region AWS region or DO region
 * @param accessKeyId Access key ID
 * @param secretKey Secret access key
 * @param endpoint Custom endpoint for DigitalOcean Spaces
 * @returns S3Client
 */
export function createS3Client(
    region: string | undefined, 
    accessKeyId: string | undefined, 
    secretKey: string | undefined,
    endpoint?: string
): S3Client|null {

    try {

        if (!region)
            throw new Error("Region is required");

        const clientConfig: any = {
            region,
        };

        // Add custom endpoint for DigitalOcean Spaces
        if (endpoint) {
            clientConfig.endpoint = endpoint;
            clientConfig.forcePathStyle = false; // Use virtual hosted-style for DO Spaces
        }

        // Create an S3 client with credentials if they are provided
        // Local Development requires access keys.
        if (accessKeyId && secretKey) {
            clientConfig.credentials = {
                accessKeyId: accessKeyId,
                secretAccessKey: secretKey!,
            };
        }

        return new S3Client(clientConfig);

    } catch (error) {
        console.error("Error creating S3 client:", error);
        return null;
    }
}

/**
 * Upload recording to S3-compatible storage (AWS S3 or DigitalOcean Spaces)
 * @param s3Client S3 client instance
 * @param bot Bot instance
 * @param bucketName Bucket name (AWS S3 or DO Spaces)
 * @returns Promise<string> Upload key or empty string on failure
 */
export async function uploadRecordingToS3(s3Client: S3Client, bot: Bot, bucketName?: string): Promise<string> {

    // Attempt to read the file path. Allow for time for the file to become available.
    const filePath = bot.getRecordingPath();
    let fileContent: Buffer;
    let i = 10;

    while (true) {
        try {

            fileContent = readFileSync(filePath);
            console.log("Successfully read recording file");
            break; // Exit loop if readFileSync is successful

        } catch (error) {
            const err = error as NodeJS.ErrnoException;

            // Could not read file.

            // Busy File
            if (err.code === "EBUSY") {
                console.log("File is busy, retrying...");
                await new Promise(r => setTimeout(r, 1000)); // Wait for 1 second before retrying

                // File DNE
            } else if (err.code === "ENOENT") {

                // Throw an Error
                if (i < 0)
                    throw new Error("File not found after multiple retries");

                console.log("File not found, retrying ", i--, " more times");
                await new Promise(r => setTimeout(r, 1000)); // Wait for 1 second before retrying

                // Other Error
            } else {
                throw error; // Rethrow if it's a different error
            }
        }
    }

    // Create descriptive filename with timestamp and meeting info
    const uuid = randomUUID();
    const contentType = bot.getContentType();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' +
                      new Date().toISOString().replace(/[:.]/g, '-').split('T')[1].split('.')[0];

    // Extract meeting info for better naming
    const meetingInfo = bot.settings.meetingInfo;
    const platform = meetingInfo.platform || 'unknown';
    const meetingId = meetingInfo.externalMeetingId || meetingInfo.id || 'no-id';
    const fileExtension = contentType.split("/")[1];

    const key = `recordings/${timestamp}_${platform}_${meetingId}_${uuid.split('-')[0]}.${fileExtension}`;

    // Use DigitalOcean Spaces bucket
    const finalBucketName = bucketName || process.env.DO_SPACES_BUCKET;
    
    if (!finalBucketName) {
        throw new Error("No bucket name provided. Set DO_SPACES_BUCKET environment variable");
    }

    try {
        const commandObjects = {
            Bucket: finalBucketName,
            Key: key,
            Body: fileContent,
            ContentType: contentType,
        };

        const putCommand = new PutObjectCommand(commandObjects);
        await s3Client.send(putCommand);
        console.log(`Successfully uploaded recording to ${finalBucketName}: ${key}`);

        // Clean up local file
        await fsPromises.unlink(filePath);

        // Return the Upload Key
        return key;

    } catch (error) {
        console.error("Error uploading to S3:", error);
    }

    // No Upload
    return '';
}