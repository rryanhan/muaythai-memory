export const WAVEFORM_HISTORY_SIZE = 52;
export const WAVEFORM_SAMPLE_INTERVAL_MS = 40;
export const REDUCED_MOTION_WAVEFORM_INTERVAL_MS = 120;

const WAVEFORM_NOISE_FLOOR = 0.018;
const WAVEFORM_INPUT_GAIN = 4.8;
const WAVEFORM_SMOOTHING = 0.58;

/** Converts microphone samples into a stable signed point for the rolling trace. */
export function computeWaveformPoint(samples: Uint8Array, previousPoint: number): number {
  if (samples.length === 0) return clampSigned(previousPoint * WAVEFORM_SMOOTHING);

  let squareSum = 0;
  for (const sample of samples) {
    const centeredSample = (sample - 128) / 128;
    squareSum += centeredSample * centeredSample;
  }

  const rms = Math.sqrt(squareSum / samples.length);
  const gatedAmplitude = clamp((rms - WAVEFORM_NOISE_FLOOR) * WAVEFORM_INPUT_GAIN);
  const latestSample = (samples[samples.length - 1] - 128) / 128;
  const direction = Math.sign(latestSample) || Math.sign(previousPoint) || 1;
  const targetPoint = gatedAmplitude * direction;
  return clampSigned(
    previousPoint * WAVEFORM_SMOOTHING + targetPoint * (1 - WAVEFORM_SMOOTHING),
  );
}

/** Advances the rolling display history without allocating on every animation frame. */
export function appendWaveformPoint(history: Float32Array, point: number) {
  if (history.length === 0) return;
  history.copyWithin(0, 1);
  history[history.length - 1] = clampSigned(point);
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function clampSigned(value: number) {
  return Math.min(1, Math.max(-1, value));
}
