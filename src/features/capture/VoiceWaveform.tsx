"use client";

import { useEffect, useRef } from "react";
import styles from "./Capture.module.css";
import {
  appendWaveformPoint,
  computeWaveformPoint,
  REDUCED_MOTION_WAVEFORM_INTERVAL_MS,
  WAVEFORM_HISTORY_SIZE,
  WAVEFORM_SAMPLE_INTERVAL_MS,
} from "./waveform";

type VoiceWaveformProps = {
  active: boolean;
  stream: MediaStream | null;
};

export function VoiceWaveform({ active, stream }: VoiceWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) return;
    const canvas: HTMLCanvasElement = canvasElement;

    let animationFrame = 0;
    let lastDrawAt = 0;
    let audioContext: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let resizeObserver: ResizeObserver | null = null;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const computedStyles = window.getComputedStyle(canvas);
    const palette = {
      accent: computedStyles.getPropertyValue("--accent").trim() || "#D14A32",
      border: computedStyles.getPropertyValue("--border").trim() || "#D8D6CC",
    };
    const waveformHistory = new Float32Array(WAVEFORM_HISTORY_SIZE);
    let smoothedPoint = 0;

    function resizeCanvas() {
      const bounds = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(bounds.width * pixelRatio));
      const height = Math.max(1, Math.round(bounds.height * pixelRatio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      drawWaveform(canvas, waveformHistory, active, palette);
    }

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(resizeCanvas);
      resizeObserver.observe(canvas);
    } else {
      window.addEventListener("resize", resizeCanvas);
    }
    resizeCanvas();

    if (active && stream && typeof AudioContext !== "undefined") {
      try {
        audioContext = new AudioContext();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.4;
        source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        void audioContext.resume().catch(() => undefined);

        const samples = new Uint8Array(analyser.fftSize);
        const draw = (timestamp: number) => {
          animationFrame = window.requestAnimationFrame(draw);
          const interval = reducedMotion
            ? REDUCED_MOTION_WAVEFORM_INTERVAL_MS
            : WAVEFORM_SAMPLE_INTERVAL_MS;
          if (timestamp - lastDrawAt < interval) return;
          lastDrawAt = timestamp;
          analyser?.getByteTimeDomainData(samples);
          smoothedPoint = computeWaveformPoint(samples, smoothedPoint);
          appendWaveformPoint(waveformHistory, smoothedPoint);
          drawWaveform(canvas, waveformHistory, true, palette);
        };
        animationFrame = window.requestAnimationFrame(draw);
      } catch {
        // Recording still works when Web Audio visualization is unavailable.
        drawWaveform(canvas, waveformHistory, false, palette);
      }
    }

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", resizeCanvas);
      source?.disconnect();
      analyser?.disconnect();
      if (audioContext && audioContext.state !== "closed") {
        void audioContext.close().catch(() => undefined);
      }
    };
  }, [active, stream]);

  return (
    <canvas
      ref={canvasRef}
      className={styles.voiceWaveform}
      data-active={active ? "true" : "false"}
      aria-hidden="true"
    />
  );
}

function drawWaveform(
  canvas: HTMLCanvasElement,
  history: Float32Array,
  active: boolean,
  palette: { accent: string; border: string },
) {
  const context = canvas.getContext("2d");
  if (!context) return;

  const width = canvas.width;
  const height = canvas.height;
  const centerY = height / 2;
  const pixelRatio = Math.min(canvas.width / Math.max(canvas.clientWidth, 1), 2);

  context.clearRect(0, 0, width, height);
  context.beginPath();
  context.moveTo(0, centerY);
  context.lineTo(width, centerY);
  context.strokeStyle = palette.border;
  context.lineWidth = pixelRatio;
  context.globalAlpha = 0.72;
  context.stroke();

  if (!active) {
    context.globalAlpha = 1;
    return;
  }

  context.strokeStyle = palette.accent;
  context.lineWidth = 2 * pixelRatio;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.globalAlpha = 0.96;

  const maximumAmplitude = height * 0.44;
  drawWaveformPath(context, history, width, centerY, maximumAmplitude);
  context.globalAlpha = 1;
}

function drawWaveformPath(
  context: CanvasRenderingContext2D,
  history: Float32Array,
  width: number,
  centerY: number,
  maximumAmplitude: number,
) {
  if (history.length < 2) return;

  const stepX = width / (history.length - 1);
  context.beginPath();
  context.moveTo(0, centerY + history[0] * maximumAmplitude);

  for (let index = 1; index < history.length - 1; index += 1) {
    const currentX = index * stepX;
    const nextX = (index + 1) * stepX;
    const currentY = centerY + history[index] * maximumAmplitude;
    const nextY = centerY + history[index + 1] * maximumAmplitude;
    context.quadraticCurveTo(currentX, currentY, (currentX + nextX) / 2, (currentY + nextY) / 2);
  }

  context.lineTo(width, centerY + history[history.length - 1] * maximumAmplitude);
  context.stroke();
}
