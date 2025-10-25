import { execSync } from "child_process";
import fs from "fs";
import path from "path";

/**
 * Get accurate audio duration using multiple detection methods
 * Stream duration is more accurate for AAC files than format duration
 * @param inputPath Path to the audio/video file
 * @returns Duration in seconds
 */
function getAccurateAudioDuration(inputPath: string): number {
  console.log(`[DURATION] Getting accurate duration for: ${inputPath}`);

  // Method 1: Try stream duration (most accurate for AAC)
  try {
    console.log('[DURATION] Method 1: Trying stream duration (most accurate for AAC)...');
    const streamDurationOutput = execSync(
      `ffprobe -v error -select_streams a:0 -show_entries stream=duration -of default=noprint_wrappers=1:nokey=1 "${inputPath}"`,
      { encoding: 'utf8' }
    );

    const streamDuration = parseFloat(streamDurationOutput.trim());

    if (!isNaN(streamDuration) && streamDuration > 0) {
      console.log(`✅ [DURATION] Stream duration: ${streamDuration}s (accurate)`);
      return streamDuration;
    } else {
      console.log(`⚠️  [DURATION] Stream duration invalid (${streamDurationOutput.trim()}), trying fallback...`);
    }
  } catch (error) {
    console.log(`⚠️  [DURATION] Stream duration failed:`, error);
  }

  // Method 2: Fallback to format duration (less accurate for VBR AAC)
  try {
    console.log('[DURATION] Method 2: Trying format duration (fallback)...');
    const formatDurationOutput = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputPath}"`,
      { encoding: 'utf8' }
    );

    const formatDuration = parseFloat(formatDurationOutput.trim());

    if (!isNaN(formatDuration) && formatDuration > 0) {
      console.log(`✅ [DURATION] Format duration: ${formatDuration}s (fallback method)`);
      return formatDuration;
    } else {
      console.log(`❌ [DURATION] Format duration invalid: ${formatDurationOutput.trim()}`);
    }
  } catch (error) {
    console.error(`❌ [DURATION] Format duration failed:`, error);
  }

  throw new Error('Could not determine audio duration using any method');
}

/**
 * Trims silent audio from the end of a recording file
 * @param inputPath Path to the input audio/video file
 * @param silentDurationMs Duration of silence to trim from the end in milliseconds
 * @returns Path to the trimmed file
 */
export async function trimSilentEnd(inputPath: string, silentDurationMs: number): Promise<string> {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file does not exist: ${inputPath}`);
  }

  if (silentDurationMs <= 0) {
    console.log("No trimming needed, silent duration is 0 or negative");
    return inputPath;
  }

  try {
    // Get the duration of the input file using accurate detection
    const totalDurationSeconds = getAccurateAudioDuration(inputPath);
    const silentDurationSeconds = silentDurationMs / 1000;

    console.log(`[TRIM] Original file duration: ${totalDurationSeconds}s, trimming ${silentDurationSeconds}s from end`);

    // Calculate the new duration after trimming
    const newDurationSeconds = totalDurationSeconds - silentDurationSeconds;

    if (newDurationSeconds <= 0) {
      console.warn(`[TRIM] Trimming duration (${silentDurationSeconds}s) is longer than file duration (${totalDurationSeconds}s), returning original file`);
      return inputPath;
    }

    // Create output path with "_trimmed" suffix
    const ext = path.extname(inputPath);
    const basename = path.basename(inputPath, ext);
    const dirname = path.dirname(inputPath);
    const outputPath = path.join(dirname, `${basename}_trimmed${ext}`);

    // Use ffmpeg to trim the file and convert to AAC for smaller file size
    const ffmpegCommand = [
      'ffmpeg',
      '-i', `"${inputPath}"`,
      '-t', newDurationSeconds.toString(),
      '-c:a', 'aac', // Convert to AAC for better compression
      '-b:a', '64k', // 64kbps is good for voice recordings
      '-ar', '22050', // 22.05kHz sample rate (sufficient for speech)
      '-ac', '1', // Mono audio (sufficient for meetings)
      '-avoid_negative_ts', 'make_zero',
      '-y', // Overwrite output file if it exists
      `"${outputPath}"`
    ].join(' ');

    console.log(`[TRIM] Trimming audio with command: ${ffmpegCommand}`);
    execSync(ffmpegCommand, { stdio: 'inherit' });

    // Verify the output file was created and get its duration
    if (!fs.existsSync(outputPath)) {
      throw new Error(`Failed to create trimmed file: ${outputPath}`);
    }

    // Verify the trimmed file has the expected duration
    try {
      const trimmedDuration = getAccurateAudioDuration(outputPath);
      console.log(`[TRIM] Trimmed file duration: ${trimmedDuration}s (expected: ${newDurationSeconds}s)`);
    } catch (error) {
      console.warn('[TRIM] Could not verify trimmed file duration:', error);
    }

    console.log(`✅ [TRIM] Successfully trimmed file: ${outputPath}`);
    return outputPath;

  } catch (error) {
    console.error("❌ [TRIM] Error trimming audio:", error);
    console.log("[TRIM] Returning original file due to trimming error");
    return inputPath; // Return original file if trimming fails
  }
}

/**
 * Cleanup function to remove trimmed files after upload
 * @param trimmedPath Path to the trimmed file to clean up
 */
export function cleanupTrimmedFile(trimmedPath: string): void {
  try {
    if (fs.existsSync(trimmedPath) && trimmedPath.includes('_trimmed')) {
      fs.unlinkSync(trimmedPath);
      console.log(`Cleaned up trimmed file: ${trimmedPath}`);
    }
  } catch (error) {
    console.warn(`Failed to cleanup trimmed file: ${trimmedPath}`, error);
  }
}