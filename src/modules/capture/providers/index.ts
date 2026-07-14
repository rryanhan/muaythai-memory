import { CaptureDraftConfigError } from "../errors";
import { createOllamaCaptureProvider } from "./ollama";
import { createOpenAiCaptureProvider } from "./openai";
import type { CaptureDraftProvider } from "./types";

export type CaptureDraftProviderName = "ollama" | "openai";

export function getCaptureDraftProvider(): CaptureDraftProvider {
  const provider = (process.env.CAPTURE_DRAFT_PROVIDER?.trim().toLowerCase() || "ollama") as string;

  if (provider === "ollama") return createOllamaCaptureProvider();
  if (provider === "openai") return createOpenAiCaptureProvider();

  throw new CaptureDraftConfigError(
    `Unknown capture draft provider: ${provider}.`,
    "Set CAPTURE_DRAFT_PROVIDER to ollama or openai.",
  );
}

export type { CaptureDraftProvider, CaptureDraftProviderInput } from "./types";
