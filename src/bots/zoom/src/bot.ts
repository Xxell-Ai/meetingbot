import fs from "fs";
import puppeteer, { Page, Frame, ElementHandle } from "puppeteer";
import { launch, getStream, wss } from "puppeteer-stream";
import { BotConfig, EventCode, WaitingRoomTimeoutError, SpeakerTimeframe } from "../../src/types";
import { Bot } from "../../src/bot";
import path from "path";

import { Browser } from "puppeteer";
import { Transform } from "stream";

// Web Search Result: "Multiple fallback strategies" for reliability
// Alternative selectors arrays (from web search: best practice for avoiding detection)
const muteButtonSelectors = [
  '#preview-audio-control-button',
  'button[aria-label*="Mute"]',
  'button[aria-label*="mute" i]',
  'button[title*="Mute"]',
  '.preview-audio-control button',
  'button[data-tooltip*="audio" i]'
];

const stopVideoButtonSelectors = [
  '#preview-video-control-button',
  'button[aria-label*="Stop Video"]',
  'button[aria-label*="video" i]',
  'button[title*="Stop Video"]',
  '.preview-video-control button',
  'button[data-tooltip*="video" i]'
];

const joinButtonSelectors = [
  'button.zm-btn.preview-join-button',
  'button[aria-label*="Join"]',
  'button.join-audio-container__btn',
  'button:has-text("Join")',
  'button[type="button"].join-btn'
];

const leaveButtonSelectors = [
  'button[aria-label="Leave"]',
  'button[aria-label*="Leave"]',
  'button.zm-btn--danger',
  'button:has-text("Leave")',
  'button[title*="Leave"]'
];

const acceptCookiesButton = '#onetrust-accept-btn-handler';
const acceptTermsButton = '#wc_agree1';

export class ZoomBot extends Bot {
  recordingPath: string;
  contentType: string;
  url: string;
  browser!: Browser;
  page!: Page;
  file!: fs.WriteStream;
  stream!: Transform;
  private healthCheckInterval?: NodeJS.Timeout;
  private meetingFrame?: Frame; // Store frame reference to avoid re-querying
  private recordingStopped: boolean = false; // Flag to prevent multiple stop calls

  constructor(
    botSettings: BotConfig,
    onEvent: (eventType: EventCode, data?: any) => Promise<void>
  ) {
    super(botSettings, onEvent);
    // puppeteer-stream outputs WebM (Opus). Server will handle conversion/transcoding.
    this.recordingPath = path.resolve(__dirname, "recording.webm");
    this.contentType = "audio/webm";
    this.url = `https://app.zoom.us/wc/${this.settings.meetingInfo.meetingId}/join?fromPWA=1&pwd=${this.settings.meetingInfo.meetingPassword}`;
  }

  /**
   * Web Search Result: "Exponential Backoff" retry mechanism
   * Source: "The Green Report | Enhancing Automation Reliability with Retry Patterns"
   * "The application should wait a short time before the first retry, and then exponentially increases times between each subsequent retry"
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000,
    operationName: string = 'operation'
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[RETRY] ${operationName}: Attempt ${attempt + 1}/${maxRetries + 1}`);
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (attempt === maxRetries) {
          console.error(`❌ [RETRY] ${operationName} failed after ${maxRetries + 1} attempts`);
          throw lastError;
        }

        // Web Search: "exponentially increases times between each subsequent retry"
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000; // Add jitter
        console.log(`⚠️ [RETRY] ${operationName} failed: ${lastError.message}. Retrying in ${Math.round(delay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }

  /**
   * Web Search Result: "Multiple fallback selector strategies"
   * Source: Best practices from automation research
   * Tries multiple selectors with retry logic and visibility checks
   */
  private async findElementWithFallback(
    frame: Frame,
    selectors: string[],
    elementName: string,
    timeout: number = 5000
  ): Promise<ElementHandle | null> {
    console.log(`[FALLBACK] Searching for ${elementName} with ${selectors.length} fallback selectors`);

    // Strategy 1: Try each selector in order
    for (const selector of selectors) {
      try {
        console.log(`[FALLBACK] Strategy 1 - Trying selector: ${selector}`);
        const element = await frame.waitForSelector(selector, { timeout: 2000 });

        if (element) {
          const isVisible = await element.isVisible();
          const isEnabled = await element.evaluate(el => !el.hasAttribute('disabled'));

          if (isVisible && isEnabled) {
            console.log(`✅ [FALLBACK] Found ${elementName} with selector: ${selector}`);
            return element;
          } else {
            console.log(`⚠️ [FALLBACK] Element found but not ready (visible: ${isVisible}, enabled: ${isEnabled})`);
          }
        }
      } catch (e: any) {
        console.log(`❌ [FALLBACK] Selector failed: ${selector}`);
      }
    }

    // Strategy 2: Polling with multiple state checks (from web search)
    console.log(`[FALLBACK] Strategy 2 - Polling approach for ${elementName}`);
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      for (const selector of selectors) {
        try {
          const element = await frame.$(selector);
          if (element) {
            const isVisible = await element.isVisible();
            const isEnabled = await element.evaluate(el => !el.hasAttribute('disabled'));
            const boundingBox = await element.boundingBox();

            if (isVisible && isEnabled && boundingBox) {
              console.log(`✅ [FALLBACK] Found ${elementName} via polling (attempt ${attempts + 1})`);
              return element;
            }
          }
        } catch (e: any) {
          // Continue to next selector
        }
      }

      await new Promise(r => setTimeout(r, 1000));
      attempts++;
    }

    console.error(`❌ [FALLBACK] Could not find ${elementName} after all strategies`);
    return null;
  }

  /**
   * Web Search Result: System resource logging for debugging
   * Source: Similar to Meet bot implementation, helps diagnose performance issues
   */
  private logSystemResources() {
    try {
      const os = require('os');
      const cpuCount = os.cpus().length;
      const loadAvg = os.loadavg();
      const totalMem = Math.round(os.totalmem() / 1024 / 1024 / 1024 * 100) / 100;
      const freeMem = Math.round(os.freemem() / 1024 / 1024 / 1024 * 100) / 100;
      const usedMem = Math.round((totalMem - freeMem) * 100) / 100;
      const memUsagePercent = Math.round((usedMem / totalMem) * 100);

      console.log('📊 [SYSTEM] Resources:');
      console.log(`   CPU Cores: ${cpuCount}, Load: ${loadAvg[0].toFixed(2)}`);
      console.log(`   Memory: ${usedMem}GB / ${totalMem}GB (${memUsagePercent}%)`);

      if (memUsagePercent > 80) {
        console.warn('⚠️  [SYSTEM] HIGH MEMORY USAGE - May cause issues');
      }
    } catch (error) {
      console.log('[SYSTEM] Could not read system resources:', error);
    }
  }


  async screenshot(fName: string = "screenshot.png") {
    try {
      if (!this.page) throw new Error("Page not initialized");
      if (!this.browser) throw new Error("Browser not initialized");

      const screenshot = await this.page.screenshot({
        type: "png",
        encoding: "binary",
      });

      // Save the screenshot to a file
      const screenshotPath = path.resolve(`/tmp/${fName}`);
      fs.writeFileSync(screenshotPath, screenshot);
      console.log(`Screenshot saved to ${screenshotPath}`);
    } catch (e) {
      console.log('Error taking screenshot:', e);
    }
  }

  /**
   * Web Search Result: Implement kicked detection
   * Source: Best practices from Google Meet bot patterns
   * Checks multiple indicators that the bot has been removed from the meeting
   */
  async checkKicked(): Promise<boolean> {
    if (!this.page) return false;

    try {
      const iframe = await this.page.$(".pwa-webclient__iframe");
      const frame = await iframe?.contentFrame();
      if (!frame) {
        console.log('[KICKED] iFrame is gone - likely kicked');
        return true;
      }

      // Check for various kicked/ended indicators
      const kickedSelectors = [
        'div[aria-label*="removed from"]',
        'div[aria-label*="Meeting is end"]',
        'div[aria-label*="ended"]',
        'button:has-text("Meeting ended")',
        'div:has-text("You have been removed")',
        'div:has-text("removed from the meeting")',
        '.meeting-ended-message'
      ];

      for (const selector of kickedSelectors) {
        try {
          const element = await frame.$(selector);
          if (element && await element.isVisible()) {
            console.log(`[KICKED] Detected via selector: ${selector}`);
            return true;
          }
        } catch (e) {
          // Continue checking
        }
      }

      // Check if leave button is missing (indicator we're no longer in meeting)
      let leaveButtonFound = false;
      for (const selector of leaveButtonSelectors) {
        try {
          const leaveBtn = await frame.$(selector);
          if (leaveBtn && await leaveBtn.isVisible()) {
            leaveButtonFound = true;
            break;
          }
        } catch (e) {
          // Continue
        }
      }

      if (!leaveButtonFound) {
        console.log('[KICKED] Leave button missing - likely kicked or meeting ended');
        return true;
      }

      return false;
    } catch (error) {
      console.warn('[KICKED] Error checking kicked status:', error);
      return false;
    }
  }

  /**
   * Web Search Result: "puppeteer-stream requires using its own launch() function"
   * Source: GitHub Issue #183 - getStream times out if not using puppeteer-stream's launch
   * "The launch() method loads a browser extension required for capturing audio/video streams"
   */
  async launchBrowser() {
    console.log('[BROWSER] Launching with puppeteer-stream and anti-detection...');

    // CRITICAL: Must use puppeteer-stream's launch() instead of puppeteer.launch()
    // puppeteer-stream loads a browser extension required for getStream() to work
    // Without this, getStream() will timeout after 30 seconds
    this.browser = await launch({
      executablePath: puppeteer.executablePath(),
      headless: "new",
      defaultViewport: {
        width: 1920,
        height: 1080,
      },
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--use-fake-device-for-media-stream",
        // Anti-detection args
        "--disable-blink-features=AutomationControlled",
        "--disable-features=IsolateOrigins,site-per-process",
        "--disable-infobars",
        // Custom user agent to appear more human-like
        "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      ],
    }) as unknown as Browser;

    console.log("✅ [BROWSER] Browser launched with puppeteer-stream");

    // Create a URL object from the url
    const urlObj = new URL(this.url);

    // Get the default browser context
    const context = this.browser.defaultBrowserContext();

    // Clear permission overrides and set our own to camera and microphone
    context.clearPermissionOverrides();
    context.overridePermissions(urlObj.origin, ["camera", "microphone"]);
    console.log('✅ [BROWSER] Set camera & mic permissions')

    // Opens a new page in the browser
    this.page = await this.browser.newPage();

    // Web Search Result: "Override navigator.webdriver to avoid detection"
    // Source: "6 Tricks to Avoid Detection With Puppeteer"
    await this.page.evaluateOnNewDocument(() => {
      // Disable navigator.webdriver
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

      // Override navigator.plugins to simulate real plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          { name: 'Chrome PDF Plugin' },
          { name: 'Chrome PDF Viewer' },
          { name: 'Native Client' }
        ],
      });

      // Override navigator.languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en']
      });

      // Web Search: Additional fingerprint masking
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
    });

    console.log('✅ [BROWSER] Anti-detection scripts injected');
  }


  /**
   * Web Search Result: "Try-Catch-Finally Pattern" for comprehensive error handling
   * Source: "Best practices include modular design and implementing robust error handling mechanisms"
   * "The Try/Catch block is a powerful mechanism for error handling"
   *
   * Opens a browser and navigates to join the meeting with retry and fallback strategies.
   * @returns {Promise<void>}
   */
  async joinMeeting() {
    let frame: Frame | null = null;

    try {
      console.log('[JOIN] Starting Zoom meeting join process...');

      // Web Search: Retry with exponential backoff
      // Launch browser with retry
      await this.retryWithBackoff(
        () => this.launchBrowser(),
        2,
        1000,
        'Browser launch'
      );

      const page = this.page;
      const urlObj = new URL(this.url);

      // Navigate to meeting URL with retry
      console.log("[JOIN] Attempting to open meeting link");
      await this.retryWithBackoff(
        async () => {
          await page.goto(urlObj.href, {
            waitUntil: 'networkidle0',
            timeout: 30000
          });
        },
        2,
        2000,
        'Page navigation'
      );
      console.log("✅ [JOIN] Page opened");

      // Wait for iframe with retry
      console.log('[JOIN] Waiting for iFrame to load')
      const iframe = await this.retryWithBackoff(
        () => page.waitForSelector(".pwa-webclient__iframe", { timeout: 10000 }),
        3,
        1000,
        'iFrame detection'
      );

      frame = (await iframe?.contentFrame()) ?? null;
      console.log("✅ [JOIN] Opened iFrame");

      if (!frame) {
        throw new Error('[JOIN] Failed to get iframe content frame');
      }

      // Web Search: "Graceful degradation" - Continue even if non-critical steps fail

      // Handle cookies modal (non-critical)
      try {
        await frame.waitForSelector(acceptCookiesButton, { timeout: 2000 });
        await frame.click(acceptCookiesButton);
        console.log('✅ [JOIN] Cookies Accepted');
      } catch (error) {
        console.log('ℹ️  [JOIN] Cookies modal not found (OK)');
      }

      // Handle TOS modal (non-critical)
      try {
        await frame.waitForSelector(acceptTermsButton, { timeout: 2000 });
        await frame.click(acceptTermsButton);
        console.log('✅ [JOIN] TOS Accepted');
      } catch (error) {
        console.log('ℹ️  [JOIN] TOS modal not found (OK)');
      }

      // Web Search Result: Use fallback selectors instead of fixed timeout
      // Mute audio with fallback strategies (critical)
      console.log('[JOIN] Muting audio...');
      const muteButton = await this.findElementWithFallback(
        frame,
        muteButtonSelectors,
        'Mute button'
      );

      if (muteButton) {
        await muteButton.click();
        console.log("✅ [JOIN] Muted");
      } else {
        console.warn("⚠️  [JOIN] Could not mute - continuing anyway");
      }

      // Stop video with fallback strategies (critical)
      console.log('[JOIN] Stopping video...');
      const stopVideoButton = await this.findElementWithFallback(
        frame,
        stopVideoButtonSelectors,
        'Stop video button'
      );

      if (stopVideoButton) {
        await stopVideoButton.click();
        console.log("✅ [JOIN] Stopped video");
      } else {
        console.warn("⚠️  [JOIN] Could not stop video - continuing anyway");
      }

      // Enter name with retry
      console.log('[JOIN] Entering bot name...');
      await this.retryWithBackoff(
        async () => {
          await frame!.waitForSelector("#input-for-name", { timeout: 5000 });
          await frame!.type("#input-for-name", this.settings?.botDisplayName ?? "Meeting Bot");
        },
        2,
        1000,
        'Name entry'
      );
      console.log("✅ [JOIN] Typed name");

      // Click join button with fallback strategies
      console.log('[JOIN] Clicking join button...');
      const joinBtn = await this.findElementWithFallback(
        frame,
        joinButtonSelectors,
        'Join button'
      );

      if (!joinBtn) {
        throw new Error('[JOIN] Could not find join button with any fallback strategy');
      }

      await joinBtn.click();
      console.log("✅ [JOIN] Clicked join button");

      // Wait for join confirmation with fallback selectors
      console.log('[JOIN] Waiting for join confirmation...');
      try {
        // Web Search Finding: "Race conditions in Zoom Web SDK's join-meeting procedure
        // can cause bots to get stuck in the joining state"
        // Solution: Use waitForFunction to check for join confirmation
        let joinConfirmed = false;
        const maxWait = this.settings.automaticLeave.waitingRoomTimeout;
        const startTime = Date.now();

        // Strategy 1: Use waitForFunction for more reliable detection
        try {
          console.log('[JOIN] Using waitForFunction for join confirmation...');
          await frame.waitForFunction(
            (selectors) => {
              // Check if any leave button selector is visible
              for (const selector of selectors) {
                const element = document.querySelector(selector);
                if (element && element instanceof HTMLElement) {
                  const isVisible = element.offsetParent !== null;
                  if (isVisible) {
                    return true;
                  }
                }
              }
              return false;
            },
            { timeout: Math.min(10000, maxWait) },
            leaveButtonSelectors
          );

          joinConfirmed = true;
          console.log('✅ [JOIN] Join confirmed via waitForFunction');

        } catch (e) {
          console.log('[JOIN] waitForFunction failed, trying selector polling...');

          // Strategy 2: Fallback to selector polling
          while (!joinConfirmed && (Date.now() - startTime < maxWait)) {
            for (const selector of leaveButtonSelectors) {
              try {
                const leaveBtn = await frame.waitForSelector(selector, { timeout: 2000 });
                if (leaveBtn && await leaveBtn.isVisible()) {
                  joinConfirmed = true;
                  console.log(`✅ [JOIN] Join confirmed via selector: ${selector}`);
                  break;
                }
              } catch (e) {
                // Try next selector
              }
            }

            if (!joinConfirmed) {
              // Web Search: Add delay to handle race conditions
              await new Promise(r => setTimeout(r, 1000));
            }
          }
        }

        if (!joinConfirmed) {
          console.error('[JOIN] Join not confirmed within timeout period');
          throw new WaitingRoomTimeoutError();
        }

      } catch (error) {
        if (error instanceof WaitingRoomTimeoutError) {
          throw error;
        }
        console.error('[JOIN] Join confirmation error:', error);
        throw new WaitingRoomTimeoutError();
      }

      console.log("✅ [JOIN] Successfully joined meeting, ready to start recording");

      // Store frame reference for use in run() method
      this.meetingFrame = frame;

      await this.onEvent(EventCode.JOINING_CALL);

    } catch (error) {
      console.error("❌ [JOIN] Failed to join Zoom meeting:", error);

      // Web Search: "Take screenshot for debugging when errors occur"
      if (this.page) {
        await this.screenshot('zoom-join-failure.png').catch(console.error);
      }

      throw error;

    } finally {
      // Web Search Result: "Finally action enables you to execute actions after Try and Catch"
      // "The best place to do cleanup operations"
      console.log('[JOIN] Join attempt completed');

      // Log system resources for debugging
      this.logSystemResources();
    }
  }

  /**
   * Start Recording the meeting.
   * Web Search Finding: Must use puppeteer-stream's launch() for getStream() to work
   * Source: GitHub issue #183 and npm documentation
   */
  async startRecording() {
    // Check if the page is initialized
    if (!this.page) throw new Error("Page not initialized");

    console.log('[RECORDING] Starting recording stream...');

    try {
      // Web Search Finding: "puppeteer-stream requires using launch() from puppeteer-stream
      // instead of puppeteer.launch() or puppeteer-extra.launch()"
      // The launch() function loads a browser extension required for getStream() to work
      // Without it, getStream() will timeout after 30 seconds

      console.log('[RECORDING] Creating audio-only stream...');

      // Changed to audio-only to match Meet bot (smaller files, sufficient for transcription)
      const stream = await getStream(this.page as any, {
        audio: true,
        video: false, // Audio-only like Meet bot
        mimeType: 'audio/webm;codecs=opus', // Audio-only WebM with Opus codec
        // Optional: startDelay can help with rare ERR_BLOCKED_BY_CLIENT errors (default is 250ms)
        // Optional: closeDelay can help with rare TargetCloseError issues
        frameSize: 20 // Reduce frame size for better performance
      });

      this.stream = stream;
      console.log('[RECORDING] Stream created successfully');

      // Write recording to WebM file (server will post-process)
      this.file = fs.createWriteStream(this.recordingPath);
      this.stream.pipe(this.file);

      console.log('✅ [RECORDING] Recording started successfully (saving to WebM file)');

    } catch (error) {
      console.error('❌ [RECORDING] Failed to start recording:', error);
      console.error('[RECORDING] Error details:', JSON.stringify(error, null, 2));
      throw new Error(`Failed to start recording: ${error}`);
    }
  }

  /**
   * Stop Recording the meeting.
   */
  async stopRecording() {
    // Prevent multiple calls to stopRecording
    if (this.recordingStopped) {
      console.log('[RECORDING] Already stopped, skipping duplicate stop call');
      return;
    }
    this.recordingStopped = true;

    console.log('[RECORDING] Stopping recording...');

    // End the recording and close the file
    if (this.stream) {
      this.stream.destroy();
      console.log('[RECORDING] Stream destroyed');
    }

    // Wait a bit for file to be fully written
    await new Promise(resolve => setTimeout(resolve, 1000));
  }


  /**
   * Web Search Result: "Establish a centralized logging system and health checks"
   * Source: "Best practices for automation error handling and monitoring"
   * Runs the bot with comprehensive health monitoring
   */
  async run() {
    try {
      console.log('[RUN] Starting Zoom bot execution...');

      // Navigate and join the meeting.
      await this.joinMeeting();

      // Ensure browser exists
      if (!this.browser)
        throw new Error("Browser not initialized");

      if (!this.page)
        throw new Error("Page is not initialized");

      // Use the stored frame reference from joinMeeting() instead of re-querying
      if (!this.meetingFrame) {
        console.error('[RUN] Meeting frame not available from joinMeeting, attempting to retrieve...');

        // Web Search Solution: Use waitForFunction for iframe detection (from Stack Overflow)
        // "When automating Zoom with Puppeteer, the normal waitForSelector was timing out
        // due to quirks with iframes, requiring the use of waitForFunction"
        try {
          console.log('[RUN] Using waitForFunction for iframe detection...');
          await this.page.waitForFunction(
            () => {
              const iframe = document.querySelector('.pwa-webclient__iframe') as HTMLIFrameElement;
              return iframe && iframe.contentDocument;
            },
            { timeout: 10000 }
          );

          const iframe = await this.page.$('.pwa-webclient__iframe');
          this.meetingFrame = await iframe?.contentFrame() || undefined;

          if (!this.meetingFrame) {
            // Final fallback: Use retry with backoff
            const iframeRetry = await this.retryWithBackoff(
              () => this.page.waitForSelector(".pwa-webclient__iframe", { timeout: 5000 }),
              2,
              1000,
              'Getting meeting iframe (retry)'
            );

            this.meetingFrame = await iframeRetry?.contentFrame() || undefined;
          }

        } catch (e) {
          console.error('[RUN] All iframe detection strategies failed:', e);
          throw new Error('[RUN] Failed to get meeting frame after all attempts');
        }

        if (!this.meetingFrame) {
          throw new Error('[RUN] Failed to get meeting frame');
        }
      }

      const frame = this.meetingFrame;
      console.log('✅ [RUN] Using meeting frame reference');

      // Start the recording
      // Note: startDelay parameter in getStream handles the delay internally
      console.log('[RUN] Starting recording...');
      await this.startRecording();
      console.log("✅ [RUN] Recording started");

      // Web Search Result: "Implement health checks during recording"
      // Source: "Periodic verification the bot is still in meeting"
      this.startHealthChecks(frame);

      // Constantly check if the meeting has ended every second
      const checkMeetingEnd = () => new Promise<void>((resolve, reject) => {
        const poll = async () => {
          try {
            // Web Search: Use multiple selectors for meeting end detection
            const endSelectors = [
              'div[aria-label="Meeting is end now"] button.zm-btn.zm-btn-legacy.zm-btn--primary.zm-btn__outline--blue',
              'button:has-text("OK")',
              'div[aria-label*="ended"] button'
            ];

            for (const selector of endSelectors) {
              try {
                const okButton = await frame?.waitForSelector(selector, { timeout: 1000 });

                if (okButton) {
                  console.log(`[RUN] Meeting ended detected via: ${selector}`);

                  // Click the button to leave the meeting
                  await okButton.click();

                  // Stop Recording and cleanup
                  await this.endLife();

                  resolve();
                  return;
                }
              } catch (e) {
                // Try next selector
              }
            }

            // Schedule next iteration
            setTimeout(poll, 1000);
          } catch (err) {
            // @ts-ignore
            if (err?.name === "TimeoutError") {
              setTimeout(poll, 1000);
            } else {
              reject(err);
            }
          }
        };

        poll();
      });

      // Web Search Result: Check if meeting is still running with fallback selectors
      const checkIfMeetingRunning = () => new Promise<void>((resolve, reject) => {
        const poll = async () => {
          try {
            // Use fallback selectors array
            let leaveButtonFound = false;

            console.log('[RUN] Checking if meeting is still active (checking leave button)...');
            for (const selector of leaveButtonSelectors) {
              try {
                // Increased from 700ms to 5000ms to avoid false positives when page is under load
                const leaveButtonEl = await frame?.waitForSelector(selector, { timeout: 5000 });

                if (leaveButtonEl && await leaveButtonEl.isVisible()) {
                  leaveButtonFound = true;
                  console.log(`[RUN] ✓ Leave button found via selector: ${selector}`);
                  break;
                }
              } catch (e) {
                // Try next selector - this is normal, don't log as error
                console.log(`[RUN] Selector not found (trying next): ${selector}`);
              }
            }

            if (leaveButtonFound) {
              console.log('[RUN] ✓ Meeting confirmed active, will check again in 60 seconds');
              setTimeout(poll, 60000);
            } else {
              console.error("[RUN] ✗ Meeting ended - leave button not found with any selector after checking all options");

              // Only call endLife (it will call stopRecording internally)
              await this.endLife();

              resolve();
            }
          } catch (err) {
            // @ts-ignore
            if (err?.name === "TimeoutError") {
              console.error("[RUN] Meeting ended unexpectedly - timeout");

              // Only call endLife (it will call stopRecording internally)
              await this.endLife();

              resolve();
            } else {
              reject(err);
            }
          }
        };

        poll();
      });

      // Start both meeting end checks in parallel
      await Promise.race([
        checkMeetingEnd(),
        checkIfMeetingRunning()
      ]);

    } catch (error) {
      console.error('[RUN] Bot execution failed:', error);
      throw error;
    } finally {
      // Web Search: "Finally for cleanup operations"
      this.stopHealthChecks();
      console.log('[RUN] Bot execution completed');
    }
  }

  /**
   * Web Search Result: "Health checks and monitoring during recording"
   * Source: "Periodic verification improves reliability"
   * Starts periodic health checks during the meeting
   */
  private startHealthChecks(frame: Frame) {
    console.log('[HEALTH] Starting health check monitoring (every 10 seconds)...');

    this.healthCheckInterval = setInterval(async () => {
      try {
        // Check if we're kicked
        const kicked = await this.checkKicked();
        if (kicked) {
          console.log('[HEALTH] ⚠️  Detected we were kicked from meeting');
          clearInterval(this.healthCheckInterval);
          // Only call endLife (it will call stopRecording internally)
          await this.endLife();
          return;
        }

        // Check browser/page still exists
        if (!this.browser || !this.page) {
          console.error('[HEALTH] ⚠️  Browser or page lost');
          clearInterval(this.healthCheckInterval);
          await this.endLife();
          return;
        }

        // Check stream is still active
        if (this.stream && this.stream.destroyed) {
          console.error('[HEALTH] ⚠️  Recording stream destroyed');
        }

        // Log system resources every 10 seconds
        this.logSystemResources();

      } catch (error) {
        console.error('[HEALTH] Health check failed:', error);
      }
    }, 10000); // Check every 10 seconds
  }

  /**
   * Stops health check monitoring
   */
  private stopHealthChecks() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      console.log('[HEALTH] Health check monitoring stopped');
    }
  }

  // Get the path to the recording file
  getRecordingPath(): string {
    return this.recordingPath;
  }

  getSpeakerTimeframes(): SpeakerTimeframe[] {
    // TODO: Implement this
    return []
  }

  // Get the content type of the recording file
  getContentType(): string {
    return this.contentType;
  }

  /**
   * Clean Resources, close the browser.
   * Ensure the filestream is closed as well.
   */
  async endLife() {
    console.log('[CLEANUP] Starting cleanup process...');

    // Ensure Recording is stopped in unideal situations
    await this.stopRecording();

    // Close File if it exists
    if (this.file) {
      try {
        this.file.close();
        this.file = null as any;
        console.log('[CLEANUP] File stream closed');
      } catch (error) {
        console.error('[CLEANUP] Error closing file:', error);
      }
    }

    // Close Browser
    if (this.browser) {
      try {
        console.log('[CLEANUP] Closing browser...');
        await this.browser.close();
        console.log('[CLEANUP] Browser closed successfully');
      } catch (error) {
        console.error('[CLEANUP] Error closing browser (non-fatal):', error);
      }

      // Close the websocket server with timeout
      try {
        console.log('[CLEANUP] Closing websocket server...');
        const wssInstance = await Promise.race([
          wss,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('WSS timeout')), 5000)
          )
        ]);
        (wssInstance as any).close();
        console.log('[CLEANUP] Websocket server closed');
      } catch (error) {
        console.error('[CLEANUP] Error closing websocket (non-fatal):', error);
      }
    }

    console.log('[CLEANUP] Cleanup completed');
  }
}
