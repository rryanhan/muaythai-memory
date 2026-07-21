import { z } from "zod";
import type { ModelCaptureDraft } from "../contracts";
import { CaptureDraftCancelledError, CaptureDraftConfigError, CaptureDraftGenerationError } from "../errors";
import type { CaptureDraftProvider, CaptureDraftProviderInput } from "./types";

const ollamaChatResponseSchema = z.object({
  message: z.object({
    content: z.string(),
  }),
});

export function createOllamaCaptureProvider(): CaptureDraftProvider {
  const baseUrl = normalizeBaseUrl(process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434");
  const model = process.env.OLLAMA_CAPTURE_MODEL?.trim() || "qwen3:4b-instruct";
  return {
    async generate(input: CaptureDraftProviderInput): Promise<ModelCaptureDraft> {
      const jsonSchema = z.toJSONSchema(input.schema);
      let response: Response;

      try {
        response = await fetch(`${baseUrl}/api/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            stream: false,
            think: false,
            format: jsonSchema,
            keep_alive: "60m",
            options: {
              temperature: 0,
              num_predict: 480,
            },
            messages: [
              { role: "system", content: input.instructions },
              { role: "user", content: input.prompt },
            ],
          }),
          signal: input.signal
            ? AbortSignal.any([input.signal, AbortSignal.timeout(120_000)])
            : AbortSignal.timeout(120_000),
        });
      } catch (error) {
        if (input.signal?.aborted) {
          throw new CaptureDraftCancelledError();
        }

        if (isAbortError(error)) {
          throw new CaptureDraftGenerationError("The local Ollama model took too long to respond.");
        }

        throw new CaptureDraftConfigError(
          "The app could not reach Ollama.",
          "Start Ollama, then confirm it is listening at OLLAMA_BASE_URL.",
        );
      }

      if (!response.ok) {
        const detail = await readOllamaError(response);

        if (response.status === 404) {
          throw new CaptureDraftConfigError(
            `The Ollama model ${model} is not installed.`,
            `Run: ollama pull ${model}`,
          );
        }

        throw new CaptureDraftGenerationError(detail || "Ollama could not generate a drill draft.");
      }

      try {
        const payload = ollamaChatResponseSchema.parse(await response.json());
        return input.schema.parse(JSON.parse(payload.message.content));
      } catch {
        throw new CaptureDraftGenerationError("Ollama returned a draft shape the app could not read.");
      }
    },
  };
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

async function readOllamaError(response: Response): Promise<string | null> {
  try {
    const payload = z.object({ error: z.string() }).parse(await response.json());
    return payload.error;
  } catch {
    return null;
  }
}
