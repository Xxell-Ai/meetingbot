import { readFileSync, promises as fsPromises } from "fs";
import { Bot } from "./bot";
import FormData from "form-data";
import fetch from "node-fetch";

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
  
  // Attempt to read the file path. Allow for time for the file to become available.
  const filePath = bot.getRecordingPath();
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
    const fileName = `${bot.settings.meetingInfo.platform}-recording.${fileExtension}`;
    
    form.append('recording', fileContent, {
      filename: fileName,
      contentType: contentType,
    });

    // Add additional metadata
    form.append('platform', bot.settings.meetingInfo.platform || 'unknown');
    form.append('meetingTitle', bot.settings.meetingTitle);
    form.append('botId', bot.settings.id.toString());
    
    // Add speaker timeframes if available
    const speakerTimeframes = bot.getSpeakerTimeframes();
    if (speakerTimeframes && speakerTimeframes.length > 0) {
      form.append('speakerTimeframes', JSON.stringify(speakerTimeframes));
    }

    // Construct the API endpoint URL
    const uploadUrl = `${baseUrl.replace(/\/$/, '')}/api/meetings/${externalMeetingId}/recording/`;
    console.log(`Uploading to external system: ${uploadUrl}`);

    // Prepare headers
    const headers: Record<string, string> = {
      ...form.getHeaders(),
    };

    // Add API key if provided
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
      // Also try x-api-key format in case the external system uses that
      headers['x-api-key'] = apiKey;
    }

    // Make the upload request
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: headers,
      body: form,
    });

    if (!response.ok) {
      throw new Error(`External system upload failed: ${response.status} ${response.statusText}`);
    }

    const responseData = await response.text();
    console.log(`Successfully uploaded recording to external system: ${uploadUrl}`);
    console.log(`External system response:`, responseData);

    // Clean up local file after successful upload
    try {
      await fsPromises.unlink(filePath);
      console.log("Successfully cleaned up local recording file");
    } catch (cleanupError) {
      console.warn("Warning: Could not clean up local file:", cleanupError);
    }

    return responseData;
  } catch (error) {
    console.error("Error uploading to external system:", error);
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
