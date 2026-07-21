import type { CaptureModelSchema, ModelCaptureDraft } from "../contracts";

export type CaptureDraftProviderInput = {
  instructions: string;
  prompt: string;
  schema: CaptureModelSchema;
  signal?: AbortSignal;
};

export interface CaptureDraftProvider {
  generate(input: CaptureDraftProviderInput): Promise<ModelCaptureDraft>;
}
