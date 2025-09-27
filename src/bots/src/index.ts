import { Bot, createBot } from "./bot";
import dotenv from "dotenv";
import { startHeartbeat, reportEvent } from "./monitoring";
import { EventCode, type BotConfig } from "./types";
import { createS3Client, uploadRecordingToS3 } from "./s3";
import { uploadRecordingToExternalSystem, shouldUseExternalSystemUpload } from "./externalSystem";

dotenv.config({path: '../test.env'}); // Load test.env for testing
dotenv.config();

export const main = async () => {
  let hasErrorOccurred = false;
  const requiredEnvVars = [
    "BOT_DATA",
    "NODE_ENV",
  ] as const;

  // Check all required environment variables are present
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }

  // Validate DigitalOcean Spaces environment variables (if not using external upload)
  const useExternalUpload = process.env.USE_EXTERNAL_SYSTEM_UPLOAD === 'true';
  
  if (!useExternalUpload) {
    const doRequiredVars = [
      "DO_SPACES_BUCKET", 
      "DO_SPACES_REGION", 
      "DO_SPACES_ENDPOINT",
      "AWS_ACCESS_KEY_ID",    // DO Spaces uses AWS SDK env vars
      "AWS_SECRET_ACCESS_KEY" // DO Spaces uses AWS SDK env vars
    ];
    for (const envVar of doRequiredVars) {
      if (!process.env[envVar]) {
        throw new Error(`Missing required DigitalOcean Spaces environment variable: ${envVar}`);
      }
    }
  }

  // Parse bot data
  const botData: BotConfig = JSON.parse(process.env.BOT_DATA!);
  console.log("Received bot data:", botData);
  const botId = botData.id;

  // Declare key variable at the top level of the function
  let key: string = "";

  try {
    // Initialize DigitalOcean Spaces client (needed for fallback even with external upload)
  let s3Client = null;
  try {
    s3Client = createS3Client(
      process.env.DO_SPACES_REGION!,
      process.env.AWS_ACCESS_KEY_ID, // DO Spaces uses same access key env vars
      process.env.AWS_SECRET_ACCESS_KEY,
      process.env.DO_SPACES_ENDPOINT!
    );

    if (s3Client) {
      console.log("DigitalOcean Spaces client initialized successfully");
    } else {
      console.warn("Failed to create DigitalOcean Spaces client - fallback upload will not be available");
    }
  } catch (error) {
    console.warn("Could not initialize DigitalOcean Spaces client:", error);
    if (!useExternalUpload) {
      throw new Error("Failed to create DigitalOcean Spaces client and external upload is not configured");
    }
  }

  // Create the appropriate bot instance based on platform
  const bot = await createBot(botData);

  // Create AbortController for heartbeat
  const heartbeatController = new AbortController();

  // Do not start heartbeat in development
  if (process.env.NODE_ENV !== "development") {
    // Start heartbeat in the background
    console.log("Starting heartbeat");
    const heartbeatInterval = botData.heartbeatInterval ?? 5000; // Default to 5 seconds if not set
    startHeartbeat(botId, heartbeatController.signal, heartbeatInterval);
  }

  // Report READY_TO_DEPLOY event
  await reportEvent(botId, EventCode.READY_TO_DEPLOY);

  let botRunSuccessfully = false;

  try {
    // Run the bot
    await bot.run();
    botRunSuccessfully = true;
    console.log("✅ Bot completed successfully");
  } catch (error) {
    console.error("❌ Error running bot:", error.message);
    await reportEvent(botId, EventCode.FATAL, {
      description: (error as Error).message,
    });

    // Check what's on the screen in case of an error
    try {
      await bot.screenshot();
    } catch (screenshotError) {
      console.log("Could not take error screenshot:", screenshotError.message);
    }

    // **Ensure** the bot cleans up its resources after a breaking error
    await bot.endLife();

    console.log("⚠️ Skipping upload due to bot execution failure");
    return; // Exit early, don't attempt upload
  }

  // Only attempt upload if bot ran successfully and recording exists
  if (botRunSuccessfully) {
    try {
      // Upload recording based on configuration
      if (shouldUseExternalSystemUpload(
        useExternalUpload,
        botData.meetingInfo.externalMeetingId,
        process.env.EXTERNAL_SYSTEM_BASE_URL
      )) {
        console.log("Starting upload to external system...");
        try {
          const externalResponse = await uploadRecordingToExternalSystem(
            bot,
            botData.meetingInfo.externalMeetingId!,
            process.env.EXTERNAL_SYSTEM_BASE_URL!,
            process.env.EXTERNAL_SYSTEM_API_KEY
          );
          key = `external_system_upload_${botData.meetingInfo.externalMeetingId}`;
          console.log("External system upload completed:", externalResponse);
        } catch (error) {
          console.error("External system upload failed, falling back to DigitalOcean Spaces:", error);
          if (s3Client) {
            console.log("Starting fallback upload to DigitalOcean Spaces...");
            try {
              key = await uploadRecordingToS3(s3Client, bot);
              console.log("Fallback upload to DigitalOcean Spaces completed successfully");
            } catch (fallbackError) {
              console.error("Fallback upload to DigitalOcean Spaces also failed:", fallbackError.message);
              throw new Error(`External system upload failed: ${error.message}. Fallback to DigitalOcean Spaces also failed: ${fallbackError.message}`);
            }
          } else {
            throw new Error(`External system upload failed: ${error.message}. No DigitalOcean Spaces client available for fallback. Check DO_SPACES credentials.`);
          }
        }
      } else if (s3Client) {
        console.log(`Starting upload to DigitalOcean Spaces...`);
        key = await uploadRecordingToS3(s3Client, bot);
      } else {
        throw new Error("No upload method configured. Enable external system upload or configure S3 storage.");
      }
    } catch (uploadError) {
      console.error("❌ Upload failed:", uploadError.message);
      await reportEvent(botId, EventCode.FATAL, {
        description: `Upload failed: ${uploadError.message}`,
      });
      throw uploadError;
    }
  }

  } catch (error) {
    hasErrorOccurred = true;
    console.error("Error running bot:", error);
    await reportEvent(botId, EventCode.FATAL, {
      description: (error as Error).message,
    });
  }

  // After upload and cleanup, stop the heartbeat
  heartbeatController.abort();
  console.log("Bot execution completed, heartbeat stopped.");

  // Only report DONE if no error occurred
  if (!hasErrorOccurred) {
    // Report final DONE event
    const speakerTimeframes = bot.getSpeakerTimeframes();
    console.debug("Speaker timeframes:", speakerTimeframes);
    await reportEvent(botId, EventCode.DONE, { recording: key, speakerTimeframes });
  }

  // Exit with appropriate code
  process.exit(hasErrorOccurred ? 1 : 0);
};

// Only run automatically if not in a test
if (require.main === module) {
  main();
}
