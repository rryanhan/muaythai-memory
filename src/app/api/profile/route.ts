import { NextRequest, NextResponse } from "next/server";
import { AvatarValidationError } from "@/modules/profile/avatar";
import { profileResponseSchema } from "@/modules/profile/contracts";
import { ProfileUpdateError, updateProfile } from "@/modules/profile/mutations";
import { authenticationErrorResponse, requireCurrentAppUser } from "@/modules/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: NextRequest) {
  try {
    const currentUser = await requireCurrentAppUser();
    const formData = await request.formData();
    const username = formData.get("username");
    const firstName = formData.get("firstName");
    const lastName = formData.get("lastName");
    const location = formData.get("location");
    const avatarEntry = formData.get("avatar");
    const removeAvatarEntry = formData.get("removeAvatar");

    if (
      typeof username !== "string" ||
      typeof firstName !== "string" ||
      typeof lastName !== "string" ||
      typeof location !== "string"
    ) {
      return NextResponse.json({ error: "Profile fields are invalid." }, { status: 400 });
    }
    if (avatarEntry !== null && !(avatarEntry instanceof File)) {
      return NextResponse.json({ error: "Profile photo must be an uploaded file." }, { status: 400 });
    }
    if (removeAvatarEntry !== null && removeAvatarEntry !== "true" && removeAvatarEntry !== "false") {
      return NextResponse.json({ error: "Invalid profile photo removal state." }, { status: 400 });
    }

    const profile = await updateProfile(currentUser, {
      username,
      firstName,
      lastName,
      location,
      avatar: avatarEntry,
      removeAvatar: removeAvatarEntry === "true",
    });
    return NextResponse.json(profileResponseSchema.parse({ profile }));
  } catch (error) {
    const authResponse = authenticationErrorResponse(error);
    if (authResponse) return authResponse;

    if (error instanceof AvatarValidationError || error instanceof ProfileUpdateError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Profile update failed.", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Profile could not be saved. Try again." }, { status: 500 });
  }
}
