import type { ModelCaptureDraft } from "../contracts";

export type CaptureDraftProviderInput = {
  instructions: string;
  prompt: string;
  signal?: AbortSignal;
};

export interface CaptureDraftProvider {
  generate(input: CaptureDraftProviderInput): Promise<ModelCaptureDraft>;
}
