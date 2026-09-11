import React, { useEffect, useRef, useState } from 'react';

export interface SinglePlayVideoProps {
  src: string;
  poster?: string;
  className?: string;
  activationKey?: string | number;
  autoPlay?: boolean;
  muted?: boolean;
  playsInline?: boolean;
  controls?: boolean;
  onEnded?: () => void;
  onError?: (e: React.SyntheticEvent<HTMLVideoElement, Event>) => void;
  onLoadedData?: (e: React.SyntheticEvent<HTMLVideoElement, Event>) => void;
}

/**
 * SinglePlayVideo
 * HTML5 video that plays EXACTLY ONCE per activationKey.
 * Never loops. Holds final frame upon completion.
 * Prevents flashing final frame when reactivated by gating visual appearance
 * on confirmed playback from frame 0.
 */
export const SinglePlayVideo: React.FC<SinglePlayVideoProps> = ({
  src,
  poster,
  className = 'w-full h-full object-cover',
  activationKey,
  autoPlay = true,
  muted = true,
  playsInline = true,
  controls = false,
  onEnded,
  onError,
  onLoadedData,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const prevKeyRef = useRef<string | number | undefined>(undefined);
  const hasMountedRef = useRef<boolean>(false);
  const [isVisualReady, setIsVisualReady] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    const isInitialMount = !hasMountedRef.current;
    hasMountedRef.current = true;

    const keyChanged = prevKeyRef.current !== activationKey;
    prevKeyRef.current = activationKey;

    // Trigger fresh single-play cycle on initial mount or when activation key changes
    if ((isInitialMount || keyChanged) && autoPlay) {
      // Immediately hide previous frame
      setIsVisualReady(false);
      try {
        video.currentTime = 0;
      } catch {
        // seek safety
      }
      video.muted = muted;
      video.play().catch(() => {});
    }

    return () => {
      // Deactivation / unmount cleanup: pause and reset to 0 immediately
      try {
        video.pause();
        video.currentTime = 0;
      } catch {
        // cleanup safety
      }
      setIsVisualReady(false);
    };
  }, [activationKey, src, autoPlay, muted]);

  return (
    <video
      ref={videoRef}
      src={src}
      poster={poster}
      muted={muted}
      playsInline={playsInline}
      controls={controls}
      onLoadedData={onLoadedData}
      onError={onError}
      onPlaying={() => {
        setIsVisualReady(true);
      }}
      onTimeUpdate={() => {
        if (!isVisualReady && videoRef.current && videoRef.current.currentTime > 0) {
          setIsVisualReady(true);
        }
      }}
      onEnded={() => {
        // Remain ended on final frame; do NOT seek to 0, do NOT loop
        try {
          const video = videoRef.current;
          if (video) {
            video.pause();
          }
        } catch {
          // pause safety
        }
        onEnded?.();
      }}
      className={`${className} ${
        isVisualReady ? 'opacity-100 transition-opacity duration-300' : 'opacity-0 pointer-events-none'
      }`}
    />
  );
};

