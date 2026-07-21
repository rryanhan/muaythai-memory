import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ZodType } from "zod";
import { modelCaptureDraftSchema, type ModelCaptureDraft } from "../contracts";
import {
  CaptureDraftCancelledError,
  CaptureDraftConfigError,
  CaptureDraftGenerationError,
} from "../errors";
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
            reasoning: { effort: "low" },
            text: {
              format: zodTextFormat(input.schema, "muay_thai_drill_capture_cleanup"),
            },
            max_output_tokens: 2_000,
          },
          { signal: input.signal },
        );

        return parseOpenAiCaptureResponse(response, input.schema);
      } catch (error) {
        if (input.signal?.aborted) {
          throw new CaptureDraftCancelledError();
        }

        if (error instanceof CaptureDraftGenerationError) throw error;

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

type OpenAiCaptureResponse = {
  status?: string;
  output_text: string;
  incomplete_details?: { reason?: string } | null;
};

export function parseOpenAiCaptureResponse(
  response: OpenAiCaptureResponse,
  schema: ZodType<ModelCaptureDraft> = modelCaptureDraftSchema,
): ModelCaptureDraft {
  if (response.status === "incomplete") {
    const reason = response.incomplete_details?.reason;
    throw new CaptureDraftGenerationError(
      reason === "max_output_tokens"
        ? "OpenAI ran out of output space while cleaning this drill. Try again."
        : "OpenAI could not finish cleaning this drill. Try again.",
    );
  }

  if (!response.output_text.trim()) {
    throw new CaptureDraftGenerationError("OpenAI completed without returning a drill draft.");
  }

  try {
    return schema.parse(JSON.parse(response.output_text));
  } catch {
    throw new CaptureDraftGenerationError("OpenAI returned an invalid drill draft.");
  }
}

function getHttpStatus(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("status" in error)) return null;
  return typeof error.status === "number" ? error.status : null;
}
