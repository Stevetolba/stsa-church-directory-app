"use client";

import { useEffect, useRef } from "react";

// Minimal typing for the pieces of the YouTube IFrame Player API used here.
interface YTPlayer {
  getCurrentTime(): number;
  getDuration(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  destroy(): void;
}
interface YTApi {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      playerVars?: Record<string, number | string>;
      events?: { onStateChange?: (e: { data: number }) => void };
    }
  ) => YTPlayer;
  PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
}
declare global {
  interface Window {
    YT?: YTApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTApi> | null = null;
function loadYouTubeApi(): Promise<YTApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        resolve(window.YT as YTApi);
      };
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    });
  }
  return apiPromise;
}

// How far past the furthest-watched point the playhead may drift before it
// counts as a skip (covers normal playback jitter and buffering).
const SKIP_TOLERANCE_SECONDS = 2;

// Embeds an (unlisted) YouTube video and reports the furthest point
// *legitimately* watched as a percentage — every ~15s while playing, and on
// pause/end. Unless `unrestricted`, the playhead is pulled back whenever it
// jumps more than a couple of seconds past that point, so a learner can
// rewind freely and resume where they left off (`initialPct`) but can't
// skip ahead. The server only ever raises the stored percentage
// (lib/training.ts recordWatch). This is client-side enforcement: someone
// calling the API directly could still forge progress.
export function YouTubeLesson({
  videoId,
  initialPct = 0,
  unrestricted = false,
  onProgress,
}: {
  videoId: string;
  initialPct?: number;
  unrestricted?: boolean;
  onProgress: (pct: number) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const cb = useRef(onProgress);
  cb.current = onProgress;
  const initial = useRef(initialPct);
  const free = useRef(unrestricted);
  free.current = unrestricted;

  useEffect(() => {
    let player: YTPlayer | null = null;
    let reportTimer: ReturnType<typeof setInterval> | undefined;
    let guardTimer: ReturnType<typeof setInterval> | undefined;
    let furthest = 0; // seconds
    let seeded = false;
    let cancelled = false;

    const report = () => {
      if (!player) return;
      const duration = player.getDuration();
      if (!duration) return;
      cb.current(Math.min(100, (furthest / duration) * 100));
    };

    // Runs ~4x/second while playing: advances `furthest` through normal
    // playback, and undoes forward seeks.
    const guard = () => {
      if (!player) return;
      const duration = player.getDuration();
      if (!duration) return;
      if (!seeded) {
        furthest = (initial.current / 100) * duration;
        seeded = true;
      }
      const t = player.getCurrentTime();
      if (free.current) {
        furthest = Math.max(furthest, t);
      } else if (t > furthest + SKIP_TOLERANCE_SECONDS) {
        player.seekTo(furthest, true);
      } else {
        furthest = Math.max(furthest, t);
      }
    };

    loadYouTubeApi().then((YT) => {
      if (cancelled || !hostRef.current) return;
      const mount = document.createElement("div");
      hostRef.current.replaceChildren(mount);
      player = new YT.Player(mount, {
        videoId,
        // disablekb removes the arrow-key seek shortcuts; the guard above is
        // what actually enforces it (the progress bar can still be dragged).
        playerVars: { rel: 0, modestbranding: 1, disablekb: 1 },
        events: {
          onStateChange: (e) => {
            clearInterval(reportTimer);
            clearInterval(guardTimer);
            if (e.data === YT.PlayerState.PLAYING) {
              guardTimer = setInterval(guard, 250);
              reportTimer = setInterval(report, 15000);
            } else {
              guard();
              if (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED) report();
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      clearInterval(reportTimer);
      clearInterval(guardTimer);
      report();
      player?.destroy();
    };
  }, [videoId]);

  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl bg-black [&_iframe]:h-full [&_iframe]:w-full">
      <div ref={hostRef} className="h-full w-full" />
    </div>
  );
}
