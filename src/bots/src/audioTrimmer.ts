import { execSync } from "child_process";
import fs from "fs";
import path from "path";

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
    // Get the duration of the input file
    const durationOutput = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputPath}"`,
      { encoding: 'utf8' }
    );

    const totalDurationSeconds = parseFloat(durationOutput.trim());
    const silentDurationSeconds = silentDurationMs / 1000;

    console.log(`Original file duration: ${totalDurationSeconds}s, trimming ${silentDurationSeconds}s from end`);

    // Calculate the new duration after trimming
    const newDurationSeconds = totalDurationSeconds - silentDurationSeconds;

    if (newDurationSeconds <= 0) {
      console.warn("Trimming duration is longer than file duration, returning original file");
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

    console.log(`Trimming audio with command: ${ffmpegCommand}`);
    execSync(ffmpegCommand, { stdio: 'inherit' });

    // Verify the output file was created
    if (!fs.existsSync(outputPath)) {
      throw new Error(`Failed to create trimmed file: ${outputPath}`);
    }

    console.log(`Successfully trimmed file: ${outputPath}`);
    return outputPath;

  } catch (error) {
    console.error("Error trimming audio:", error);
    console.log("Returning original file due to trimming error");
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