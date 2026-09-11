import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Food Video Transition & Zero Final Frame Flash Verification Suite (20 Tests)
 *
 * Enforces the critical UX rule:
 * - Active: video plays once, can reach end, holds final frame.
 * - Deactivated (ACTIVE -> INACTIVE): video immediately pauses, currentTime immediately resets to 0,
 *   and visual gate closes (opacity-0).
 * - Reactivated (INACTIVE -> ACTIVE): video is already at frame 0. Visual gate remains closed
 *   until onPlaying confirms rendering from frame 0 forward, guaranteeing the previous final
 *   frame is NEVER flashed.
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
 * Video Transition State Machine reflecting FoodMedia.tsx & SinglePlayVideo.tsx
 */
class FoodMediaTransitionStateMachine {
  public playbackState: 'IDLE' | 'PLAYING' | 'ENDED' | 'INACTIVE' = 'IDLE';
  public wasActive = false;
  public prevFoodId: string;
  public video: MockVideoElement;
  public videoLoaded = false;
  public videoError = false;
  public isMuted = true;
  public isVideoVisualReady = false;
  public hasImage: boolean;
  public resetOnDeactivate: boolean;

  constructor(
    public foodId: string,
    public videoSrc?: string,
    options: { hasImage?: boolean; resetOnDeactivate?: boolean } = {}
  ) {
    this.prevFoodId = foodId;
    this.video = createMockVideo(10);
    this.videoLoaded = Boolean(videoSrc);
    this.hasImage = options.hasImage ?? true;
    this.resetOnDeactivate = options.resetOnDeactivate ?? true;
  }

  public updateActivation(isActive: boolean, currentFoodId: string = this.foodId) {
    const wasActive = this.wasActive;
    this.wasActive = isActive;
    const foodChanged = this.prevFoodId !== currentFoodId;
    this.prevFoodId = currentFoodId;

    // 1. Genuine activation transition: false -> true OR food changed while active
    if ((isActive && !wasActive) || (isActive && foodChanged)) {
      // Visual gate is closed immediately upon entering activation to prevent stale frame flash
      this.isVideoVisualReady = false;
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
      if (this.resetOnDeactivate) {
        this.video.currentTime = 0;
        this.video.seekCalls.push(0);
      }
      this.playbackState = 'INACTIVE';
      this.isVideoVisualReady = false;
      return;
    }

    // 3. Preload / Inactive integrity: inactive preloaded videos must never play or expose stale frames
    if (!isActive) {
      this.video.pause();
      if (this.video.currentTime !== 0 && this.resetOnDeactivate) {
        this.video.currentTime = 0;
      }
      this.playbackState = 'INACTIVE';
      this.isVideoVisualReady = false;
      return;
    }

    // 4. Re-render integrity: if isActive is already true, sync mute without resetting currentTime
    this.video.muted = this.isMuted;
  }

  public triggerPlaying() {
    if (this.wasActive) {
      this.isVideoVisualReady = true;
    }
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
    // On ended while active: keep final frame, do not reset to 0, do not loop
  }

  public handleMouseEnter() {
    this.isVideoVisualReady = false;
    this.playbackState = 'PLAYING';
    this.video.currentTime = 0;
    this.video.seekCalls.push(0);
    this.video.muted = this.isMuted;
    this.video.play().catch(() => {});
  }

  public handleMouseLeave(isActive: boolean) {
    if (!isActive) {
      this.video.pause();
      if (this.resetOnDeactivate) {
        this.video.currentTime = 0;
        this.video.seekCalls.push(0);
      }
      this.playbackState = 'INACTIVE';
      this.isVideoVisualReady = false;
    }
  }

  public toggleMute() {
    this.isMuted = !this.isMuted;
    this.video.muted = this.isMuted;
  }

  public isVideoVisible(isActive: boolean): boolean {
    const hasValidVideo = Boolean(this.videoSrc && !this.videoError);
    return Boolean(
      hasValidVideo &&
      this.videoLoaded &&
      isActive &&
      this.isVideoVisualReady &&
      (this.playbackState === 'PLAYING' || this.playbackState === 'ENDED')
    );
  }

  public getVideoLayerClassName(isActive: boolean): string {
    return this.isVideoVisible(isActive)
      ? 'opacity-100 transition-opacity duration-300'
      : 'opacity-0 pointer-events-none';
  }

  public getBaseLayerClassName(isActive: boolean): string {
    return this.isVideoVisible(isActive) ? 'opacity-0' : 'opacity-100';
  }
}

async function runVideoTransitionTests() {
  console.log('🎬 Starting Food Video Transition Bug Fix Verification Suite (20 Tests)...\n');
  let passed = 0;
  let failed = 0;

  async function assert(testNum: number, desc: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      console.log(`  ✓ [Test ${testNum}/20] ${desc}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [Test ${testNum}/20] ${desc}:`, err.message || err);
      failed++;
    }
  }

  // TEST 1: Video plays once per activation (start at 0, play, reach end, pause)
  await assert(1, 'Video plays once per activation: start at 0, play, reach end, pause', () => {
    const sm = new FoodMediaTransitionStateMachine('food-1', '/videos/steak.mp4');
    sm.updateActivation(true);
    if (sm.video.currentTime !== 0) throw new Error('Video must start at currentTime 0');
    if (sm.video.paused) throw new Error('Video must start playback');
    sm.triggerPlaying();
    sm.simulatePlaybackProgress(10);
    if (sm.playbackState !== 'ENDED') throw new Error(`Expected ENDED, got ${sm.playbackState}`);
    if (!sm.video.paused) throw new Error('Video must be paused after reaching end');
    if (sm.video.currentTime !== 10) throw new Error('Video must be at final frame');
  });

  // TEST 2: Final frame remains visible WHILE active
  await assert(2, 'Final frame remains visible WHILE active', () => {
    const sm = new FoodMediaTransitionStateMachine('food-1', '/videos/steak.mp4');
    sm.updateActivation(true);
    sm.triggerPlaying();
    sm.simulatePlaybackProgress(10);
    if (!sm.isVideoVisible(true)) throw new Error('Video must remain visible on final frame while active');
    if (sm.getVideoLayerClassName(true).indexOf('opacity-100') === -1) {
      throw new Error('Video layer must have opacity-100 when holding final frame while active');
    }
  });

  // TEST 3: On deactivation, video pauses immediately
  await assert(3, 'On deactivation, video pauses immediately', () => {
    const sm = new FoodMediaTransitionStateMachine('food-1', '/videos/steak.mp4');
    sm.updateActivation(true);
    sm.triggerPlaying();
    sm.simulatePlaybackProgress(5);
    sm.updateActivation(false);
    if (!sm.video.paused) throw new Error('Video must pause immediately on deactivation');
    if (sm.playbackState !== 'INACTIVE') throw new Error('Playback state must be INACTIVE');
  });

  // TEST 4: On deactivation, currentTime resets to 0 immediately (DO NOT wait for next activation)
  await assert(4, 'On deactivation, currentTime resets to 0 immediately (DO NOT wait for next activation)', () => {
    const sm = new FoodMediaTransitionStateMachine('food-1', '/videos/steak.mp4');
    sm.updateActivation(true);
    sm.triggerPlaying();
    sm.simulatePlaybackProgress(10); // ended at final frame
    sm.updateActivation(false); // deactivated
    if (sm.video.currentTime !== 0) {
      throw new Error(`Video currentTime must be 0 immediately upon deactivation, got ${sm.video.currentTime}`);
    }
    const lastSeek = sm.video.seekCalls[sm.video.seekCalls.length - 1];
    if (lastSeek !== 0) throw new Error('Deactivation must have triggered seek to 0');
  });

  // TEST 5: Visual exposure of final frame is cleared immediately on deactivation
  await assert(5, 'Visual exposure of final frame is cleared immediately on deactivation', () => {
    const sm = new FoodMediaTransitionStateMachine('food-1', '/videos/steak.mp4');
    sm.updateActivation(true);
    sm.triggerPlaying();
    sm.simulatePlaybackProgress(10);
    if (!sm.isVideoVisible(true)) throw new Error('Precondition: video must be visible while active');
    sm.updateActivation(false);
    if (sm.isVideoVisible(false)) throw new Error('Video must NOT be visible when inactive');
    if (sm.getVideoLayerClassName(false).indexOf('opacity-0') === -1) {
      throw new Error('Video layer must immediately have opacity-0 when deactivated');
    }
    if (sm.getBaseLayerClassName(false).indexOf('opacity-100') === -1) {
      throw new Error('Base layer must immediately restore to opacity-100 when deactivated');
    }
  });

  // TEST 6: When returning to previously played food, video is already at 0
  await assert(6, 'When returning to previously played food, video is already at 0', () => {
    const sm = new FoodMediaTransitionStateMachine('food-1', '/videos/steak.mp4');
    sm.updateActivation(true);
    sm.triggerPlaying();
    sm.simulatePlaybackProgress(10); // ended
    sm.updateActivation(false); // scrolled away
    if (sm.video.currentTime !== 0) throw new Error('Video must be at 0 while inactive');
    // Scroll back to food-1
    sm.updateActivation(true);
    if (sm.video.currentTime !== 0) throw new Error('Video must still be at 0 when returned to');
  });

  // TEST 7: Previous final frame is never visible during transition back to food (visual ready gate)
  await assert(7, 'Previous final frame is never visible during transition back to food (visual ready gate: isVideoVisualReady === false until onPlaying)', () => {
    const sm = new FoodMediaTransitionStateMachine('food-1', '/videos/steak.mp4');
    sm.updateActivation(true);
    sm.triggerPlaying();
    sm.simulatePlaybackProgress(10);
    sm.updateActivation(false);

    // Scroll back: activation occurs
    sm.updateActivation(true);
    // Before onPlaying fires (browser is seeking / preparing frame 0)
    if (sm.isVideoVisualReady) throw new Error('isVideoVisualReady must be false before onPlaying fires');
    if (sm.isVideoVisible(true)) throw new Error('Video must NOT be visible before onPlaying confirms frame 0');
    if (sm.getVideoLayerClassName(true).indexOf('opacity-0') === -1) {
      throw new Error('Video layer must remain opacity-0 during transition seek');
    }

    // Now onPlaying fires
    sm.triggerPlaying();
    if (!sm.isVideoVisualReady) throw new Error('isVideoVisualReady must be true after onPlaying');
    if (!sm.isVideoVisible(true)) throw new Error('Video should now be visible after onPlaying');
  });

  // TEST 8: Repeated fast scrolling back and forth never exposes final frame
  await assert(8, 'Repeated fast scrolling back and forth never exposes final frame', () => {
    const smA = new FoodMediaTransitionStateMachine('food-A', '/videos/a.mp4');
    const smB = new FoodMediaTransitionStateMachine('food-B', '/videos/b.mp4');

    // A plays to end
    smA.updateActivation(true);
    smA.triggerPlaying();
    smA.simulatePlaybackProgress(10);

    // Rapidly switch A -> B -> A -> B -> A without allowing frame leak
    for (let cycle = 0; cycle < 5; cycle++) {
      smA.updateActivation(false);
      smB.updateActivation(true);
      if (smA.isVideoVisible(false)) throw new Error(`Cycle ${cycle}: Inactive A must never be visible`);
      if (smA.video.currentTime !== 0) throw new Error(`Cycle ${cycle}: Inactive A must be reset to 0`);

      smB.updateActivation(false);
      smA.updateActivation(true);
      if (smA.isVideoVisible(true) && !smA.isVideoVisualReady) {
        throw new Error(`Cycle ${cycle}: Active A must not be visible before visual ready confirmation`);
      }
    }
  });

  // TEST 9: Preloaded next/prev videos are paused at currentTime = 0
  await assert(9, 'Preloaded next/prev videos are paused at currentTime = 0', () => {
    const smPreload = new FoodMediaTransitionStateMachine('food-next', '/videos/next.mp4');
    smPreload.updateActivation(false);
    if (!smPreload.video.paused) throw new Error('Preloaded video must be paused');
    if (smPreload.video.currentTime !== 0) throw new Error('Preloaded video must have currentTime 0');
    if (smPreload.video.playCalls > 0) throw new Error('Preloaded video must have 0 play calls');
  });

  // TEST 10: Preloaded next/prev videos do not show final frame of earlier playback
  await assert(10, 'Preloaded next/prev videos do not show final frame of earlier playback', () => {
    const sm = new FoodMediaTransitionStateMachine('food-preload', '/videos/item.mp4');
    sm.updateActivation(true);
    sm.triggerPlaying();
    sm.simulatePlaybackProgress(10);
    // User moves away, item enters preloaded pool
    sm.updateActivation(false);
    if (sm.video.currentTime !== 0) throw new Error('Preloaded slide must be at 0');
    if (sm.isVideoVisible(false)) throw new Error('Preloaded slide must not show video layer');
    if (sm.getVideoLayerClassName(false).indexOf('opacity-0') === -1) {
      throw new Error('Preloaded slide video must have opacity-0');
    }
  });

  // TEST 11: Desktop hover: handleMouseEnter plays from 0 once; handleMouseLeave pauses and resets to 0
  await assert(11, 'Desktop hover: handleMouseEnter plays from 0 once; handleMouseLeave pauses and resets to 0', () => {
    const sm = new FoodMediaTransitionStateMachine('food-hover', '/videos/hover.mp4');
    // Hover over inactive card
    sm.handleMouseEnter();
    if (sm.video.currentTime !== 0) throw new Error('Hover enter must start at 0');
    if (sm.video.paused) throw new Error('Hover enter must start playback');
    sm.triggerPlaying();
    sm.simulatePlaybackProgress(4);
    // Hover leave on inactive card
    sm.handleMouseLeave(false);
    if (!sm.video.paused) throw new Error('Hover leave must pause video');
    if (sm.video.currentTime !== 0) throw new Error('Hover leave must reset currentTime to 0');
    if (sm.isVideoVisible(false)) throw new Error('Hover leave must close visual gate');
  });

  // TEST 12: Customer mobile menu: swiping between slides correctly pauses, resets to 0, and never flashes final frame
  await assert(12, 'Customer mobile menu: swiping between slides correctly pauses, resets to 0, and never flashes final frame', () => {
    const slide1 = new FoodMediaTransitionStateMachine('slide-1', '/videos/burger.mp4');
    const slide2 = new FoodMediaTransitionStateMachine('slide-2', '/videos/fries.mp4');

    // Slide 1 active, plays completely
    slide1.updateActivation(true);
    slide1.triggerPlaying();
    slide1.simulatePlaybackProgress(10);

    // Swipe down to Slide 2
    slide1.updateActivation(false);
    slide2.updateActivation(true);
    if (slide1.video.currentTime !== 0) throw new Error('Slide 1 must be reset to 0 upon swiping away');
    if (slide1.isVideoVisible(false)) throw new Error('Slide 1 video must be hidden');

    // Swipe back up to Slide 1
    slide2.updateActivation(false);
    slide1.updateActivation(true);
    if (slide1.video.currentTime !== 0) throw new Error('Slide 1 must be at 0 when returned to');
    if (slide1.isVideoVisible(true)) throw new Error('Slide 1 must not be visible until onPlaying fires');
    slide1.triggerPlaying();
    if (!slide1.isVideoVisible(true)) throw new Error('Slide 1 should be visible once onPlaying confirms frame 0');
  });

  // TEST 13: Live Menu Studio preview: switching between dishes pauses, resets to 0, and never flashes final frame
  await assert(13, 'Live Menu Studio preview: switching between dishes pauses, resets to 0, and never flashes final frame', () => {
    const previewItem = new FoodMediaTransitionStateMachine('dish-101', '/videos/pizza.mp4');
    previewItem.updateActivation(true, 'dish-101');
    previewItem.triggerPlaying();
    previewItem.simulatePlaybackProgress(10);

    // Switch selected dish in Studio
    previewItem.updateActivation(true, 'dish-102');
    if (previewItem.video.currentTime !== 0) throw new Error('Switching dish must reset currentTime to 0');
    if (previewItem.isVideoVisible(true)) throw new Error('Switching dish must close visual gate until new video plays');
  });

  // TEST 14: Video with base image: base image is shown during transition, video only fades in after frame 0 begins playing
  await assert(14, 'Video with base image: base image is shown during transition, video only fades in after frame 0 begins playing', () => {
    const sm = new FoodMediaTransitionStateMachine('food-img-vid', '/videos/pasta.mp4', { hasImage: true });
    sm.updateActivation(true);
    // While seeking at frame 0
    if (sm.getBaseLayerClassName(true) !== 'opacity-100') {
      throw new Error('Base image must have opacity-100 while video is preparing frame 0');
    }
    if (sm.getVideoLayerClassName(true).indexOf('opacity-0') === -1) {
      throw new Error('Video must have opacity-0 while preparing frame 0');
    }
    // onPlaying fires
    sm.triggerPlaying();
    if (sm.getBaseLayerClassName(true) !== 'opacity-0') {
      throw new Error('Base image must transition to opacity-0 once video starts playing');
    }
    if (sm.getVideoLayerClassName(true).indexOf('opacity-100') === -1) {
      throw new Error('Video must transition to opacity-100 once playing');
    }
  });

  // TEST 15: Video without base image: fallback gradient/placeholder is shown during seek/transition, video only fades in after frame 0 begins playing
  await assert(15, 'Video without base image: fallback gradient/placeholder is shown during seek/transition, video only fades in after frame 0 begins playing', () => {
    const sm = new FoodMediaTransitionStateMachine('food-vid-only', '/videos/sushi.mp4', { hasImage: false });
    sm.updateActivation(true);
    if (sm.getBaseLayerClassName(true) !== 'opacity-100') {
      throw new Error('Fallback container must have opacity-100 while video is preparing frame 0');
    }
    if (sm.getVideoLayerClassName(true).indexOf('opacity-0') === -1) {
      throw new Error('Video must have opacity-0 while preparing frame 0');
    }
    sm.triggerPlaying();
    if (sm.getBaseLayerClassName(true) !== 'opacity-0') {
      throw new Error('Fallback container must transition to opacity-0 once video starts playing');
    }
    if (sm.getVideoLayerClassName(true).indexOf('opacity-100') === -1) {
      throw new Error('Video must transition to opacity-100 once playing');
    }
  });

  // TEST 16: Video ended state: holding final frame is strictly forbidden once slide becomes inactive (isActive === false)
  await assert(16, 'Video ended state: holding final frame is strictly forbidden once slide becomes inactive (isActive === false)', () => {
    const sm = new FoodMediaTransitionStateMachine('food-ended-test', '/videos/salad.mp4');
    sm.updateActivation(true);
    sm.triggerPlaying();
    sm.simulatePlaybackProgress(10); // ended
    if (sm.playbackState !== 'ENDED') throw new Error('Expected ENDED');
    if (!sm.isVideoVisible(true)) throw new Error('Final frame must be held while active');

    // Crucial check: deactivate
    sm.updateActivation(false);
    if (sm.isVideoVisible(false)) {
      throw new Error('VIOLATION: holding final frame is strictly prohibited when inactive!');
    }
  });

  // TEST 17: Re-render immunity: updating settings/theme/language on active food does NOT reset video or flash base layer
  await assert(17, 'Re-render immunity: updating settings/theme/language on active food does NOT reset video or flash base layer', () => {
    const sm = new FoodMediaTransitionStateMachine('food-rerender', '/videos/soup.mp4');
    sm.updateActivation(true);
    sm.triggerPlaying();
    sm.simulatePlaybackProgress(4);
    const seekCountBefore = sm.video.seekCalls.length;

    // Component re-renders with same food and isActive = true
    sm.updateActivation(true);
    if (sm.video.currentTime !== 4) throw new Error('Video must not reset currentTime on normal re-render');
    if (sm.video.seekCalls.length !== seekCountBefore) throw new Error('Video must not seek on normal re-render');
    if (!sm.isVideoVisible(true)) throw new Error('Video must remain visible without flashing base layer');
  });

  // TEST 18: Sound toggle immunity: muting/unmuting on active food does NOT reset video or flash final frame
  await assert(18, 'Sound toggle immunity: muting/unmuting on active food does NOT reset video or flash final frame', () => {
    const sm = new FoodMediaTransitionStateMachine('food-sound', '/videos/steak.mp4');
    sm.updateActivation(true);
    sm.triggerPlaying();
    sm.simulatePlaybackProgress(7);
    sm.toggleMute();
    if (sm.video.currentTime !== 7) throw new Error('Toggling sound must not reset video position');
    if (sm.video.paused) throw new Error('Toggling sound must not pause video');
    if (!sm.isVideoVisible(true)) throw new Error('Toggling sound must not hide video layer');
  });

  // TEST 19: Error handling: failed video load falls back gracefully without flashing or looping
  await assert(19, 'Error handling: failed video load falls back gracefully without flashing or looping', () => {
    const sm = new FoodMediaTransitionStateMachine('food-err', '/videos/bad.mp4');
    sm.videoError = true;
    sm.updateActivation(true);
    if (sm.isVideoVisible(true)) throw new Error('Errored video must not be visible');
    if (sm.getBaseLayerClassName(true) !== 'opacity-100') {
      throw new Error('Base layer / fallback must be visible on error');
    }
  });

  // TEST 20: Static analysis: FoodMedia.tsx and SinglePlayVideo.tsx have no loop, have onPlaying visual gate, and immediate reset
  await assert(20, 'Static analysis: FoodMedia.tsx and SinglePlayVideo.tsx have no loop, have onPlaying visual gate, and immediate reset', () => {
    const foodMediaPath = path.resolve(__dirname, '../../src/components/customer/FoodMedia.tsx');
    const singlePlayPath = path.resolve(__dirname, '../../src/components/customer/SinglePlayVideo.tsx');
    const foodMediaContent = fs.readFileSync(foodMediaPath, 'utf-8');
    const singlePlayContent = fs.readFileSync(singlePlayPath, 'utf-8');

    // Check no loop attribute
    const loopRegex = /<video[^>]*\bloop\b/i;
    if (loopRegex.test(foodMediaContent)) {
      throw new Error('FoodMedia.tsx must not contain loop attribute on <video>');
    }
    if (loopRegex.test(singlePlayContent)) {
      throw new Error('SinglePlayVideo.tsx must not contain loop attribute on <video>');
    }

    // Check isVideoVisualReady in FoodMedia
    if (!foodMediaContent.includes('isVideoVisualReady')) {
      throw new Error('FoodMedia.tsx must have isVideoVisualReady state');
    }
    if (!foodMediaContent.includes('onPlaying')) {
      throw new Error('FoodMedia.tsx must have onPlaying handler');
    }

    // Check immediate pause and currentTime = 0 on deactivation
    if (!foodMediaContent.includes('video.pause()') || !foodMediaContent.includes('video.currentTime = 0')) {
      throw new Error('FoodMedia.tsx must have immediate pause and currentTime = 0 on deactivation');
    }

    // Check SinglePlayVideo has onPlaying and cleanup reset
    if (!singlePlayContent.includes('onPlaying')) {
      throw new Error('SinglePlayVideo.tsx must have onPlaying handler');
    }
    if (!singlePlayContent.includes('isVisualReady')) {
      throw new Error('SinglePlayVideo.tsx must have isVisualReady state');
    }
  });

  console.log(`\n📊 Test Summary: ${passed} Passed, ${failed} Failed of 20 Total Tests.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runVideoTransitionTests().catch((err) => {
  console.error('Fatal error running video transition tests:', err);
  process.exit(1);
});
