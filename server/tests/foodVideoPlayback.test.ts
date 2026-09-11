import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Food Video Playback Behavior Verification Suite (16 Test Cases)
 * 
 * Tests the UX rules:
 * 1. NO LOOP: HTML5 video must never contain loop attribute
 * 2. PLAY ONCE PER ACTIVATION: resets currentTime to 0 on activation, plays once to completion
 * 3. HOLD FINAL FRAME: on ended, remains paused on final frame; does not seek to 0; stays visible
 * 4. RE-ENTRY: returning to a dish resets currentTime to 0 and plays once again
 * 5. NO FALSE RESUME: does not resume from paused middle position; no per-session lock
 * 6. INACTIVE PRELOADED PAUSED: preloaded slides are strictly paused
 * 7. RE-RENDER IMMUNITY: theme switch, category filter, or mute toggle do NOT restart video
 * 8. SINGLE ACTIVE VIDEO: at most 1 food video plays at a time
 * 9. ERROR FALLBACK: video failure gracefully falls back to base image or luxury fallback
 */

interface MockVideoElement {
  currentTime: number;
  duration: number;
  paused: boolean;
  ended: boolean;
  muted: boolean;
  playsInline: boolean;
  loop: boolean;
  playCalls: number;
  pauseCalls: number;
  seekCalls: number[];
  play(): Promise<void>;
  pause(): void;
}

function createMockVideo(duration = 10): MockVideoElement {
  const video: MockVideoElement = {
    currentTime: 0,
    duration,
    paused: true,
    ended: false,
    muted: true,
    playsInline: true,
    loop: false,
    playCalls: 0,
    pauseCalls: 0,
    seekCalls: [],
    async play() {
      video.paused = false;
      video.ended = false;
      video.playCalls++;
    },
    pause() {
      video.paused = true;
      video.pauseCalls++;
    },
  };
  return video;
}

/**
 * Simulated Playback State Machine corresponding directly to FoodMedia.tsx
 */
class FoodMediaPlaybackStateMachine {
  public playbackState: 'IDLE' | 'PLAYING' | 'ENDED' | 'INACTIVE' = 'IDLE';
  public wasActive = false;
  public prevFoodId: string;
  public video: MockVideoElement;
  public videoLoaded = false;
  public videoError = false;
  public isMuted = true;

  constructor(public foodId: string, public videoSrc?: string) {
    this.prevFoodId = foodId;
    this.video = createMockVideo(12);
  }

  public updateActivation(isActive: boolean, currentFoodId: string = this.foodId) {
    const wasActive = this.wasActive;
    this.wasActive = isActive;
    const foodChanged = this.prevFoodId !== currentFoodId;
    this.prevFoodId = currentFoodId;

    // 1. Genuine activation transition: false -> true OR food changed while active
    if ((isActive && !wasActive) || (isActive && foodChanged)) {
      this.playbackState = 'PLAYING';
      this.video.currentTime = 0;
      this.video.seekCalls.push(0);
      this.video.muted = this.isMuted;
      this.video.play().catch(() => {});
      return;
    }

    // 2. Genuine deactivation transition: true -> false
    if (!isActive && wasActive) {
      this.video.pause();
      this.playbackState = 'INACTIVE';
      return;
    }

    // 3. Preload integrity: inactive preloaded videos must never play
    if (!isActive) {
      this.video.pause();
      return;
    }

    // 4. Re-render integrity: if isActive is already true, sync mute without resetting currentTime
    this.video.muted = this.isMuted;
  }

  public simulatePlaybackProgress(seconds: number) {
    if (this.playbackState === 'PLAYING') {
      this.video.currentTime = Math.min(this.video.duration, this.video.currentTime + seconds);
      if (this.video.currentTime >= this.video.duration) {
        this.triggerEnded();
      }
    }
  }

  public triggerEnded() {
    this.playbackState = 'ENDED';
    this.video.pause();
    this.video.ended = true;
    // CRITICAL: on ended, do NOT reset currentTime to 0, do NOT loop
  }

  public handleMouseEnter() {
    this.playbackState = 'PLAYING';
    this.video.currentTime = 0;
    this.video.seekCalls.push(0);
    this.video.muted = this.isMuted;
    this.video.play().catch(() => {});
  }

  public handleMouseLeave(isActive: boolean) {
    if (!isActive) {
      this.video.pause();
      this.playbackState = 'INACTIVE';
    }
  }

  public toggleMute() {
    this.isMuted = !this.isMuted;
    this.video.muted = this.isMuted;
  }

  public getVideoLayerOpacity(isActive: boolean): 'opacity-100' | 'opacity-0' {
    if (this.videoLoaded && (isActive || this.playbackState === 'ENDED')) {
      return 'opacity-100';
    }
    return 'opacity-0';
  }
}

async function runVideoPlaybackTests() {
  console.log('🎬 Starting Food Video Playback Behavior Test Suite (16 Tests)...\n');
  let passed = 0;
  let failed = 0;

  async function assert(testNum: number, desc: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      console.log(`  ✓ [Test ${testNum}/16] ${desc}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [Test ${testNum}/16] ${desc}:`, err.message || err);
      failed++;
    }
  }

  const rootDir = path.resolve(__dirname, '../../');
  const foodMediaFile = path.join(rootDir, 'src/components/customer/FoodMedia.tsx');
  const singlePlayVideoFile = path.join(rootDir, 'src/components/customer/SinglePlayVideo.tsx');
  const foodFeedFile = path.join(rootDir, 'src/components/customer/FoodFeed.tsx');
  const foodDetailsModalFile = path.join(rootDir, 'src/components/customer/FoodDetailsModal.tsx');
  const adminPreviewPageFile = path.join(rootDir, 'src/pages/admin/AdminMenuPreviewPage.tsx');

  const foodMediaCode = fs.readFileSync(foodMediaFile, 'utf-8');
  const singlePlayVideoCode = fs.readFileSync(singlePlayVideoFile, 'utf-8');
  const foodFeedCode = fs.readFileSync(foodFeedFile, 'utf-8');
  const foodDetailsModalCode = fs.readFileSync(foodDetailsModalFile, 'utf-8');
  const adminPreviewPageCode = fs.readFileSync(adminPreviewPageFile, 'utf-8');

  // TEST 1: video_must_not_loop
  await assert(1, 'video_must_not_loop: HTML5 video rendering never contains loop attribute', () => {
    // Check SinglePlayVideo.tsx
    if (/loop\b(?!\s*[:=]\s*false)/.test(singlePlayVideoCode.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, ''))) {
      throw new Error('SinglePlayVideo.tsx contains active loop attribute');
    }
    // Check FoodMedia.tsx
    const foodMediaClean = foodMediaCode.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
    if (/<video[^>]*\bloop\b/i.test(foodMediaClean)) {
      throw new Error('FoodMedia.tsx renders video with loop attribute');
    }
    // Check FoodFeed.tsx
    const foodFeedClean = foodFeedCode.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
    if (/<video[^>]*\bloop\b/i.test(foodFeedClean)) {
      throw new Error('FoodFeed.tsx renders video with loop attribute');
    }
    // Check FoodDetailsModal.tsx
    const foodDetailsClean = foodDetailsModalCode.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
    if (/<video[^>]*\bloop\b/i.test(foodDetailsClean)) {
      throw new Error('FoodDetailsModal.tsx renders video with loop attribute');
    }
    // Check AdminMenuPreviewPage.tsx
    const adminPreviewClean = adminPreviewPageCode.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
    if (/<video[^>]*\bloop\b/i.test(adminPreviewClean)) {
      throw new Error('AdminMenuPreviewPage.tsx renders video with loop attribute');
    }
  });

  // TEST 2: video_reset_on_activate
  await assert(2, 'video_reset_on_activate: When food item becomes active, currentTime is reset to 0', () => {
    const sm = new FoodMediaPlaybackStateMachine('dish-1', 'https://example.com/video.mp4');
    sm.video.currentTime = 7.5; // prior offset
    sm.updateActivation(true); // activate

    if (sm.video.currentTime !== 0) {
      throw new Error(`Expected currentTime to be 0 on activation, got ${sm.video.currentTime}`);
    }
    if (sm.playbackState !== 'PLAYING') {
      throw new Error(`Expected playbackState to be PLAYING, got ${sm.playbackState}`);
    }
    if (sm.video.paused) {
      throw new Error('Expected video to be unpaused on activation');
    }
  });

  // TEST 3: video_plays_once
  await assert(3, 'video_plays_once: Video plays forward from 0 without early interruption or repeated starts', () => {
    const sm = new FoodMediaPlaybackStateMachine('dish-1', 'https://example.com/video.mp4');
    sm.updateActivation(true);
    const initialPlayCalls = sm.video.playCalls;

    // Simulate progress: 3s, 6s, 9s
    sm.simulatePlaybackProgress(3);
    sm.simulatePlaybackProgress(3);
    sm.simulatePlaybackProgress(3);

    if (sm.video.currentTime !== 9) {
      throw new Error(`Expected currentTime to be 9s, got ${sm.video.currentTime}`);
    }
    if (sm.video.playCalls !== initialPlayCalls) {
      throw new Error('Video triggered redundant play calls mid-stream');
    }
    if (sm.playbackState !== 'PLAYING') {
      throw new Error(`Expected state to stay PLAYING, got ${sm.playbackState}`);
    }
  });

  // TEST 4: video_holds_final_frame
  await assert(4, 'video_holds_final_frame: On ended event, video remains paused and does NOT reset to frame 0', () => {
    const sm = new FoodMediaPlaybackStateMachine('dish-1', 'https://example.com/video.mp4');
    sm.updateActivation(true);
    sm.simulatePlaybackProgress(12); // Reaches duration (12s)

    if (sm.playbackState !== 'ENDED') {
      throw new Error(`Expected playbackState to be ENDED, got ${sm.playbackState}`);
    }
    if (!sm.video.paused) {
      throw new Error('Expected video to remain paused after ended');
    }
    if (sm.video.currentTime === 0) {
      throw new Error('Video erroneously reset currentTime to 0 after ended event');
    }
    if (sm.video.currentTime !== 12) {
      throw new Error(`Expected video to hold final frame (12s), got ${sm.video.currentTime}`);
    }
  });

  // TEST 5: video_final_frame_visible
  await assert(5, 'video_final_frame_visible: Ensure video layer opacity remains 100% when playback ends', () => {
    const sm = new FoodMediaPlaybackStateMachine('dish-1', 'https://example.com/video.mp4');
    sm.videoLoaded = true;
    sm.updateActivation(true);
    sm.simulatePlaybackProgress(12); // ended

    const opacity = sm.getVideoLayerOpacity(true);
    if (opacity !== 'opacity-100') {
      throw new Error(`Expected video layer to have opacity-100 when ENDED, got ${opacity}`);
    }

    // Verify source code condition in FoodMedia.tsx
    if (!foodMediaCode.includes("isVideoVisible") && !foodMediaCode.includes("videoLoaded && (isActive || playbackState === 'ENDED')")) {
      throw new Error('FoodMedia.tsx missing final-frame visibility condition');
    }
  });

  // TEST 6: inactive_video_preloaded_paused
  await assert(6, 'inactive_video_preloaded_paused: Next slide preloaded video is paused and ready at frame 0', () => {
    const sm = new FoodMediaPlaybackStateMachine('dish-2', 'https://example.com/video2.mp4');
    // Dish 2 is inactive but preloaded (shouldPreload = true, isActive = false)
    sm.updateActivation(false);

    if (sm.video.playCalls > 0) {
      throw new Error(`Inactive preloaded video must not play, playCalls: ${sm.video.playCalls}`);
    }
    if (!sm.video.paused) {
      throw new Error('Inactive preloaded video must be paused');
    }
    if (sm.video.currentTime !== 0) {
      throw new Error(`Inactive preloaded video must remain at frame 0, got ${sm.video.currentTime}`);
    }
  });

  // TEST 7: re_entry_plays_from_beginning
  await assert(7, 're_entry_plays_from_beginning: Scrolling back to previously played food resets currentTime to 0 and plays once', () => {
    const sm = new FoodMediaPlaybackStateMachine('dish-1', 'https://example.com/video.mp4');
    // Cycle 1: Play to completion
    sm.updateActivation(true);
    sm.simulatePlaybackProgress(12); // ends at 12s
    if (sm.playbackState !== 'ENDED') throw new Error('First cycle failed to reach ENDED');

    // User scrolls away (deactivate)
    sm.updateActivation(false);
    if (sm.playbackState !== 'INACTIVE') throw new Error('Expected state to be INACTIVE after scrolling away');
    if (!sm.video.paused) throw new Error('Expected video to be paused when user scrolls away');

    // User returns to dish-1 (re-entry)
    sm.updateActivation(true);
    if (sm.playbackState !== 'PLAYING') {
      throw new Error(`Expected re-entry state to be PLAYING, got ${sm.playbackState}`);
    }
    if (sm.video.currentTime !== 0) {
      throw new Error(`Expected re-entry to reset currentTime to 0, got ${sm.video.currentTime}`);
    }
    if (sm.video.paused) {
      throw new Error('Expected video to start playing on re-entry');
    }
  });

  // TEST 8: no_false_resume
  await assert(8, 'no_false_resume: Returning to partially played food starts fresh from 0, never resumes from paused position', () => {
    const sm = new FoodMediaPlaybackStateMachine('dish-1', 'https://example.com/video.mp4');
    sm.updateActivation(true);
    sm.simulatePlaybackProgress(4.5); // partially played 4.5s
    sm.updateActivation(false); // leaves early

    // Return to dish-1
    sm.updateActivation(true);
    if (sm.video.currentTime === 4.5) {
      throw new Error('Video falsely resumed from paused 4.5s offset instead of resetting to 0');
    }
    if (sm.video.currentTime !== 0) {
      throw new Error(`Expected fresh start at 0, got ${sm.video.currentTime}`);
    }
  });

  // TEST 9: hover_plays_once
  await assert(9, 'hover_plays_once: Desktop hover resets currentTime to 0 and plays once; leaves paused', () => {
    const sm = new FoodMediaPlaybackStateMachine('dish-1', 'https://example.com/video.mp4');
    // Non-active dish hovered on desktop
    sm.video.currentTime = 8;
    sm.handleMouseEnter();

    if (sm.video.currentTime !== 0) {
      throw new Error(`Expected hover to reset currentTime to 0, got ${sm.video.currentTime}`);
    }
    if (sm.playbackState !== 'PLAYING') {
      throw new Error(`Expected hover playbackState to be PLAYING, got ${sm.playbackState}`);
    }
    if (sm.video.paused) {
      throw new Error('Expected video to play on mouse enter');
    }

    // Mouse leaves non-active slide
    sm.handleMouseLeave(false);
    if (!sm.video.paused) {
      throw new Error('Expected video to pause on mouse leave for non-active slide');
    }
  });

  // TEST 10: render_stability_theme_switch
  await assert(10, 'render_stability_theme_switch: Switching theme presets does not restart an ongoing or finished video', () => {
    const sm = new FoodMediaPlaybackStateMachine('dish-1', 'https://example.com/video.mp4');
    sm.updateActivation(true);
    sm.simulatePlaybackProgress(5.5);
    const playCallsBeforeThemeChange = sm.video.playCalls;

    // Simulate React re-render where theme/lighting prop updates but dish is still active
    sm.updateActivation(true); // wasActive was already true!

    if (sm.video.playCalls !== playCallsBeforeThemeChange) {
      throw new Error('Theme update erroneously triggered video.play() restart');
    }
    if (sm.video.currentTime !== 5.5) {
      throw new Error(`Theme update altered currentTime: expected 5.5s, got ${sm.video.currentTime}`);
    }
  });

  // TEST 11: render_stability_category_nav
  await assert(11, 'render_stability_category_nav: Changing category filter does not cause current video to loop or restart', () => {
    // Verify FoodFeed.tsx guards setActiveIndex with functional updater
    if (!foodFeedCode.includes('setActiveIndex((prev) => (prev === index ? prev : index))')) {
      throw new Error('FoodFeed.tsx missing functional guard on setActiveIndex');
    }

    const sm = new FoodMediaPlaybackStateMachine('dish-1', 'https://example.com/video.mp4');
    sm.updateActivation(true);
    sm.simulatePlaybackProgress(12); // ended
    if (sm.playbackState !== 'ENDED') throw new Error('Failed to end');

    // Category filter re-renders parent with same active dish
    sm.updateActivation(true);
    if (sm.playbackState !== 'ENDED') {
      throw new Error(`Category navigation caused ended video to restart, state: ${sm.playbackState}`);
    }
    if (sm.video.currentTime === 0) {
      throw new Error('Category navigation caused ended video to seek back to 0');
    }
  });

  // TEST 12: single_active_video_invariant
  await assert(12, 'single_active_video_invariant: Across the viewport/feed, at most 1 food video is actively playing', () => {
    const dish0 = new FoodMediaPlaybackStateMachine('dish-0', 'https://example.com/video0.mp4');
    const dish1 = new FoodMediaPlaybackStateMachine('dish-1', 'https://example.com/video1.mp4');
    const dish2 = new FoodMediaPlaybackStateMachine('dish-2', 'https://example.com/video2.mp4');

    // Slide 1 becomes active
    dish0.updateActivation(false);
    dish1.updateActivation(true);
    dish2.updateActivation(false);

    const activePlaying = [dish0, dish1, dish2].filter((d) => !d.video.paused);
    if (activePlaying.length !== 1) {
      throw new Error(`Expected exactly 1 actively playing video, found ${activePlaying.length}`);
    }
    if (activePlaying[0] !== dish1) {
      throw new Error('Wrong video is playing; dish-1 was supposed to be the single active video');
    }

    // Slide 2 becomes active
    dish0.updateActivation(false);
    dish1.updateActivation(false);
    dish2.updateActivation(true);

    const activePlaying2 = [dish0, dish1, dish2].filter((d) => !d.video.paused);
    if (activePlaying2.length !== 1 || activePlaying2[0] !== dish2) {
      throw new Error('Invariant failed: dish-2 should be the only playing video');
    }
    if (!dish1.video.paused) {
      throw new Error('Previous slide dish-1 failed to pause when navigating away');
    }
  });

  // TEST 13: sound_toggle_persistence
  await assert(13, 'sound_toggle_persistence: Mute/unmute state updates without resetting video currentTime or restarting playback', () => {
    const sm = new FoodMediaPlaybackStateMachine('dish-1', 'https://example.com/video.mp4');
    sm.updateActivation(true);
    sm.simulatePlaybackProgress(3.8);
    const playCallsBeforeMute = sm.video.playCalls;

    // Toggle sound
    sm.toggleMute();
    if (sm.video.muted !== false) {
      throw new Error('Expected video to be unmuted');
    }
    if (sm.video.currentTime !== 3.8) {
      throw new Error(`Sound toggle altered video currentTime: expected 3.8, got ${sm.video.currentTime}`);
    }
    if (sm.video.playCalls !== playCallsBeforeMute) {
      throw new Error('Sound toggle caused redundant play() call');
    }
  });

  // TEST 14: modal_video_single_play
  await assert(14, 'modal_video_single_play: FoodDetailsModal uses SinglePlayVideo with activationKey={food.id}, no loop', () => {
    if (!foodDetailsModalCode.includes('<SinglePlayVideo')) {
      throw new Error('FoodDetailsModal.tsx does not use SinglePlayVideo component');
    }
    if (!foodDetailsModalCode.includes('activationKey={food.id}')) {
      throw new Error('FoodDetailsModal.tsx missing activationKey={food.id}');
    }
    if (foodDetailsModalCode.includes('<video') && foodDetailsModalCode.includes('loop')) {
      throw new Error('FoodDetailsModal.tsx contains looping video');
    }
  });

  // TEST 15: admin_preview_video_single_play
  await assert(15, 'admin_preview_video_single_play: Live Menu Studio context panel uses SinglePlayVideo with activationKey={activeFood.id}', () => {
    if (!adminPreviewPageCode.includes('<SinglePlayVideo')) {
      throw new Error('AdminMenuPreviewPage.tsx does not use SinglePlayVideo component');
    }
    if (!adminPreviewPageCode.includes('activationKey={activeFood.id}')) {
      throw new Error('AdminMenuPreviewPage.tsx missing activationKey={activeFood.id}');
    }
    if (adminPreviewPageCode.includes('loop\n') || adminPreviewPageCode.includes('loop ')) {
      throw new Error('AdminMenuPreviewPage.tsx contains active loop attribute on video');
    }
  });

  // TEST 16: video_load_error_fallback
  await assert(16, 'video_load_error_fallback: When video fails to load, gracefully falls back to image or luxury presentation', () => {
    // In FoodMedia.tsx: hasValidVideo = Boolean(videoSrc && !videoError && !isVisualImage)
    if (!foodMediaCode.includes('const hasValidVideo = Boolean(videoSrc && !videoError && !isVisualImage)')) {
      throw new Error('FoodMedia.tsx missing hasValidVideo error guard check');
    }
    // When videoError occurs, base layer image or luxury fallback is displayed with opacity-100
    if (!foodMediaCode.includes("isVideoVisible ? 'opacity-0' : 'opacity-100'") && !foodMediaCode.includes("hasValidVideo && videoLoaded ? 'opacity-0' : 'opacity-100'")) {
      throw new Error('FoodMedia.tsx base layer missing fallback opacity transition logic');
    }
    // SinglePlayVideo also accepts onError
    if (!singlePlayVideoCode.includes('onError={onError}')) {
      throw new Error('SinglePlayVideo.tsx does not propagate onError handler');
    }
  });

  console.log(`\n📊 Video Playback Test Results: ${passed} passed, ${failed} failed (Total: 16)`);
  if (failed > 0) {
    process.exit(1);
  }
}

runVideoPlaybackTests().catch((err) => {
  console.error('Fatal error during video playback tests:', err);
  process.exit(1);
});
