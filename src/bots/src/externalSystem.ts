import { readFileSync, promises as fsPromises } from "fs";
import { Bot } from "./bot";
import FormData from "form-data";
import fetch from "node-fetch";
import { trimSilentEnd, cleanupTrimmedFile } from "./audioTrimmer";

/**
 * Retry utility with exponential backoff for external uploads
 * @param fn Function to retry
 * @param maxRetries Maximum number of retries
 * @param baseDelay Base delay in milliseconds
 * @returns Promise result
 */
async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error as Error;

            if (attempt === maxRetries) {
                throw lastError;
            }

            const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000; // Add jitter
            console.log(`External upload attempt ${attempt + 1} failed: ${lastError.message}. Retrying in ${Math.round(delay)}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError!;
}

/**
 * Upload recording to external system API
 * @param bot Bot instance containing recording and configuration
 * @param externalMeetingId External meeting ID for the API endpoint
 * @param baseUrl Base URL of the external system
 * @param apiKey API key for authentication
 * @returns Promise<string> Returns the response from external system or empty string on failure
 */
export async function uploadRecordingToExternalSystem(
  bot: Bot,
  externalMeetingId: string,
  baseUrl: string,
  apiKey?: string
): Promise<string> {
  console.log(`Starting upload to external system for meeting: ${externalMeetingId}`);

  // Get the original file path
  const originalFilePath = bot.getRecordingPath();

  // Get the everyoneLeftTimeout from bot settings to determine how much to trim
  const everyoneLeftTimeout = bot.settings.automaticLeave?.everyoneLeftTimeout ?? 0;

  // Trim silent end if timeout is configured
  let filePath = originalFilePath;
  let isTrimmed = false;

  if (everyoneLeftTimeout > 0) {
      console.log(`Trimming ${everyoneLeftTimeout}ms of silence from end of recording for external upload`);
      try {
          filePath = await trimSilentEnd(originalFilePath, everyoneLeftTimeout);
          isTrimmed = filePath !== originalFilePath;
          if (isTrimmed) {
              console.log(`Using trimmed file for external upload: ${filePath}`);
          }
      } catch (error) {
          console.warn("Failed to trim audio for external upload, using original file:", error);
          filePath = originalFilePath;
      }
  }

  // Attempt to read the file path. Allow for time for the file to become available.
  let fileContent: Buffer;
  let i = 10;

  while (true) {
    try {
      fileContent = readFileSync(filePath);
      console.log("Successfully read recording file for external upload");
      break; // Exit loop if readFileSync is successful
    } catch (error) {
      const err = error as NodeJS.ErrnoException;

      // Could not read file.
      if (err.code === "EBUSY") {
        console.log("File is busy, retrying...");
        await new Promise(r => setTimeout(r, 1000)); // Wait for 1 second before retrying
      } else if (err.code === "ENOENT") {
        // Throw an Error
        if (i < 0)
          throw new Error("File not found after multiple retries");

        console.log("File not found, retrying ", i--, " more times");
        await new Promise(r => setTimeout(r, 1000)); // Wait for 1 second before retrying
      } else {
        throw error; // Rethrow if it's a different error
      }
    }
  }

  try {
    // Create form data for multipart upload
    const form = new FormData();
    const contentType = bot.getContentType();
    const fileExtension = contentType.split("/")[1];

    // Create descriptive filename with timestamp and meeting info
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' +
                      new Date().toISOString().replace(/[:.]/g, '-').split('T')[1].split('.')[0];
    const meetingInfo = bot.settings.meetingInfo;
    const platform = meetingInfo.platform || 'unknown';
    const meetingId = meetingInfo.externalMeetingId || meetingInfo.id || 'no-id';

    const fileName = `${timestamp}_${platform}_${meetingId}_recording.${fileExtension}`;
    
    // Only append the recording file to match MeetingRecordingSerializer
    form.append('recording', fileContent, {
      filename: fileName,
      contentType: contentType,
    });

    // Construct the API endpoint URL
    const uploadUrl = `${baseUrl.replace(/\/$/, '')}/api/meetings/${externalMeetingId}/recording/`;
    console.log(`Starting external system upload with retry mechanism: ${uploadUrl}`);

    // Upload with retry mechanism
    const responseData = await retryWithBackoff(async () => {
      // Prepare headers
      const headers: Record<string, string> = {
        ...form.getHeaders(),
      };

      // Add API key if provided
      if (apiKey) {
        headers['Authorization'] = `Api-Key ${apiKey}`;
      }

      // Make the upload request
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: headers,
        body: form,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'No response body');
        throw new Error(`External system upload failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const responseData = await response.text();
      console.log(`✅ Successfully uploaded recording to external system: ${uploadUrl}`);
      return responseData;
    }, 3, 2000); // 3 retries, starting with 2s delay

    console.log(`External system response:`, responseData);

    // Clean up local files after successful upload
    try {
      // Clean up the original file
      await fsPromises.unlink(originalFilePath);
      console.log("✅ Original recording file cleaned up successfully");

      // Clean up trimmed file if it was created
      if (isTrimmed) {
          cleanupTrimmedFile(filePath);
      }
    } catch (cleanupError) {
      console.warn("⚠️ Warning: Could not clean up local file:", cleanupError);
      // Don't fail the upload if cleanup fails
    }

    return responseData;
  } catch (error) {
    console.error("❌ External system upload failed after all retries:", error);
    throw error;
  }
}

/**
 * Determine whether to use external system upload based on configuration
 * @param useExternalUpload Environment flag for external upload
 * @param externalMeetingId External meeting ID
 * @param baseUrl External system base URL
 * @returns boolean indicating whether external upload should be used
 */
export function shouldUseExternalSystemUpload(
  useExternalUpload: boolean,
  externalMeetingId?: string,
  baseUrl?: string
): boolean {
  return useExternalUpload && !!externalMeetingId && !!baseUrl;
}
