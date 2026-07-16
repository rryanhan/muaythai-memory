import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import type { CurrentAppUser } from "@/modules/auth";
import {
  removeOtherUserAvatars,
  removeUploadedAvatar,
  uploadProfileAvatar,
  type UploadedAvatar,
} from "./avatar";
import { profileDisplayNameSchema, type ProfileDto } from "./contracts";

export type UpdateProfileInput = {
  displayName: string;
  avatar: File | null;
  removeAvatar: boolean;
};

export class ProfileUpdateError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ProfileUpdateError";
    this.status = status;
  }
}

export async function updateProfile(currentUser: CurrentAppUser, input: UpdateProfileInput): Promise<ProfileDto> {
  const displayNameResult = profileDisplayNameSchema.safeParse(input.displayName);
  if (!displayNameResult.success) {
    throw new ProfileUpdateError(displayNameResult.error.issues[0]?.message ?? "Enter a valid display name.");
  }
  if (input.avatar && input.removeAvatar) {
    throw new ProfileUpdateError("Choose either a new profile photo or remove the existing one.");
  }

  let uploadedAvatar: UploadedAvatar | null = null;
  try {
    if (input.avatar) uploadedAvatar = await uploadProfileAvatar(currentUser.id, input.avatar);

    const avatarUrl = uploadedAvatar?.publicUrl ?? (input.removeAvatar ? null : currentUser.avatarUrl);
    const [updatedUser] = await db
      .update(users)
      .set({
        displayName: displayNameResult.data,
        avatarUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.id, currentUser.id))
      .returning({ id: users.id, displayName: users.displayName, avatarUrl: users.avatarUrl });

    if (!updatedUser) throw new ProfileUpdateError("Profile could not be found.", 404);

    if (uploadedAvatar || input.removeAvatar) {
      await removeOtherUserAvatars(currentUser.id, uploadedAvatar?.path ?? null).catch((error) => {
        console.error("Profile avatar cleanup failed.", error instanceof Error ? error.message : error);
      });
    }

    return { ...updatedUser, email: currentUser.email };
  } catch (error) {
    if (uploadedAvatar) {
      await removeUploadedAvatar(uploadedAvatar.path).catch(() => undefined);
    }
    throw error;
  }
}
