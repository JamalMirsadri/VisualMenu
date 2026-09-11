import React, { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import type { FoodItem, RestaurantSettings } from '../../types';
import { LuxuryFoodFallback } from './LuxuryFoodFallback';

export type VideoPlaybackState = 'IDLE' | 'PLAYING' | 'ENDED' | 'INACTIVE';

interface FoodMediaProps {
  food: FoodItem & {
    desktopUrl?: string | null;
    mobileUrl?: string | null;
    posterUrl?: string | null;
  };
  isActive: boolean;
  resetOnDeactivate?: boolean;
  shouldPreload?: boolean;
  presentationMode?: string;
  settings?: Partial<RestaurantSettings>;
}

export const FoodMedia: React.FC<FoodMediaProps> = ({
  food,
  isActive,
  resetOnDeactivate = true,
  shouldPreload = true,
  presentationMode = 'INDIVIDUAL_VIDEO',
  settings,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [showVolumeHint, setShowVolumeHint] = useState(false);

  // Visual ready gate: ensures previous final frame is NEVER exposed during seek or re-entry
  const [isVideoVisualReady, setIsVideoVisualReady] = useState(false);

  // Explicit Video State Model: IDLE -> PLAYING -> ENDED / INACTIVE
  const [playbackState, setPlaybackState] = useState<VideoPlaybackState>('IDLE');
  const playbackStateRef = useRef<VideoPlaybackState>('IDLE');
  const prevActiveRef = useRef<boolean>(false);
  const prevFoodIdRef = useRef<string>(food.id);

  // Sync ref with state
  playbackStateRef.current = playbackState;

  // Detect user's reduced motion preference
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Normalize presentation mode
  let normalizedMode = (presentationMode || 'INDIVIDUAL_VIDEO').toUpperCase().replace('-', '_');
  if (normalizedMode === 'INDIVIDUAL' || normalizedMode === 'REELS') {
    normalizedMode = 'INDIVIDUAL_VIDEO';
  }

  const isSharedEnvironment = normalizedMode === 'SHARED_ENVIRONMENT';
  const isVisualImage = normalizedMode === 'VISUAL_IMAGE';

  const rawImageSrc = food.mobileUrl || food.desktopUrl || food.image;
  const imageSrc = rawImageSrc || undefined;
  const hasImage = Boolean(imageSrc && imageSrc.trim() && !imageError);
  const videoSrc = (food.video && food.video.trim()) || undefined;
  const hasValidVideo = Boolean(videoSrc && !videoError && !isVisualImage);
  const posterSrc = (food.posterUrl || (hasImage ? imageSrc : undefined)) || undefined;

  // Video autoplay & single-playback management (Plays once per activation, never loops)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc || videoError) return;

    const wasActive = prevActiveRef.current;
    prevActiveRef.current = isActive;
    const foodChanged = prevFoodIdRef.current !== food.id;
    prevFoodIdRef.current = food.id;

    // 1. GENUINE ACTIVATION TRANSITION: false -> true OR active item switched to new food
    if ((isActive && !wasActive) || (isActive && foodChanged)) {
      // Close visual gate immediately: hide video while setting up frame 0 to prevent stale frame flash
      setIsVideoVisualReady(false);
      playbackStateRef.current = 'PLAYING';
      setPlaybackState('PLAYING');

      // Reset to 0 for every fresh activation cycle
      try {
        video.currentTime = 0;
      } catch {
        // seek safety
      }

      video.muted = isMuted;
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Retry once with muted fallback for strict mobile browser autoplay policies
          if (!video.muted) {
            video.muted = true;
            setIsMuted(true);
            video.play().catch(() => setVideoError(true));
          } else {
            setVideoError(true);
          }
        });
      }
      return;
    }

    // 2. GENUINE DEACTIVATION TRANSITION: true -> false (user leaves dish)
    if (!isActive && wasActive) {
      // Immediately pause playback
      video.pause();
      // Immediately reset currentTime to 0 (DO NOT wait for next activation)
      try {
        video.currentTime = 0;
      } catch {
        // seek safety
      }
      playbackStateRef.current = 'INACTIVE';
      setPlaybackState('INACTIVE');
      // Immediately close visual gate so stale final frame is never displayed
      setIsVideoVisualReady(false);
      return;
    }

    // 3. PRELOAD / INACTIVE INTEGRITY: Inactive preloaded videos must NEVER play or expose stale frames
    if (!isActive) {
      video.pause();
      try {
        if (video.currentTime !== 0) {
          video.currentTime = 0;
        }
      } catch {
        // seek safety
      }
      if (playbackStateRef.current !== 'INACTIVE') {
        playbackStateRef.current = 'INACTIVE';
        setPlaybackState('INACTIVE');
      }
      setIsVideoVisualReady(false);
      return;
    }

    // 4. RE-RENDER INTEGRITY: If isActive is already true (theme change, category change, prop update),
    // sync mute state without resetting currentTime and without restarting an ongoing or ended video!
    video.muted = isMuted;
  }, [isActive, food.id, videoSrc, videoError, isMuted, resetOnDeactivate]);

  // Desktop hover interactions (mouseenter = play once from 0; mouseleave = pause & reset)
  const handleMouseEnter = () => {
    const video = videoRef.current;
    if (!video || !videoSrc || videoError) return;

    // Trigger single playback cycle on desktop hover
    setIsVideoVisualReady(false);
    playbackStateRef.current = 'PLAYING';
    setPlaybackState('PLAYING');
    try {
      video.currentTime = 0;
    } catch {
      // seek safety
    }
    video.muted = isMuted;
    video.play().catch(() => {});
  };

  const handleMouseLeave = () => {
    const video = videoRef.current;
    if (!video) return;

    // If this item is not the currently focused slide, pause and reset on mouse leave
    if (!isActive) {
      video.pause();
      try {
        video.currentTime = 0;
      } catch {
        // seek safety
      }
      playbackStateRef.current = 'INACTIVE';
      setPlaybackState('INACTIVE');
      setIsVideoVisualReady(false);
    }
  };

  // Strict visibility gate: only visible while active, genuinely ready, and playing or ended
  const isVideoVisible = Boolean(
    hasValidVideo &&
    videoLoaded &&
    isActive &&
    isVideoVisualReady &&
    (playbackState === 'PLAYING' || playbackState === 'ENDED')
  );

  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    const nextMuted = !isMuted;
    videoRef.current.muted = nextMuted;
    setIsMuted(nextMuted);
    setShowVolumeHint(true);
    setTimeout(() => setShowVolumeHint(false), 1500);
  };

  // Lighting preset styles
  const lightingPreset = (settings?.lightingPreset || 'WARM').toUpperCase();
  const getLightingGlow = () => {
    switch (lightingPreset) {
      case 'COOL':
        return 'from-sky-500/15 via-transparent to-slate-950/80';
      case 'DRAMATIC':
        return 'from-amber-500/25 via-black/40 to-black';
      case 'NATURAL':
        return 'from-emerald-500/10 via-transparent to-zinc-950/60';
      case 'WARM':
      default:
        return 'from-amber-500/20 via-transparent to-black/75';
    }
  };

  // Entrance animation variants
  const entranceType = (settings?.foodEntranceAnimation || 'FADE_UP').toUpperCase();
  const getEntranceAnimation = () => {
    if (prefersReducedMotion) {
      return { opacity: isActive ? 1 : 0.4 };
    }
    switch (entranceType) {
      case 'SCALE_UP':
        return isActive
          ? { scale: 1, opacity: 1, y: 0 }
          : { scale: 0.85, opacity: 0.3, y: 20 };
      case 'SLIDE_RIGHT':
        return isActive
          ? { x: 0, opacity: 1 }
          : { x: -40, opacity: 0.3 };
      case 'SMOOTH':
        return isActive
          ? { scale: 1, opacity: 1 }
          : { scale: 0.95, opacity: 0.5 };
      case 'FADE_UP':
      default:
        return isActive
          ? { y: 0, opacity: 1, scale: 1 }
          : { y: 30, opacity: 0.4, scale: 0.95 };
    }
  };

  // Camera motion variants
  const cameraMotion = (settings?.cameraMotion || 'GENTLE_ZOOM').toUpperCase();
  const getCameraScale = () => {
    if (prefersReducedMotion || cameraMotion === 'STATIC') return 1;
    if (cameraMotion === 'SLOW_PAN') return isActive ? 1.08 : 1;
    return isActive ? 1.05 : 1;
  };

  return (
    <div
      className="relative w-full h-full overflow-hidden bg-black select-none"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {isSharedEnvironment ? (
        // Mode B: Shared Environment Showcase Stage
        <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden">
          {/* Ambient Dining Environment Background */}
          <div className="absolute inset-0 bg-gradient-to-b from-zinc-950 via-zinc-900 to-black" />
          
          {/* Lighting Preset Backdrop Glow */}
          <div className={`absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,var(--tw-gradient-stops))] ${getLightingGlow()}`} />

          {/* Table Surface Simulation */}
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black via-zinc-950/80 to-transparent border-t border-amber-500/10" />

          {/* Central Featured Dish Presentation Plate */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0.5 }}
            animate={getEntranceAnimation()}
            transition={{ duration: prefersReducedMotion ? 0.2 : 0.65, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-[84%] max-w-[340px] aspect-square rounded-3xl overflow-hidden shadow-2xl shadow-black/80 border border-amber-500/30 group mb-12 bg-zinc-950"
          >
            {hasImage ? (
              <motion.img
                src={imageSrc}
                alt={food.name}
                animate={{ scale: getCameraScale() }}
                transition={{ duration: 1.5, ease: 'easeOut' }}
                className="w-full h-full object-cover object-center transform transition-transform duration-700"
                loading={shouldPreload ? 'eager' : 'lazy'}
                onError={() => setImageError(true)}
              />
            ) : videoSrc && !videoError ? (
              <video
                ref={videoRef}
                src={videoSrc}
                poster={posterSrc}
                muted={isMuted}
                playsInline
                preload={isActive ? 'auto' : 'metadata'}
                onLoadedData={() => setVideoLoaded(true)}
                onPlaying={() => {
                  if (isActive) setIsVideoVisualReady(true);
                }}
                onTimeUpdate={() => {
                  if (isActive && !isVideoVisualReady && videoRef.current && videoRef.current.currentTime > 0) {
                    setIsVideoVisualReady(true);
                  }
                }}
                onEnded={() => {
                  playbackStateRef.current = 'ENDED';
                  setPlaybackState('ENDED');
                }}
                onError={() => setVideoError(true)}
                className="w-full h-full object-cover object-center"
              />
            ) : (
              <LuxuryFoodFallback
                name={food.name}
                tagline={food.tagline}
                primaryColor={settings?.primaryColor}
              />
            )}

            {/* Soft Ambient Rim Light */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />

            {/* Stage Selection Badge */}
            <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md border border-amber-400/30 text-[10px] text-amber-300 tracking-wider uppercase font-semibold flex items-center gap-1.5 shadow-md">
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>Chef's Stage</span>
            </div>
          </motion.div>
        </div>
      ) : isVisualImage ? (
        // Mode C: High-Fidelity Visual Photography (No Video Autoplay)
        <div className="relative w-full h-full overflow-hidden bg-zinc-950">
          {hasImage ? (
            <motion.img
              src={imageSrc}
              alt={food.name}
              initial={false}
              animate={{ scale: getCameraScale() }}
              transition={{ duration: prefersReducedMotion ? 0 : 2.5, ease: 'easeOut' }}
              className="absolute inset-0 w-full h-full object-cover object-center"
              loading={shouldPreload ? 'eager' : 'lazy'}
              onError={() => setImageError(true)}
            />
          ) : videoSrc && !videoError ? (
            <video
              ref={videoRef}
              src={videoSrc}
              poster={posterSrc}
              muted={isMuted}
              playsInline
              preload={isActive ? 'auto' : 'metadata'}
              onLoadedData={() => setVideoLoaded(true)}
              onPlaying={() => {
                if (isActive) setIsVideoVisualReady(true);
              }}
              onTimeUpdate={() => {
                if (isActive && !isVideoVisualReady && videoRef.current && videoRef.current.currentTime > 0) {
                  setIsVideoVisualReady(true);
                }
              }}
              onEnded={() => {
                playbackStateRef.current = 'ENDED';
                setPlaybackState('ENDED');
              }}
              onError={() => setVideoError(true)}
              className="absolute inset-0 w-full h-full object-cover object-center"
            />
          ) : (
            <LuxuryFoodFallback
              name={food.name}
              tagline={food.tagline}
              primaryColor={settings?.primaryColor}
            />
          )}
        </div>
      ) : (
        // Mode A: Individual Full-Bleed Video & Media
        <div className="relative w-full h-full overflow-hidden bg-zinc-950">
          {/* Base Layer: Image or Luxury Fallback */}
          {hasImage ? (
            <motion.img
              src={imageSrc}
              alt={food.name}
              initial={false}
              animate={{ scale: getCameraScale() }}
              transition={{ duration: prefersReducedMotion ? 0 : 1.2, ease: 'easeOut' }}
              className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-300 ${
                isVideoVisible ? 'opacity-0' : 'opacity-100'
              }`}
              loading={shouldPreload ? 'eager' : 'lazy'}
              onError={() => setImageError(true)}
            />
          ) : (
            <div
              className={`absolute inset-0 w-full h-full transition-opacity duration-300 ${
                isVideoVisible ? 'opacity-0' : 'opacity-100'
              }`}
            >
              <LuxuryFoodFallback
                name={food.name}
                tagline={food.tagline}
                primaryColor={settings?.primaryColor}
              />
            </div>
          )}

          {/* Video Overlay Layer — Plays once per activation, holds final frame on ended */}
          {hasValidVideo && shouldPreload && (
            <video
              ref={videoRef}
              src={videoSrc}
              poster={posterSrc}
              muted={isMuted}
              playsInline
              preload={isActive ? 'auto' : 'metadata'}
              onLoadedData={() => setVideoLoaded(true)}
              onPlaying={() => {
                if (isActive) setIsVideoVisualReady(true);
              }}
              onTimeUpdate={() => {
                if (isActive && !isVideoVisualReady && videoRef.current && videoRef.current.currentTime > 0) {
                  setIsVideoVisualReady(true);
                }
              }}
              onEnded={() => {
                // Hold final frame: stay paused at end, do NOT seek to 0, do NOT loop
                playbackStateRef.current = 'ENDED';
                setPlaybackState('ENDED');
              }}
              onError={() => setVideoError(true)}
              className={`absolute inset-0 w-full h-full object-cover object-center ${
                isVideoVisible ? 'opacity-100 transition-opacity duration-300' : 'opacity-0 pointer-events-none'
              }`}
            />
          )}
        </div>
      )}

      {/* Overlays */}
      <div className="absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-black/95 via-black/55 to-transparent pointer-events-none z-10" />
      <div className="absolute inset-x-0 bottom-0 h-96 bg-gradient-to-t from-black via-black/85 to-transparent pointer-events-none z-10" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-amber-500/10 via-transparent to-black/60 pointer-events-none z-10" />

      {/* Sound Toggle Floating Button */}
      {hasValidVideo && shouldPreload && (
        <button
          onClick={toggleSound}
          aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
          className="absolute top-24 right-4 z-20 p-3 rounded-full bg-black/50 backdrop-blur-md border border-amber-400/30 text-amber-300 hover:text-white hover:bg-black/80 transition-all duration-300 active:scale-95 shadow-lg cursor-pointer"
        >
          {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5 text-amber-400" />}
        </button>
      )}

      {/* Volume State Toast Notification */}
      {showVolumeHint && (
        <div className="absolute top-36 right-4 z-20 px-3 py-1.5 rounded-full bg-black/80 backdrop-blur-md border border-amber-400/40 text-amber-300 text-xs font-semibold tracking-wider uppercase animate-fade-in">
          {isMuted ? 'Muted' : 'Audio On'}
        </div>
      )}
    </div>
  );
};
