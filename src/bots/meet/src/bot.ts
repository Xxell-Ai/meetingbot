import { chromium } from "playwright-extra";
import { Browser, Page } from "playwright";
import {  PageVideoCapture } from "playwright-video";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { setTimeout } from "timers/promises";
import { BotConfig, EventCode, SpeakerTimeframe, WaitingRoomTimeoutError } from "../../src/types";
import { Bot } from "../../src/bot";
import * as fs from 'fs';
import path from "path";
import { ChildProcessWithoutNullStreams, spawn } from "child_process";

// Use Stealth Plugin to avoid detection
const stealthPlugin = StealthPlugin();
stealthPlugin.enabledEvasions.delete("iframe.contentWindow");
stealthPlugin.enabledEvasions.delete("media.codecs");
chromium.use(stealthPlugin);

// User Agent Constant -- set Feb 2025
const userAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";

// Constant Selectors
const enterNameField = 'input[type="text"][aria-label="Your name"]';
const askToJoinButton = '//button[.//span[text()="Ask to join"]]';
const joinNowButton = '//button[.//span[text()="Join now"]]';
const gotKickedDetector = '//button[.//span[text()="Return to home screen"]]';
const leaveButton = `//button[@aria-label="Leave call"]`;
const peopleButton = `//button[@aria-label="People"]`;
const alternativePeopleSelectors = [
  '//button[@aria-label="Show everyone"]',
  '//button[contains(@aria-label, "participant")]',
  '//button[contains(@aria-label, "people")]',
  '//button[@data-tooltip-id="people"]',
  '//button[.//span[text()="People"]]',
  'button[aria-label*="People"]',
  'button[data-tooltip*="people" i]'
];
const onePersonRemainingField = '//span[.//div[text()="Contributors"]]//div[text()="1"]';
const muteButton = `[aria-label*="Turn off microphone"]`; // *= -> conatins
const cameraOffButton = `[aria-label*="Turn off camera"]`;

const infoPopupClick = `//button[.//span[text()="Got it"]]`;

// TODO: pass this in meeting info
const SCREEN_WIDTH = 1920;
const SCREEN_HEIGHT = 1080;

type Participant = {
  id: string;
  name: string;
  observer?: MutationObserver;
};

/**
 * @param amount Milliseconds
 * @returns Random Number within 10% of the amount given, mean at amount
 */
const randomDelay = (amount: number) =>
  (2 * Math.random() - 1) * (amount / 10) + amount;

/**
 * Ensure Typescript doesn't complain about the global exposed 
 * functions that will be setup in the bot.
 */
declare global {
  interface Window {
    saveChunk: (chunk: number[]) => void;
    stopRecording: () => void;

    getParticipants: () => Participant[];
    onParticipantJoin: (participant: Participant) => void;
    onParticipantLeave: (participant: Participant) => void;
    registerParticipantSpeaking: (participant: Participant) => void;
    observeSpeech: (node: any, participant: Participant) => void;
    handleMergedAudio: () => void;

    participantArray: Participant[];
    mergedAudioParticipantArray: Participant[];
    recorder: MediaRecorder | undefined;
  }
}

/**
 * Represents a bot that can join and interact with Google Meet meetings.
 * The bot is capable of joining meetings, performing actions, recording the meeting,
 * monitoring participants, and leaving the meeting based on specific conditions.
 * 
 * @class MeetsBot
 * @extends Bot
 * 
 * @property {string[]} browserArgs - Arguments passed to the browser instance.
 * @property {string} meetingURL - The URL of the Google Meet meeting to join.
 * @property {Browser} browser - The Playwright browser instance used by the bot.
 * @property {Page} page - The Playwright page instance used by the bot.
 * @property {PageVideoCapture | undefined} recorder - The video recorder instance for capturing the meeting.
 * @property {boolean} kicked - Indicates if the bot was kicked from the meeting.
 * @property {string} recordingPath - The file path where the meeting recording is saved.
 * @property {Buffer[]} recordBuffer - Buffer to store video chunks during recording.
 * @property {boolean} startedRecording - Indicates if the recording has started.
 * @property {number} timeAloneStarted - The timestamp when the bot was the only participant in the meeting.
 * @property {ChildProcessWithoutNullStreams | null} ffmpegProcess - The ffmpeg process used for recording.
 * 
 * @constructor
 * @param {BotConfig} botSettings - Configuration settings for the bot, including meeting information.
 * @param {(eventType: EventCode, data?: any) => Promise<void>} onEvent - Callback function to handle events.
 * 
 * @method run - Runs the bot to join the meeting and perform actions.
 * @returns {Promise<void>}
 * 
 * @method getRecordingPath - Retrieves the file path of the recording.
 * @returns {string} The path to the recording file.
 * 
 * @method getSpeakerTimeframes - Retrieves the timeframes of speakers in the meeting.
 * @returns {Array} An array of objects containing speaker names and their respective start and end times.
 * 
 * @method getContentType - Retrieves the content type of the recording file.
 * @returns {string} The content type of the recording file.
 * 
 * @method joinMeeting - Joins the Google Meet meeting and performs necessary setup.
 * @returns {Promise<number>} Returns 0 if the bot successfully joins the meeting, or throws an error if it fails.
 * 
 * @method startRecording - Starts recording the meeting using ffmpeg.
 * @returns {Promise<void>}
 * 
 * @method stopRecording - Stops the ongoing recording if it has been started.
 * @returns {Promise<number>} Returns 0 if the recording was successfully stopped.
 * 
 * @method meetingActions - Performs actions during the meeting, including monitoring participants and recording.
 * @returns {Promise<number>} Returns 0 when the bot finishes its meeting actions.
 * 
 * @method leaveMeeting - Stops the recording and leaves the meeting.
 * @returns {Promise<number>} Returns 0 if the bot successfully leaves the meeting.
 */
export class MeetsBot extends Bot {
  browserArgs: string[];
  meetingURL: string;
  browser!: Browser;
  page!: Page;
  recorder: PageVideoCapture | undefined;
  kicked: boolean = false;
  recordingPath: string;
  participants: Participant[] = [];

  private registeredActivityTimestamps: {
    [participantName: string]: [number];
  } = {};
  private startedRecording: boolean = false;

  private timeAloneStarted: number = Infinity;
  private lastActivity: number | undefined = undefined;
  private recordingStartedAt: number = 0;
  private meetingStartedAt: number = 0; // Track when meeting actually started

  private ffmpegProcess: ChildProcessWithoutNullStreams | null;

  /**
   * 
   * @param botSettings Bot Settings as Passed in the API call.
   * @param onEvent Connection to Backend
   */
  constructor(
    botSettings: BotConfig,
    onEvent: (eventType: EventCode, data?: any) => Promise<void>
  ) {
    super(botSettings, onEvent);
    this.recordingPath = path.resolve(__dirname, "recording.aac");

    this.browserArgs = [
      "--incognito",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-features=IsolateOrigins,site-per-process",
      "--disable-infobars",
      "--disable-gpu", //disable gpu rendering

      "--use-fake-ui-for-media-stream",// automatically grants screen sharing permissions without a selection dialog.
      "--use-file-for-fake-video-capture=/dev/null",
      "--use-file-for-fake-audio-capture=/dev/null",
      '--auto-select-desktop-capture-source="Chrome"' // record the first tab automatically
    ];
    // Fetch
    this.meetingURL = botSettings.meetingInfo.meetingUrl!;
    this.kicked = false; // Flag for if the bot was kicked from the meeting, no need to click exit button.
    this.startedRecording = false; //Flag to not duplicate recording start

    this.ffmpegProcess = null;
  }

  /**
   * Run the bot to join the meeting and perform the meeting actions.
   */
  async run(): Promise<void> {
    try {
      await this.joinMeeting();
      console.log("✅ Successfully joined the meeting");

      // Only start recording and meeting actions if join was successful
      await this.meetingActions();

    } catch (error) {
      console.error("❌ Failed to join meeting:", error.message);
      console.log("⚠️ Skipping recording and meeting actions due to join failure");

      // Re-throw the error to indicate failure to the main process
      throw error;
    }
  }

  /**
   * Gets a consistant video recording path
   * @returns {string} - Returns the path to the recording file.
   */
  getRecordingPath(): string {

    // Ensure the directory exists
    const dir = path.dirname(this.recordingPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Give Back the path
    return this.recordingPath;
  }

  /**
   * Gets the speaker timeframes.
   * @returns {Array} - Returns an array of objects containing speaker names and their respective start and end times.
   */
  getSpeakerTimeframes(): SpeakerTimeframe[] {
    const processedTimeframes: {
      speakerName: string;
      start: number;
      end: number;
    }[] = [];

    // If time between chunks is less than this, we consider it the same utterance.
    const utteranceThresholdMs = 3000;
    for (const [speakerName, timeframesArray] of Object.entries(
      this.registeredActivityTimestamps
    )) {
      let start = timeframesArray[0];
      let end = timeframesArray[0];

      for (let i = 1; i < timeframesArray.length; i++) {
        const currentTimeframe = timeframesArray[i]!;
        if (currentTimeframe - end < utteranceThresholdMs) {
          end = currentTimeframe;
        } else {
          if (end - start > 500) {
            processedTimeframes.push({ speakerName, start, end });
          }
          start = currentTimeframe;
          end = currentTimeframe;
        }
      }
      processedTimeframes.push({ speakerName, start, end });
    }
    processedTimeframes.sort((a, b) => a.start - b.start || a.end - b.end);

    return processedTimeframes;
  }

  /**
   * Gets the audio content type.
   * @returns {string} - Returns the content type of the recording file.
   */
  getContentType(): string {
    return "audio/aac";
  }

  /**
   * Launches the browser and opens a blank page.
   */
  async launchBrowser(headless: boolean = false) {

    // Launch Browser
    this.browser = await chromium.launch({
      headless,
      args: this.browserArgs,
    });

    // Unpack Dimensions
    const vp = { width: SCREEN_WIDTH, height: SCREEN_HEIGHT };

    // Create Browser Context
    const context = await this.browser.newContext({
      permissions: ["camera", "microphone"],
      userAgent: userAgent,
      viewport: vp
    });

    // Create Page, Go to
    this.page = await context.newPage();
  }


  /**
   * Calls Launch Browser, then navigates to join the meeting.
   * @returns 0 on success, or throws an error if it fails to join the meeting.
   */
  async joinMeeting() {

    // Launch
    await this.launchBrowser();

    //
    await this.page.waitForTimeout(randomDelay(1000));

    // Inject anti-detection code using addInitScript
    await this.page.addInitScript(() => {

      // Disable navigator.webdriver to avoid detection
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });

      // Override navigator.plugins to simulate real plugins
      Object.defineProperty(navigator, "plugins", {
        get: () => [
          { name: "Chrome PDF Plugin" },
          { name: "Chrome PDF Viewer" },
        ],
      });

      // Override navigator.languages to simulate real languages
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en"],
      });

      // Override other properties
      Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 4 }); // Fake number of CPU cores
      Object.defineProperty(navigator, "deviceMemory", { get: () => 8 }); // Fake memory size
      Object.defineProperty(window, "innerWidth", { get: () => SCREEN_WIDTH }); // Fake screen resolution
      Object.defineProperty(window, "innerHeight", { get: () => SCREEN_HEIGHT });
      Object.defineProperty(window, "outerWidth", { get: () => SCREEN_WIDTH });
      Object.defineProperty(window, "outerHeight", { get: () => SCREEN_HEIGHT });
    });

    //Define Bot Name
    const name = this.settings.botDisplayName || "MeetingBot";

    // Go to the meeting URL (Simulate Movement)
    await this.page.mouse.move(10, 672);
    await this.page.mouse.move(102, 872);
    await this.page.mouse.move(114, 1472);
    await this.page.waitForTimeout(300);
    await this.page.mouse.move(114, 100);
    await this.page.mouse.click(100, 100);

    //Go
    await this.page.goto(this.meetingURL, { waitUntil: "networkidle" });
    await this.page.bringToFront(); //ensure active

    console.log("Waiting for the input field to be visible...");

    let nameFieldSelector: string | null = null;
    let foundField = false;

    // Standard Solution 1: Use modern Locator API with web-first assertions
    try {
      console.log("🔍 SOLUTION 1: Using modern Locator API with web-first assertions...");

      const nameInputLocator = this.page.locator(enterNameField);

      // Use web-first assertion - this is the recommended modern approach
      await nameInputLocator.waitFor({ state: 'visible', timeout: 10000 });

      // Additional check to ensure it's interactable
      const element = await nameInputLocator.elementHandle();
      if (element && await element.isEnabled()) {
        nameFieldSelector = enterNameField;
        foundField = true;
        console.log("✅ SOLUTION 1 SUCCESS: Found primary name field with modern Locator API");
      } else {
        console.log("❌ SOLUTION 1: Element visible but not enabled");
      }
    } catch (error) {
      console.log("❌ SOLUTION 1 FAILED:", error.message);
    }

    // Standard Solution 2: Race condition workaround - wait for attached then visible
    if (!foundField) {
      try {
        console.log("🔍 SOLUTION 2: Race condition workaround - attached then visible...");

        // First wait for element to be attached to DOM
        await this.page.waitForSelector(enterNameField, { state: 'attached', timeout: 5000 });
        console.log("Element attached to DOM");

        // Then explicitly wait for it to become visible
        await this.page.waitForSelector(enterNameField, { state: 'visible', timeout: 5000 });
        console.log("Element became visible");

        // Verify it's actionable
        const element = await this.page.$(enterNameField);
        if (element && await element.isVisible() && await element.isEnabled()) {
          nameFieldSelector = enterNameField;
          foundField = true;
          console.log("✅ SOLUTION 2 SUCCESS: Race condition workaround worked");
        } else {
          console.log("❌ SOLUTION 2: Element visible but not actionable");
        }
      } catch (error) {
        console.log("❌ SOLUTION 2 FAILED:", error.message);
      }
    }

    // Standard Solution 3: Multiple state checks with polling
    if (!foundField) {
      try {
        console.log("🔍 SOLUTION 3: Polling approach with multiple state checks...");

        let attempts = 0;
        const maxAttempts = 8;

        while (attempts < maxAttempts && !foundField) {
          await this.page.waitForTimeout(1000); // Wait between attempts

          const element = await this.page.$(enterNameField);
          if (element) {
            const isVisible = await element.isVisible();
            const isEnabled = await element.isEnabled();
            const boundingBox = await element.boundingBox();

            console.log(`Attempt ${attempts + 1}: visible=${isVisible}, enabled=${isEnabled}, hasBox=${!!boundingBox}`);

            if (isVisible && isEnabled && boundingBox) {
              nameFieldSelector = enterNameField;
              foundField = true;
              console.log("✅ SOLUTION 3 SUCCESS: Polling found actionable element");
              break;
            }
          }

          attempts++;
        }

        if (!foundField) {
          console.log("❌ SOLUTION 3: All polling attempts failed");
        }
      } catch (error) {
        console.log("❌ SOLUTION 3 FAILED:", error.message);
      }
    }

    // If primary selector fails, try alternatives
    if (!foundField) {
      for (const selector of alternativeNameFields) {
        try {
          console.log(`Trying alternative selector: ${selector}`);
          await this.page.waitForSelector(selector, { timeout: 2000, state: 'visible' });
          // Verify this is actually a name input by checking if it's visible and not disabled
          const element = await this.page.$(selector);
          if (element) {
            const isVisible = await element.isVisible();
            const isEnabled = await element.isEnabled();
            if (isVisible && isEnabled) {
              nameFieldSelector = selector;
              foundField = true;
              console.log(`Found working name field selector: ${selector}`);
              break;
            } else {
              console.log(`Alternative selector ${selector} found but not interactable (visible: ${isVisible}, enabled: ${isEnabled})`);
            }
          }
        } catch (error) {
          console.log(`Alternative selector ${selector} failed: ${error}`);
          continue;
        }
      }
    }

    if (!foundField || !nameFieldSelector) {
      // Take a screenshot for debugging
      try {
        await this.page.screenshot({ path: '/tmp/debug_no_name_field.png', fullPage: true });
        console.log("Debug screenshot saved to /tmp/debug_no_name_field.png");
      } catch (screenshotError) {
        console.log("Could not take debug screenshot:", screenshotError);
      }

      throw new Error("Could not find any working name input field after trying all selectors");
    }

    console.log("Found name field. Waiting for 1 second...");
    await this.page.waitForTimeout(randomDelay(1000));

    console.log("Filling the input field with the name...");
    await this.page.fill(nameFieldSelector, name);

    console.log('Turning Off Camera and Microphone ...');
    try {
      await this.page.waitForTimeout(randomDelay(500));
      await this.page.click(muteButton, { timeout: 200 });
      await this.page.waitForTimeout(200);

    } catch (e) {
      console.log('Could not turn off Microphone, probably already off.');
    }
    try {
      await this.page.click(cameraOffButton, { timeout: 200 });
      await this.page.waitForTimeout(200);

    } catch (e) {
      console.log('Could not turn off Camera -- probably already off.');
    }

    console.log('Waiting for either the "Join now" or "Ask to join" button to appear...');
    const entryButton = await Promise.race([
      this.page.waitForSelector(joinNowButton, { timeout: 60000 }).then(() => joinNowButton),
      this.page.waitForSelector(askToJoinButton, { timeout: 60000 }).then(() => askToJoinButton),
    ]);

    await this.page.click(entryButton);

    //Should Exit after 1 Minute
    console.log("Awaiting Entry ....");
    const timeout = this.settings.automaticLeave.waitingRoomTimeout; // in milliseconds

    // Wait for admission to the meeting (not just the waiting room)
    // The People button only appears after being admitted to the actual meeting
    // IMPORTANT: We wait specifically for People button (not captions) because:
    // 1. We need it anyway for participant tracking in meetingActions()
    // 2. Avoids circular dependency where we detect admission with one button but need another
    // 3. Ensures People button is ready when we try to click it later
    try {
      console.log("Waiting to be admitted to the meeting...");
      console.log("Specifically waiting for People button to ensure it's ready for participant tracking...");

      // Wait for People button with full waiting room timeout
      await this.page.waitForSelector(peopleButton, { timeout: timeout });

      console.log("✅ Admitted to meeting - People button detected and ready");
    } catch (e) {
      console.error("❌ Timeout waiting to be admitted to meeting - still in waiting room");
      console.error("People button did not appear within waiting room timeout period");
      // Timeout Error: Will get caught by bot/index.ts
      throw new WaitingRoomTimeoutError();
    }

    //Done. Log.
    console.log("Joined Call.");
    await this.onEvent(EventCode.JOINING_CALL);

    //Done.
    return 0;
  }

  /**
   * Get FFmpeg parameters optimized for smooth, high-quality audio recording
   * Fixes choppy audio issues caused by buffer underruns and CPU contention
   */
  getFFmpegParams() {

    // For Testing (pnpm test) -- no docker x11 server running.
    if (!fs.existsSync('/tmp/.X11-unix')) {
      console.log('Using test ffmpeg params for audio-only')
      return [
        '-y',
        '-f', 'lavfi',
        '-i', 'sine=frequency=1000:duration=30', // Generate test audio tone
        '-c:a', 'aac',
        '-b:a', '64k',
        this.getRecordingPath()
      ]
    }

    // Audio-only recording parameters optimized for reliability and quality
    console.log('Loading Dockerized FFMPEG Params for Audio-Only Recording (AAC Format) ...')

    const audioInputFormat = "pulse";
    const audioSource = "default";

    // IMPROVED: Optimized parameters to prevent choppy audio
    const audioBitrate = process.env.AUDIO_BITRATE || "96k"; // Increased from 64k for better quality
    const sampleRate = process.env.AUDIO_SAMPLE_RATE || "44100"; // Increased from 22050 for smoother audio
    const channels = process.env.AUDIO_CHANNELS || "1"; // Mono - sufficient for speech
    const threadQueueSize = process.env.THREAD_QUEUE_SIZE || "4096"; // INCREASED from 1024 to prevent underruns
    const bufferSize = process.env.BUFFER_SIZE || "2048k"; // INCREASED from 512k for stability

    console.log(`Audio settings: bitrate=${audioBitrate}, sampleRate=${sampleRate}, channels=${channels}, queueSize=${threadQueueSize}, bufferSize=${bufferSize}`);

    return [
      '-v', 'warning', // Less verbose logging to reduce CPU overhead

      // CRITICAL: Larger thread queue prevents buffer underruns during CPU spikes
      "-thread_queue_size", threadQueueSize,

      // PulseAudio-specific optimizations
      "-probesize", "50M", // Increased from 32M for better stream detection
      "-analyzeduration", "5M", // Changed from 0 to allow better sync (prevents choppy audio)

      // Input configuration
      "-f", audioInputFormat,
      "-i", audioSource,

      // CRITICAL: Use async mode to prevent blocking
      "-async", "1", // Enables audio sync compensation

      // Codec settings
      "-c:a", "aac", // AAC codec for better compression and quality
      "-b:a", audioBitrate, // Increased bitrate for smoother audio
      "-ac", channels, // Audio channels
      "-ar", sampleRate, // Increased sample rate

      // IMPROVED: More gentle audio filtering to preserve quality
      "-af", "highpass=f=80,lowpass=f=10000,aresample=async=1", // Added async resampling

      // CRITICAL: Larger buffer prevents choppy audio during system load
      "-buffer_size", bufferSize,

      // Additional stability parameters
      "-flush_packets", "1", // Flush packets immediately
      "-fflags", "+genpts+igndts", // Generate PTS, ignore DTS for better sync

      "-y", this.getRecordingPath(), // Output file path
    ];
  }

  /**
   * Log system resources to help diagnose audio recording issues
   */
  logSystemResources() {
    try {
      const os = require('os');

      // CPU Information
      const cpuCount = os.cpus().length;
      const loadAvg = os.loadavg();

      // Memory Information
      const totalMem = Math.round(os.totalmem() / 1024 / 1024 / 1024 * 100) / 100; // GB
      const freeMem = Math.round(os.freemem() / 1024 / 1024 / 1024 * 100) / 100; // GB
      const usedMem = Math.round((totalMem - freeMem) * 100) / 100; // GB
      const memUsagePercent = Math.round((usedMem / totalMem) * 100);

      console.log('📊 SYSTEM RESOURCES:');
      console.log(`   CPU Cores: ${cpuCount}`);
      console.log(`   Load Average: ${loadAvg[0].toFixed(2)}, ${loadAvg[1].toFixed(2)}, ${loadAvg[2].toFixed(2)}`);
      console.log(`   Memory: ${usedMem}GB / ${totalMem}GB (${memUsagePercent}%)`);
      console.log(`   Free Memory: ${freeMem}GB`);

      // Warning thresholds
      if (memUsagePercent > 80) {
        console.warn('⚠️  HIGH MEMORY USAGE - May cause choppy audio recording');
      }
      if (loadAvg[0] > cpuCount) {
        console.warn('⚠️  HIGH CPU LOAD - May cause choppy audio recording');
      }
      if (freeMem < 0.5) {
        console.warn('⚠️  LOW FREE MEMORY - Consider increasing container memory');
      }

    } catch (error) {
      console.log('Could not read system resources:', error.message);
    }
  }

  /**
   * Starts the recording of the call using ffmpeg.
   * 
   * This function initializes an ffmpeg process to capture the screen and audio of the meeting.
   * It ensures that only one recording process is active at a time and logs the status of the recording.
   * 
   * @returns {void}
   */
  async startRecording() {

    console.log('Attempting to start the recording ... @', this.getRecordingPath());
    if (this.ffmpegProcess) return console.log('Recording already started.');

    // Log system resources before starting
    this.logSystemResources();

    this.ffmpegProcess = spawn('ffmpeg', this.getFFmpegParams());

    console.log('Spawned a subprocess to record: pid=', this.ffmpegProcess.pid);

    // Monitor FFmpeg output for quality issues and recording status
    this.ffmpegProcess.stderr.on('data', (data) => {
      const output = data.toString();

      // Log that we got data, and the recording started.
      if (!this.startedRecording) {
        console.log('✅ Recording Started.');
        this.startedRecording = true;
      }

      // Check for audio quality warnings
      if (output.includes('buffer underrun') || output.includes('queue overflow')) {
        console.warn('⚠️ AUDIO BUFFER ISSUE: May cause choppy recording - consider reducing quality settings');
      }
      if (output.includes('dropping') || output.includes('skipped')) {
        console.warn('⚠️ AUDIO FRAMES DROPPED: System may be under high load');
      }
      if (output.includes('real-time factor') && output.includes('< 1')) {
        console.warn('⚠️ SLOW PROCESSING: Real-time factor below 1.0 - system struggling to keep up');
      }

      // Log progress periodically (every ~30 seconds)
      if (output.includes('time=')) {
        const timeMatch = output.match(/time=(\d{2}:\d{2}:\d{2})/);
        if (timeMatch) {
          const recordingTime = timeMatch[1];
          const minutes = parseInt(recordingTime.split(':')[1]);
          if (minutes > 0 && minutes % 1 === 0) { // Log every minute
            console.log(`🎥 Recording progress: ${recordingTime}`);
          }
        }
      }
    });

    // Log Output of stderr
    // Log to console if the env var is set
    // Turn it on if ffmpeg gives a weird error code.
    const logFfmpeg = process.env.MEET_FFMPEG_STDERR_ECHO === 'true'
    if (logFfmpeg ?? false) {
      this.ffmpegProcess.stderr.on('data', (data) => {
        const text = data.toString();
        console.error(`ffmpeg stderr: ${text}`);
      });
    }

    // Report when the process exits
    this.ffmpegProcess.on('exit', (code) => {
      console.log(`ffmpeg exited with code ${code}`);
      this.ffmpegProcess = null;
    });

    console.log('Started FFMPEG Process.')
  }

  /**
   * Fix AAC metadata corruption by re-muxing the file
   * This recalculates duration and fixes corrupted headers
   * @param inputPath Path to the AAC file
   * @returns Path to the fixed file (same as input)
   */
  private async fixAudioMetadata(inputPath: string): Promise<string> {
    const outputPath = inputPath.replace('.aac', '_fixed.aac');

    try {
      console.log('[METADATA FIX] Repairing AAC metadata...');

      const { execSync } = require('child_process');

      // Re-mux the AAC file to fix metadata
      // -i: input file
      // -c copy: copy codec without re-encoding (fast)
      // -movflags +faststart: optimize for streaming
      // -avoid_negative_ts make_zero: normalize timestamps
      const command = `ffmpeg -v warning -i "${inputPath}" -c copy -avoid_negative_ts make_zero -movflags +faststart -y "${outputPath}"`;

      console.log(`[METADATA FIX] Running: ${command}`);
      execSync(command, { stdio: 'pipe' });

      // Verify the output file
      if (!fs.existsSync(outputPath)) {
        throw new Error('Metadata fix failed - output file not created');
      }

      // Get duration to verify fix
      const durationOutput = execSync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`,
        { encoding: 'utf8' }
      );

      const duration = parseFloat(durationOutput.trim());
      console.log(`✅ [METADATA FIX] Fixed file duration: ${duration}s (${(duration/60).toFixed(2)} minutes)`);

      // Replace original with fixed version
      fs.unlinkSync(inputPath);
      fs.renameSync(outputPath, inputPath);

      console.log('✅ [METADATA FIX] Successfully repaired AAC metadata');
      return inputPath;

    } catch (error) {
      console.error('❌ [METADATA FIX] Failed to repair metadata:', error);
      // Clean up failed output
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
      // Return original file
      return inputPath;
    }
  }

  /**
   * Validate recording metadata to detect corruption
   * @param filePath Path to the audio file
   * @param expectedMinDuration Minimum expected duration in seconds
   * @returns true if metadata looks valid, false if likely corrupt
   */
  private async validateRecordingMetadata(filePath: string, expectedMinDuration: number = 60): Promise<boolean> {
    try {
      const { execSync } = require('child_process');
      const durationOutput = execSync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
        { encoding: 'utf8' }
      );

      const duration = parseFloat(durationOutput.trim());

      // Check for obviously corrupt durations
      if (isNaN(duration)) {
        console.error(`❌ [VALIDATION] Invalid duration: ${durationOutput}`);
        return false;
      }

      if (duration < expectedMinDuration) {
        console.warn(`⚠️  [VALIDATION] Duration ${duration}s seems too short (expected > ${expectedMinDuration}s)`);
      }

      // Flag durations over 12 hours as suspicious (likely corrupt)
      if (duration > 12 * 3600) {
        console.error(`❌ [VALIDATION] Duration ${duration}s (${(duration/3600).toFixed(1)} hours) is suspiciously long - likely corrupt metadata`);
        return false;
      }

      console.log(`✅ [VALIDATION] Duration ${duration}s (${(duration/60).toFixed(2)} minutes) looks valid`);
      return true;

    } catch (error) {
      console.error('[VALIDATION] Failed to validate metadata:', error);
      return false;
    }
  }

  /**
   * Stops the ongoing recording if it has been started.
   *
   * This function ensures that the recording process is terminated. It checks if the `ffmpegProcess`
   * exists and, if so, sends a termination signal to stop the recording. If no recording process
   * is active, it logs a message indicating that no recording was in progress.
   *
   * @returns {Promise<number>} - Returns 0 if the recording was successfully stopped.
   */
  async stopRecording() {

    console.log('Attempting to stop the recording ...');

    // Await encoding result
    const promiseResult = await new Promise((resolve) => {

      // No recording
      if (!this.ffmpegProcess) {
        console.log('No recording in progress, cannot end recording.');
        resolve(1);
        return; // exit early
      }

      // Graceful stop with timeout fallback
      console.log('Killing ffmpeg process gracefully with SIGINT...');
      this.ffmpegProcess.kill('SIGINT');
      console.log('Waiting for ffmpeg to finish encoding ...');

      // Set a timeout for forceful termination if graceful stop hangs
      // Use global.setTimeout to avoid conflict with timers/promises import
      const forceKillTimeout = global.setTimeout(() => {
        if (this.ffmpegProcess && !this.ffmpegProcess.killed) {
          console.warn('⚠️ FFmpeg did not exit gracefully after 5s, forcing termination with SIGKILL');
          this.ffmpegProcess.kill('SIGKILL');
        }
      }, 5000);

      // Modify the exit handler to resolve the promise.
      // This will be called when the video is done encoding
      this.ffmpegProcess.on('exit', (code, signal) => {
        global.clearTimeout(forceKillTimeout);

        if (code === 0 || code === null) {
          // code === null means killed by signal (SIGINT), which is expected for graceful stop
          console.log('Recording stopped and file finalized.');
          resolve(0);
        } else if (code === 255) {
          // FFmpeg error code 255 often means input source disconnected (e.g., kicked from meeting)
          console.warn(`⚠️ FFmpeg exited with code 255 - likely audio source disconnected (normal if kicked from meeting)`);
          resolve(1);
        } else {
          console.error(`FFmpeg exited with code ${code}${signal ? ` and signal ${signal}` : ''}`);
          resolve(1);
        }
      });

      // Modify the error handler to resolve the promise.
      this.ffmpegProcess.on('error', (err) => {
        global.clearTimeout(forceKillTimeout);
        console.error('Error while stopping ffmpeg:', err);
        resolve(1);
      });
    });

    // CRITICAL: Always attempt metadata repair, even if FFmpeg crashed
    // When bot gets kicked or FFmpeg exits abnormally (code 255), headers are often corrupted
    try {
      const recordingPath = this.getRecordingPath();

      // Check if recording file exists
      if (!fs.existsSync(recordingPath)) {
        console.warn('⚠️ Recording file does not exist, skipping metadata repair');
        return promiseResult;
      }

      // Validate metadata first
      const isValid = await this.validateRecordingMetadata(recordingPath, 0); // Set min duration to 0 for short recordings

      if (!isValid) {
        console.log('[VALIDATION] Corrupt metadata detected, attempting repair...');
        await this.fixAudioMetadata(recordingPath);

        // Re-validate after fix
        const isValidAfterFix = await this.validateRecordingMetadata(recordingPath, 0);
        if (!isValidAfterFix) {
          console.error('❌ [VALIDATION] Metadata still corrupt after repair attempt');
        } else {
          console.log('✅ [VALIDATION] Metadata successfully repaired');
        }
      }
    } catch (error) {
      console.warn('⚠️ Metadata validation/repair failed, continuing with original file:', error);
    }

    // Continue
    return promiseResult;
  }

  async screenshot(fName: string = 'screenshot.png') {
    try {
      if (!this.page) throw new Error("Page not initialized");
      if (!this.browser) throw new Error("Browser not initialized");

      const screenshot = await this.page.screenshot({
        type: "png",
      });
      
      // Save the screenshot to a file
      const screenshotPath = path.resolve(`/tmp/${fName}`);
      fs.writeFileSync(screenshotPath, screenshot);
      console.log(`Screenshot saved to ${screenshotPath}`);
    } catch (error) {
      console.log('Error taking screenshot:', error);
    }
  }

  /**
   * Check if we got kicked from the meeting.
   * 
   */
  async checkKicked() {

    // Check if "Return to Home Page" button exists (Kick Condition 1)
    if (await this.page.locator(gotKickedDetector).count().catch(() => 0) > 0) {
      return true;
    }

    // console.log('Checking for hidden leave button ...')
    // Hidden Leave Button (Kick Condition 2)
    if (await this.page.locator(leaveButton).isHidden({ timeout: 500 }).catch(() => true)) {
      return true;
    }

    // console.log('Checking for removed from meeting text ...')
    // Removed from Meeting Text (Kick Condition 3)
    if (await this.page.locator('text="You\'ve been removed from the meeting"').isVisible({ timeout: 500 }).catch(() => false)) {
      return true;
    }

    // Did not get kicked if reached here.
    return false;
  }

  /**
   * Check if a pop-up appeared. If so, close it.
   */
  async handleInfoPopup(timeout = 5000) {
    try {
      await this.page.waitForSelector(infoPopupClick, { timeout });
    } catch (e) {
      return;
    }
    console.log("Clicking the popup...");
    await this.page.click(infoPopupClick);
  }

  /**
   * Check if bot is alone in meeting based on participant list
   * Relies on People Panel data only - no fallback detection methods
   * @returns true if bot is alone (1 participant), false otherwise
   */
  private isAloneInMeeting(): boolean {
    const alone = this.participants.length === 1;
    console.log(`[ALONE CHECK] Participant count: ${this.participants.length} - ${alone ? 'ALONE' : 'NOT ALONE'}`);
    return alone;
  }

  /**
   *
   * Meeting actions of the bot.
   *
   * This function performs the actions that the bot is supposed to do in the meeting.
   * It first waits for the people button to be visible, then clicks on it to open the people panel.
   * It then starts recording the meeting and sets up participant monitoring.
   *
   * Afterwards, It enters a simple loop that checks for end meeting conditions every X seconds.
   * Once detected it's done, it stops the recording and exits.
   *
   * @returns 0
   */
  async meetingActions() {

    // Track when meeting started for absolute timeout
    this.meetingStartedAt = Date.now();

    // Start Recording, Yes by default
    console.log("Starting Recording");
    this.startRecording();
    this.recordingStartedAt = Date.now();

    console.log("Waiting for the 'Others might see you differently' popup...");
    await this.handleInfoPopup();

    try {
      console.log("Attempting to open participants panel...");

      let peopleButtonClicked = false;

      // Strategy 1: Try primary People button selector
      // NOTE: We already waited for this button during admission detection,
      // so it should be immediately available. Using longer timeout for safety.
      try {
        console.log("STRATEGY 1: Trying primary People button selector...");
        console.log("(Button should already be available since we waited for it during admission)");
        await this.page.waitForSelector(peopleButton, { timeout: 5000 });
        await this.page.click(peopleButton);
        peopleButtonClicked = true;
        console.log("✅ STRATEGY 1 SUCCESS: Primary People button clicked successfully");
      } catch (e) {
        console.log("❌ STRATEGY 1 FAILED: Primary People button selector failed:", e.message);
      }

      // Strategy 2: Try alternative selectors
      if (!peopleButtonClicked) {
        console.log("STRATEGY 2: Trying alternative People button selectors...");
        for (let i = 0; i < alternativePeopleSelectors.length; i++) {
          const selector = alternativePeopleSelectors[i];
          try {
            console.log(`STRATEGY 2.${i + 1}: Trying selector: ${selector}`);
            await this.page.waitForSelector(selector, { timeout: 1500 });
            const element = await this.page.$(selector);
            if (element && await element.isVisible() && await element.isEnabled()) {
              await element.click();
              peopleButtonClicked = true;
              console.log(`✅ STRATEGY 2.${i + 1} SUCCESS: People button clicked with selector: ${selector}`);
              break;
            } else {
              console.log(`❌ STRATEGY 2.${i + 1} FAILED: Element not visible/enabled for selector: ${selector}`);
            }
          } catch (e) {
            console.log(`❌ STRATEGY 2.${i + 1} FAILED: Selector ${selector} failed:`, e.message);
            continue;
          }
        }
      }

      // Strategy 3: Google symbols and text-based detection (PROVEN TO WORK)
      if (!peopleButtonClicked) {
        console.log("STRATEGY 3: Trying text-based and icon-based detection...");
        peopleButtonClicked = await this.page.evaluate(() => {
          // Look for buttons that contain "people" icon text
          const peopleButtons = Array.from(document.querySelectorAll("button")).filter(button => {
            const text = button.textContent || '';
            const html = button.innerHTML || '';

            // Check if button contains "people" text or has people icon
            const hasPeopleText = text.toLowerCase().includes('people');
            const hasPeopleIcon = html.includes('>people<') ||
                                  html.includes('people') && (html.includes('google-symbols') || html.includes('<i'));

            return hasPeopleText || hasPeopleIcon;
          });

          // Look for any element containing "people" text and find its parent button
          const peopleTextElements = Array.from(document.querySelectorAll("*"))
            .filter(el => {
              const text = el.textContent?.trim() || '';
              return text === "people" || (text.length < 20 && text.toLowerCase().includes("people"));
            });

          // Combine all candidates (prioritize direct button matches)
          const allCandidates = [...peopleButtons, ...peopleTextElements];

          for (let i = 0; i < allCandidates.length; i++) {
            const element = allCandidates[i];

            // Try multiple levels of parent traversal with null safety
            let current = element;
            for (let level = 0; level < 5; level++) {
              if (!current) {
                break;
              }
              if (current.tagName === 'BUTTON') {
                try {
                  current.click();
                  return true;
                } catch (e) {
                  console.log(`Failed to click button at level ${level}:`, e.message);
                }
              }
              current = current.parentElement;
            }

            // Also try closest method
            const closestButton = element.closest("button");
            if (closestButton) {
              try {
                closestButton.click();
                return true;
              } catch (e) {
                console.log(`Failed to click closest button for candidate ${i}:`, e.message);
              }
            }
          }

          return false;
        });

        if (peopleButtonClicked) {
          console.log("✅ STRATEGY 3 SUCCESS: People button clicked via text-based detection");
        } else {
          console.log("❌ STRATEGY 3 FAILED: Text-based detection could not find People button");
        }
      }

      if (peopleButtonClicked) {
        console.log("🎉 PEOPLE BUTTON DETECTION SUCCESSFUL - Opening participants panel...");
        // Wait for the people panel to be visible
        try {
          await this.page.waitForSelector('[aria-label="Participants"], [data-panel="people"], .participants-panel', {
            timeout: 5000,
          });
          console.log("People panel is now visible");
        } catch (e) {
          console.warn("People panel did not become visible after clicking button:", e.message);
        }
      } else {
        console.warn("❌ ALL STRATEGIES FAILED: Could not find People button after trying all methods");

        // Check if the people panel might already be open
        const isPanelAlreadyOpen = await this.page.evaluate(() => {
          const participantsPanel = document.querySelector('[aria-label="Participants"]');
          return participantsPanel && participantsPanel.offsetParent !== null;
        });

        if (isPanelAlreadyOpen) {
          console.log("ℹ️  People panel appears to be already open - continuing");
        } else {
          console.log("⚠️  Bot will continue without participants panel access");
          console.log("📸 Taking debug screenshot for analysis...");
          // Take a screenshot for debugging
          await this.screenshot('people-button-not-found.png');
        }
      }

    } catch (error) {
      console.warn("Could not click People button. Continuing anyways.", error.message);
    }

    await this.page.exposeFunction("getParticipants", () => {
      return this.participants;
    });

    await this.page.exposeFunction(
      "onParticipantJoin",
      async (participant: Participant) => {
        this.participants.push(participant);
        await this.onEvent(EventCode.PARTICIPANT_JOIN, participant);
      }
    );

    await this.page.exposeFunction(
      "onParticipantLeave",
      async (participant: Participant) => {
        await this.onEvent(EventCode.PARTICIPANT_LEAVE, participant);
        this.participants = this.participants.filter(
          (p) => p.id !== participant.id
        );
        this.timeAloneStarted =
          this.participants.length === 1 ? Date.now() : Infinity;
      }
    );

    await this.page.exposeFunction(
      "registerParticipantSpeaking",
      (participant: Participant) => {
        this.lastActivity = Date.now();
        const relativeTimestamp = Date.now() - this.recordingStartedAt;
        console.log(
          `Participant ${participant.name} is speaking at ${relativeTimestamp}ms`
        );

        if (!this.registeredActivityTimestamps[participant.name]) {
          this.registeredActivityTimestamps[participant.name] = [relativeTimestamp];
        } else {
          this.registeredActivityTimestamps[participant.name]!.push(relativeTimestamp);
        }
      }
    );

    // Add mutation observer for participant list
    // Use in the browser context to monitor for participants joining and leaving
    await this.page.evaluate(() => {
      const peopleList = document.querySelector('[aria-label="Participants"]');
      if (!peopleList) {
        console.error("Could not find participants list element");
        return;
      }

      const initialParticipants = Array.from(peopleList.childNodes).filter(
        (node) => node.nodeType === Node.ELEMENT_NODE
      );
      window.participantArray = [];
      window.mergedAudioParticipantArray = [];

      window.observeSpeech = (node, participant) => {
        console.debug("Observing speech for participant:", participant.name);
        const activityObserver = new MutationObserver((mutations) => {
          mutations.forEach(() => {
            window.registerParticipantSpeaking(participant);
          });
        });
        activityObserver.observe(node, {
          attributes: true,
          subtree: true,
          childList: true,
          attributeFilter: ["class"],
        });
        participant.observer = activityObserver;
      };

      window.handleMergedAudio = () => {
        const mergedAudioNode = document.querySelector(
          '[aria-label="Merged audio"]'
        );
        if (mergedAudioNode) {
          const detectedParticipants: Participant[] = [];
          
          // Gather all participants in the merged audio node
          mergedAudioNode.parentNode!.childNodes.forEach((childNode: any) => {
            const participantId = childNode.getAttribute("data-participant-id");
            if (!participantId) {
              return;
            }
            detectedParticipants.push({
              id: participantId,
              name: childNode.getAttribute("aria-label"),
            });
          });

          // detected new participant in the merged node
          if (
            detectedParticipants.length >
            window.mergedAudioParticipantArray.length
          ) {
            // add them
            const filteredParticipants = detectedParticipants.filter(
              (participant: Participant) =>
                !window.mergedAudioParticipantArray.find(
                  (p: Participant) => p.id === participant.id
                )
            );
            filteredParticipants.forEach((participant: Participant) => {
              const vidBlock = document.querySelector(
                `[data-requested-participant-id="${participant.id}"]`
              );
              window.mergedAudioParticipantArray.push(participant);
              window.onParticipantJoin(participant);
              window.observeSpeech(vidBlock, participant);
              window.participantArray.push(participant);
            });
          } else if (
            detectedParticipants.length <
            window.mergedAudioParticipantArray.length
          ) {
            // some participants no longer in the merged node
            const filteredParticipants =
              window.mergedAudioParticipantArray.filter(
                (participant: Participant) =>
                  !detectedParticipants.find(
                    (p: Participant) => p.id === participant.id
                  )
              );
            filteredParticipants.forEach((participant: Participant) => {
              const videoRectangle = document.querySelector(
                `[data-requested-participant-id="${participant.id}"]`
              );
              if (!videoRectangle) {
                // they've left the meeting
                window.onParticipantLeave(participant);
                window.participantArray = window.participantArray.filter(
                  (p: Participant) => p.id !== participant.id
                );
              }

              // update participants under merged audio
              window.mergedAudioParticipantArray =
                window.mergedAudioParticipantArray.filter(
                  (p: Participant) => p.id !== participant.id
                );
            });
          }
        }
      };

      initialParticipants.forEach((node: any) => {
        const participant = {
          id: node.getAttribute("data-participant-id"),
          name: node.getAttribute("aria-label"),
        };
        if (!participant.id) {
          window.handleMergedAudio();
          return;
        }
        window.onParticipantJoin(participant);
        window.observeSpeech(node, participant);
        window.participantArray.push(participant);
      });

      console.log("Setting up mutation observer on participants list");
      const peopleObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === "childList") {
            mutation.removedNodes.forEach((node: any) => {
              console.log("Removed Node", node);
              if (
                node.nodeType === Node.ELEMENT_NODE &&
                node.getAttribute &&
                node.getAttribute("data-participant-id") &&
                window.participantArray.find(
                  (p: Participant) =>
                    p.id === node.getAttribute("data-participant-id")
                )
              ) {
                console.log(
                  "Participant left:",
                  node.getAttribute("aria-label")
                );
                window.onParticipantLeave({
                  id: node.getAttribute("data-participant-id"),
                  name: node.getAttribute("aria-label"),
                });
                window.participantArray = window.participantArray.filter(
                  (p: Participant) =>
                    p.id !== node.getAttribute("data-participant-id")
                );
              } else if (
                document.querySelector('[aria-label="Merged audio"]')
              ) {
                window.handleMergedAudio();
              }
            });
          }
          mutation.addedNodes.forEach((node: any) => {
            console.log("Added Node", node);
            if (
                node.getAttribute &&
              node.getAttribute("data-participant-id") &&
              !window.participantArray.find(
                (p: Participant) =>
                  p.id === node.getAttribute("data-participant-id")
              )
              ) {
                console.log(
                "Participant joined:",
                  node.getAttribute("aria-label")
                );
                    const participant = {
                      id: node.getAttribute("data-participant-id"),
                      name: node.getAttribute("aria-label"),
                    };
              window.onParticipantJoin(participant);
              window.observeSpeech(node, participant);
              window.participantArray.push(participant);
            } else if (document.querySelector('[aria-label="Merged audio"]')) {
              window.handleMergedAudio();
              }
            });
        });
      });

      peopleObserver.observe(peopleList, { childList: true, subtree: true });
    });

    // Loop -- check for end meeting conditions every second
    console.log("Waiting until a leave condition is fulfilled..");
    while (true) {

      // Safety check: Absolute maximum meeting duration (3 hours)
      const maxMeetingDuration = 3 * 60 * 60 * 1000; // 3 hours in milliseconds
      const meetingDuration = Date.now() - this.meetingStartedAt;
      if (meetingDuration > maxMeetingDuration) {
        console.warn(`⚠️  Meeting duration exceeded ${maxMeetingDuration / 1000 / 60} minutes - forcing exit for safety`);
        break;
      }

      // Check if bot is alone based on participant list (People Panel)
      const isAlone = this.isAloneInMeeting();

      if (isAlone) {
        // Initialize timeAloneStarted if this is the first time we detect being alone
        if (this.timeAloneStarted === Infinity) {
          this.timeAloneStarted = Date.now();
          console.log('Detected bot is now alone in the meeting, starting everyone-left timeout timer');
        }

        const leaveMs = this.settings?.automaticLeave?.everyoneLeftTimeout ?? 30000; // Default to 30 seconds if not set
        const msDiff = Date.now() - this.timeAloneStarted;
        console.log(`Bot detected alone in meeting. Waiting for timeout (${msDiff / 1000}s / ${leaveMs / 1000}s) ...`);

        if (msDiff > leaveMs) {
          console.log('Bot alone for more than allocated time, leaving the meeting.');
          break;
        }
      } else {
        // Reset timer if other participants detected
        if (this.timeAloneStarted !== Infinity) {
          console.log('Other participants detected, resetting everyone-left timeout timer');
          this.timeAloneStarted = Infinity;
        }
      }

      // Got kicked -- no longer in the meeting
      // Check each of the potentials conditions
      if (await this.checkKicked()) {

        console.log('Detected that we were kicked from the meeting.');
        this.kicked = true; //store
        break; //exit loop

      }

      // Check if there has been no activity, case for when only bots stay in the meeting
      if (
        this.participants.length > 1 &&
        this.lastActivity &&
        Date.now() - this.lastActivity > this.settings.automaticLeave.inactivityTimeout
      ) {
        console.log("No Activity for 5 minutes");
        break;
      }

      await this.handleInfoPopup(1000);

      // Reset Loop
      console.log('Waiting 5 seconds.')
      await setTimeout(5000); //5 second loop
    }

    //
    // Exit
    console.log("Starting End Life Actions ...");

    try {
      await this.leaveMeeting();
      return 0;
    } catch (e) {
      await this.endLife();
      return 1;
    }
  }

  /** 
   * Clean up the meeting
   */
  async endLife() {

    // Ensure Recording is done
    console.log('Stopping Recording ...')
    await this.stopRecording();
    console.log('Done.')

    // Close my browser
    if (this.browser) {
      await this.browser.close();
      console.log("Closed Browser.");
    }

  }

  /**
   * 
   * Attempts to leave the meeting -- then cleans up.
   * 
   * @returns {Promise<number>} - Returns 0 if the bot successfully leaves the meeting, or 1 if it fails to leave the meeting.
   */
  async leaveMeeting() {

    // Try and Find the leave button, press. Otherwise, just delete the browser.
    console.log("Trying to leave the call ...")
    try {
      await this.page.click(leaveButton, { timeout: 1000 }); //Short Attempt
      console.log('Left Call.');
    } catch (e) {
      console.log('Attempted to Leave Call - couldn\'t (probably aleready left).')
    }

    console.log('Ending Life ...');
    await this.endLife();
    return 0;
  }
}
