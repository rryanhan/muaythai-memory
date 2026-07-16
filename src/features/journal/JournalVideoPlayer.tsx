"use client";

import { useRef, useState } from "react";
import { ArrowsOut } from "@phosphor-icons/react/ArrowsOut";
import { Pause } from "@phosphor-icons/react/Pause";
import { Play } from "@phosphor-icons/react/Play";
import { SpeakerSimpleHigh } from "@phosphor-icons/react/SpeakerSimpleHigh";
import { SpeakerSimpleSlash } from "@phosphor-icons/react/SpeakerSimpleSlash";
import styles from "./JournalMedia.module.css";

type JournalVideoPlayerProps = {
  src: string;
  label?: string;
  onDuration?: (durationMs: number) => void;
  flush?: boolean;
};

export function JournalVideoPlayer({
  src,
  label = "Training video",
  onDuration,
  flush = false,
}: JournalVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [unavailable, setUnavailable] = useState(false);

  async function togglePlayback() {
    const video = videoRef.current;
    if (!video || unavailable) return;
    if (video.paused) {
      await video.play().catch(() => setUnavailable(true));
    } else {
      video.pause();
    }
  }

  function toggleMuted() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  }

  function seek(nextValue: string) {
    const video = videoRef.current;
    if (!video) return;
    const nextTime = Number(nextValue);
    if (!Number.isFinite(nextTime)) return;
    video.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  async function enterFullscreen() {
    const video = videoRef.current;
    if (!video) return;
    const iosVideo = video as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
    if (video.requestFullscreen) {
      await video.requestFullscreen().catch(() => undefined);
    } else {
      iosVideo.webkitEnterFullscreen?.();
    }
  }

  return (
    <div className={styles.player} data-playing={playing} data-flush={flush}>
      <div className={styles.playerStage}>
        <video
          ref={videoRef}
          aria-label={label}
          playsInline
          preload="metadata"
          src={src}
          onClick={() => void togglePlayback()}
          onLoadedMetadata={(event) => {
            const seconds = event.currentTarget.duration;
            if (!Number.isFinite(seconds)) return;
            setDuration(seconds);
            onDuration?.(Math.round(seconds * 1000));
          }}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => setUnavailable(true)}
        />

        {unavailable ? (
          <div className={styles.playerFallback} role="status">
            <strong>Preview unavailable</strong>
            <span>This browser cannot play the selected video format.</span>
          </div>
        ) : !playing ? (
          <button
            className={styles.playerCenterAction}
            type="button"
            aria-label="Play training video"
            onClick={() => void togglePlayback()}
          >
            <Play size={24} weight="fill" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className={styles.playerControls}>
        <button type="button" aria-label={playing ? "Pause" : "Play"} onClick={() => void togglePlayback()}>
          {playing ? <Pause size={18} weight="fill" /> : <Play size={18} weight="fill" />}
        </button>
        <span className={styles.playerTime}>{formatTime(currentTime)}</span>
        <input
          type="range"
          min="0"
          max={Math.max(duration, 0)}
          step="0.05"
          value={Math.min(currentTime, duration || 0)}
          disabled={!duration || unavailable}
          aria-label="Video position"
          onChange={(event) => seek(event.target.value)}
        />
        <span className={styles.playerTime}>{formatTime(duration)}</span>
        <button type="button" aria-label={muted ? "Unmute" : "Mute"} onClick={toggleMuted}>
          {muted ? <SpeakerSimpleSlash size={18} /> : <SpeakerSimpleHigh size={18} />}
        </button>
        <button type="button" aria-label="Enter fullscreen" onClick={() => void enterFullscreen()}>
          <ArrowsOut size={18} />
        </button>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}
