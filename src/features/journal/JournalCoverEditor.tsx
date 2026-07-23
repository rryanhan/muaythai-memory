"use client";

import { useEffect, useRef, useState } from "react";
import { Drawer } from "vaul";
import { useDrawerFocus } from "@/features/media/use-drawer-focus";
import { createVideoPosterAtTime, type GeneratedVideoPoster } from "./create-video-poster";
import styles from "./JournalMedia.module.css";

type JournalCoverEditorProps = {
  file: File;
  initialTimeSeconds: number | null;
  onCancel: () => void;
  onUseCover: (poster: GeneratedVideoPoster) => void;
};

export function JournalCoverEditor({ file, initialTimeSeconds, onCancel, onUseCover }: JournalCoverEditorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const extractionAbortRef = useRef<AbortController | null>(null);
  const contentRef = useDrawerFocus(true);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [timeSeconds, setTimeSeconds] = useState(initialTimeSeconds ?? 0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const nextUrl = URL.createObjectURL(file);
    setSourceUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  useEffect(() => () => extractionAbortRef.current?.abort(), []);

  function seek(nextTime: number) {
    const video = videoRef.current;
    setTimeSeconds(nextTime);
    if (video) video.currentTime = nextTime;
  }

  async function useCover() {
    if (pending) return;
    const controller = new AbortController();
    extractionAbortRef.current = controller;
    setPending(true);
    setError(null);
    try {
      onUseCover(await createVideoPosterAtTime(file, timeSeconds, { signal: controller.signal }));
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setPending(false);
      setError(caught instanceof Error ? caught.message : "Cover could not be prepared.");
    } finally {
      if (extractionAbortRef.current === controller) extractionAbortRef.current = null;
    }
  }

  return (
    <Drawer.Root
      open
      direction="bottom"
      dismissible={!pending}
      autoFocus={false}
      onOpenChange={(open) => !open && !pending && onCancel()}
    >
      <Drawer.Portal>
        <Drawer.Overlay className={styles.coverBackdrop} />
        <Drawer.Content
          ref={contentRef}
          className={styles.coverSheet}
          aria-describedby="journal-cover-description"
        >
          <Drawer.Handle className="drawer-handle" />
          <header className={styles.coverHeader}>
            <div>
              <p className="eyebrow">Progress Journal</p>
              <Drawer.Title>Choose cover</Drawer.Title>
            </div>
            <Drawer.Description id="journal-cover-description">
              Move through the video and stop on the frame you want shown in Profile.
            </Drawer.Description>
          </header>

          <div className={styles.coverStage}>
            {sourceUrl && (
              <video
                ref={videoRef}
                src={sourceUrl}
                muted
                playsInline
                preload="auto"
                onLoadedMetadata={(event) => {
                  const nextDuration = Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0;
                  setDuration(nextDuration);
                  seek(Math.min(initialTimeSeconds ?? nextDuration * 0.2, nextDuration));
                }}
                onError={() => setError("This browser cannot decode the video to choose a cover.")}
              />
            )}
          </div>

          <div className={styles.coverTimeline}>
            <span>{formatTime(timeSeconds)}</span>
            <input
              type="range"
              min="0"
              max={Math.max(duration, 0)}
              step="0.04"
              value={Math.min(timeSeconds, duration || 0)}
              disabled={!duration || pending}
              aria-label="Cover frame position"
              onChange={(event) => seek(Number(event.target.value))}
            />
            <span>{formatTime(duration)}</span>
          </div>

          {error && <p className={styles.coverError} role="alert">{error}</p>}
          <div className={styles.coverActions}>
            <button type="button" disabled={pending} data-drawer-initial-focus onClick={onCancel}>Cancel</button>
            <button type="button" disabled={pending || !duration || Boolean(error)} onClick={() => void useCover()}>
              {pending ? "Preparing..." : "Use Cover"}
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}
