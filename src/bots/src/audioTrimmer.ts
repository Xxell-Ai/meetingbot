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
 * Auto-detect the duration of silence at the end of an audio file
 * @param inputPath Path to the input audio/video file
 * @param minSilenceSeconds Minimum silence duration to detect (default: 60 seconds = 1 minute)
 * @param noiseThreshold Silence detection threshold in dB (default: -40dB)
 * @returns Duration of silence at the end in seconds, or 0 if no significant silence
 */
function detectEndSilence(inputPath: string, minSilenceSeconds: number = 60, noiseThreshold: number = -40): number {
  console.log(`[SILENCE DETECT] Analyzing audio file for end silence (min: ${minSilenceSeconds}s, threshold: ${noiseThreshold}dB)...`);

  try {
    // Use FFmpeg's silencedetect filter to find silence segments
    const silenceOutput = execSync(
      `ffmpeg -v error -i "${inputPath}" -af silencedetect=noise=${noiseThreshold}dB:d=${minSilenceSeconds} -f null - 2>&1`,
      { encoding: 'utf8' }
    );

    console.log(`[SILENCE DETECT] FFmpeg output:\n${silenceOutput}`);

    // Parse silence detection output
    // Format: [silencedetect @ ...] silence_start: 2940.5
    //         [silencedetect @ ...] silence_end: 3240.2 | silence_duration: 299.7

    const silenceEndMatches = silenceOutput.match(/silence_end: ([\d.]+)/g);
    const silenceDurationMatches = silenceOutput.match(/silence_duration: ([\d.]+)/g);

    if (!silenceEndMatches || !silenceDurationMatches || silenceEndMatches.length === 0) {
      console.log(`[SILENCE DETECT] No silence segments >= ${minSilenceSeconds}s detected`);
      return 0;
    }

    // Get the last silence end time and duration
    const lastSilenceEndStr = silenceEndMatches[silenceEndMatches.length - 1];
    const lastSilenceDurationStr = silenceDurationMatches[silenceDurationMatches.length - 1];

    const lastSilenceEnd = parseFloat(lastSilenceEndStr.split(': ')[1]);
    const lastSilenceDuration = parseFloat(lastSilenceDurationStr.split(': ')[1]);

    // Get total file duration
    const totalDuration = getAccurateAudioDuration(inputPath);

    // Check if the last silence extends to the end of the file
    // Allow 1 second tolerance for rounding
    if (Math.abs(lastSilenceEnd - totalDuration) < 1.0) {
      console.log(`[SILENCE DETECT] Detected ${lastSilenceDuration.toFixed(1)}s of silence at end of file`);
      return lastSilenceDuration;
    } else {
      console.log(`[SILENCE DETECT] Last silence ends at ${lastSilenceEnd.toFixed(1)}s, but file ends at ${totalDuration.toFixed(1)}s - not end silence`);
      return 0;
    }

  } catch (error) {
    console.error(`[SILENCE DETECT] Failed to detect silence:`, error);
    return 0;
  }
}

/**
 * Trims silent audio from the end of a recording file
 * Now with auto-detection of silence duration!
 *
 * @param inputPath Path to the input audio/video file
 * @param silentDurationMs Duration of silence to trim from the end in milliseconds (if 0, auto-detect)
 * @param autoDetect If true, automatically detect end silence (overrides silentDurationMs)
 * @returns Path to the trimmed file
 */
export async function trimSilentEnd(
  inputPath: string,
  silentDurationMs: number = 0,
  autoDetect: boolean = true
): Promise<string> {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file does not exist: ${inputPath}`);
  }

  try {
    let silentDurationSeconds: number;

    // Auto-detect silence at the end if enabled
    if (autoDetect) {
      console.log('[TRIM] Auto-detecting end silence...');
      silentDurationSeconds = detectEndSilence(inputPath, 60); // Detect silence >= 1 minute

      if (silentDurationSeconds === 0) {
        console.log('[TRIM] No significant end silence detected (< 1 minute), skipping trim');
        return inputPath;
      }
    } else {
      // Use provided duration
      if (silentDurationMs <= 0) {
        console.log("No trimming needed, silent duration is 0 or negative");
        return inputPath;
      }
      silentDurationSeconds = silentDurationMs / 1000;
    }

    // Get the duration of the input file using accurate detection
    const totalDurationSeconds = getAccurateAudioDuration(inputPath);

    console.log(`[TRIM] Original file duration: ${totalDurationSeconds}s, trimming ${silentDurationSeconds.toFixed(1)}s from end`);

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

    // Use ffmpeg to trim the file and convert to AAC
    // IMPROVED: Match quality settings from bot improvements
    const ffmpegCommand = [
      'ffmpeg',
      '-i', `"${inputPath}"`,
      '-t', newDurationSeconds.toString(),
      '-c:a', 'aac', // Convert to AAC for better compression
      '-b:a', '96k', // INCREASED from 64k to match bot quality
      '-ar', '44100', // INCREASED from 22050 to match bot quality (smoother audio)
      '-ac', '1', // Mono audio (sufficient for meetings)
      '-af', 'aresample=async=1', // Async resampling for smoother playback
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
      console.log(`✅ [TRIM] Trimmed file duration: ${trimmedDuration.toFixed(1)}s (expected: ${newDurationSeconds.toFixed(1)}s)`);
      console.log(`✅ [TRIM] Removed ${silentDurationSeconds.toFixed(1)}s (${(silentDurationSeconds / 60).toFixed(1)} minutes) of end silence`);
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