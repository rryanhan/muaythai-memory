import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { modelCaptureDraftSchema, type ModelCaptureDraft } from "../contracts";
import { CaptureDraftCancelledError, CaptureDraftConfigError, CaptureDraftGenerationError } from "../errors";
import type { CaptureDraftProvider, CaptureDraftProviderInput } from "./types";

export function createOpenAiCaptureProvider(): CaptureDraftProvider {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_CAPTURE_MODEL;

  if (!apiKey || !model) {
    throw new CaptureDraftConfigError(
      "OpenAI capture is not configured.",
      "Set OPENAI_API_KEY and OPENAI_CAPTURE_MODEL in .env.local.",
    );
  }

  const client = new OpenAI({ apiKey });

  return {
    async generate(input: CaptureDraftProviderInput): Promise<ModelCaptureDraft> {
      try {
        const response = await client.responses.create(
          {
            model,
            instructions: input.instructions,
            input: input.prompt,
            text: {
              format: zodTextFormat(modelCaptureDraftSchema, "muay_thai_drill_capture_cleanup"),
            },
            max_output_tokens: 700,
          },
          { signal: input.signal },
        );

        return modelCaptureDraftSchema.parse(JSON.parse(response.output_text));
      } catch (error) {
        if (input.signal?.aborted) {
          throw new CaptureDraftCancelledError();
        }

        const status = getHttpStatus(error);

        if (status === 401) {
          throw new CaptureDraftConfigError(
            "OpenAI rejected the configured API key.",
            "Create a valid project API key and update OPENAI_API_KEY in .env.local.",
          );
        }

        if (status === 429) {
          throw new CaptureDraftGenerationError(
            "OpenAI quota is unavailable. Add API credit or switch CAPTURE_DRAFT_PROVIDER to ollama.",
          );
        }

        throw new CaptureDraftGenerationError("OpenAI could not generate a readable drill draft.");
      }
    },
  };
}

function getHttpStatus(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("status" in error)) return null;
  return typeof error.status === "number" ? error.status : null;
}
