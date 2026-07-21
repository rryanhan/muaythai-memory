import { profileResponseSchema, type ProfileDto } from "@/modules/profile/contracts";
import { ApiError, fetchJson } from "./api-core";
import type { ApiClientOptions } from "./types";

export type UpdateProfileInput = {
  username: string;
  firstName?: string;
  lastName?: string;
  location?: string;
  avatar?: File | null;
  removeAvatar?: boolean;
};

export async function updateProfile(
  input: UpdateProfileInput,
  options: ApiClientOptions = {},
): Promise<ProfileDto> {
  const formData = new FormData();
  formData.set("username", input.username);
  formData.set("firstName", input.firstName ?? "");
  formData.set("lastName", input.lastName ?? "");
  formData.set("location", input.location ?? "");
  formData.set("removeAvatar", String(input.removeAvatar ?? false));
  if (input.avatar) formData.set("avatar", input.avatar);

  try {
    const response = await fetchJson("/api/profile", profileResponseSchema, options, {
      method: "PATCH",
      body: formData,
    });
    return response.profile;
  } catch (error) {
    if (error instanceof ApiError && hasErrorMessage(error.responseBody)) {
      throw new Error(error.responseBody.error);
    }
    throw error;
  }
}

function hasErrorMessage(value: unknown): value is { error: string } {
  return typeof value === "object" && value !== null && "error" in value && typeof value.error === "string";
}
