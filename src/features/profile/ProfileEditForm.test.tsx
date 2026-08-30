import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentAppUser } from "@/modules/auth";
import { ProfileEditForm } from "./ProfileEditForm";

const mocks = vi.hoisted(() => ({
  prepareImageForClientDecode: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock("@/features/media/prepare-image-for-decode", () => ({
  prepareImageForClientDecode: mocks.prepareImageForClientDecode,
}));

vi.mock("@/data/profile", () => ({
  updateProfile: mocks.updateProfile,
}));

vi.mock("./ProfileAvatar", () => ({
  ProfileAvatar: ({ profile }: { profile: { avatarUrl: string | null } }) => (
    <span>Avatar preview: {profile.avatarUrl ?? "none"}</span>
  ),
}));

vi.mock("./AvatarCropSheet", () => ({
  AvatarCropSheet: ({
    imageUrl,
    onUsePhoto,
  }: {
    imageUrl: string;
    onUsePhoto: (file: File) => void;
  }) => (
    <div>
      <span>Crop source: {imageUrl}</span>
      <button
        type="button"
        onClick={() => onUsePhoto(new File(["cropped"], "profile-avatar.webp", { type: "image/webp" }))}
      >
        Use mocked photo
      </button>
    </div>
  ),
}));

describe("ProfileEditForm object URL ownership", () => {
  const createObjectURL = vi.spyOn(URL, "createObjectURL");
  const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL");

  beforeEach(() => {
    vi.clearAllMocks();
    let nextObjectUrl = 0;
    createObjectURL.mockImplementation(() => `blob:profile-${++nextObjectUrl}`);
    revokeObjectURL.mockImplementation(() => undefined);
    mocks.updateProfile.mockResolvedValue(undefined);
  });

  afterEach(() => {
    createObjectURL.mockReset();
    revokeObjectURL.mockReset();
  });

  it("does not create a crop URL when image preparation resolves after unmount", async () => {
    let resolvePreparation: ((file: File) => void) | null = null;
    mocks.prepareImageForClientDecode.mockReturnValue(new Promise<File>((resolve) => {
      resolvePreparation = resolve;
    }));
    const { container, unmount } = renderForm();

    chooseFile(container, new File(["source"], "source.png", { type: "image/png" }));
    unmount();
    await act(async () => {
      resolvePreparation?.(new File(["prepared"], "prepared.png", { type: "image/png" }));
      await Promise.resolve();
    });

    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("revokes the crop URL on acceptance and keeps the preview URL until unmount", async () => {
    const prepared = new File(["prepared"], "prepared.png", { type: "image/png" });
    mocks.prepareImageForClientDecode.mockResolvedValue(prepared);
    const onSaved = vi.fn();
    const { container, unmount } = renderForm({ onSaved });

    chooseFile(container, new File(["source"], "source.png", { type: "image/png" }));
    expect(await screen.findByText("Crop source: blob:profile-1")).toBeVisible();
    expect(revokeObjectURL).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Use mocked photo" }));
    expect(screen.getByText("Avatar preview: blob:profile-2")).toBeVisible();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:profile-1");
    expect(revokeObjectURL).not.toHaveBeenCalledWith("blob:profile-2");

    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(mocks.updateProfile).toHaveBeenCalledWith(expect.objectContaining({
      avatar: expect.objectContaining({ name: "profile-avatar.webp", type: "image/webp" }),
      removeAvatar: false,
    }));

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:profile-2");
  });
});

function renderForm({ onSaved = vi.fn() }: { onSaved?: () => void } = {}) {
  return render(
    <ProfileEditForm
      initialProfile={currentUser}
      onDirtyChange={vi.fn()}
      onCancel={vi.fn()}
      onSaved={onSaved}
    />,
  );
}

function chooseFile(container: HTMLElement, file: File) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("Profile photo input was not rendered.");
  fireEvent.change(input, { target: { files: [file] } });
}

const currentUser: CurrentAppUser = {
  id: "00000000-0000-4000-8000-000000000001",
  displayName: "current_fighter",
  username: "current_fighter",
  firstName: null,
  lastName: null,
  location: null,
  avatarUrl: null,
  email: "current@example.com",
  profileOnboardedAt: new Date("2026-07-29T12:00:00Z"),
  firstDrillGuideCompletedAt: new Date("2026-07-29T12:00:00Z"),
  firstDrillGuideSkippedAt: null,
};
