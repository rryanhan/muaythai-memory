import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import type { CurrentAppUser } from "@/modules/auth";
import { ProfileEditForm } from "./ProfileEditForm";

const mocks = vi.hoisted(() => ({
  prepareImageForClientDecode: vi.fn(),
  updateProfile: vi.fn(),
}));

const cropSheetModule = vi.hoisted(() => {
  let resolveLoading!: () => void;
  const loadingGate = new Promise<void>((resolve) => {
    resolveLoading = resolve;
  });

  return { loadStarted: vi.fn(), loadingGate, resolveLoading };
});

vi.mock("@/features/media/prepare-image-for-decode", () => ({
  prepareImageForClientDecode: mocks.prepareImageForClientDecode,
}));
vi.mock("@/data/profile", () => ({ updateProfile: mocks.updateProfile }));
vi.mock("./ProfileAvatar", () => ({ ProfileAvatar: () => <span>Avatar preview</span> }));
vi.mock("./AvatarCropSheet", async () => {
  cropSheetModule.loadStarted();
  await cropSheetModule.loadingGate;
  return {
    AvatarCropSheet: ({ imageUrl }: { imageUrl: string }) => <span>Crop source: {imageUrl}</span>,
  };
});

afterAll(() => cropSheetModule.resolveLoading());

beforeEach(() => {
  vi.clearAllMocks();
  let nextObjectUrl = 0;
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:profile-${++nextObjectUrl}`);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
});

it("loads the crop editor on demand once and keeps the cold fallback cancellable", async () => {
  mocks.prepareImageForClientDecode.mockResolvedValue(
    new File(["prepared"], "prepared.png", { type: "image/png" }),
  );
  const { container, unmount } = renderForm();

  expect(cropSheetModule.loadStarted).not.toHaveBeenCalled();
  chooseFile(container, new File(["source"], "source.png", { type: "image/png" }));

  const loadingDialog = await screen.findByRole("dialog", { name: "Preparing editor" });
  expect(screen.getByRole("status")).toHaveTextContent("Loading photo editor…");
  const loadingCancel = within(loadingDialog).getByRole("button", { name: "Cancel" });
  expect(loadingCancel).toHaveFocus();
  fireEvent.keyDown(loadingDialog, { key: "Tab" });
  expect(loadingCancel).toHaveFocus();
  await waitFor(() => expect(cropSheetModule.loadStarted).toHaveBeenCalledOnce());

  fireEvent.keyDown(loadingDialog, { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "Preparing editor" })).not.toBeInTheDocument();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:profile-1");

  chooseFile(container, new File(["source again"], "source-again.png", { type: "image/png" }));
  expect(await screen.findByRole("dialog", { name: "Preparing editor" })).toBeVisible();

  await act(async () => {
    cropSheetModule.resolveLoading();
    await cropSheetModule.loadingGate;
  });

  expect(await screen.findByText("Crop source: blob:profile-2")).toBeVisible();
  expect(cropSheetModule.loadStarted).toHaveBeenCalledOnce();
  unmount();
});

function renderForm() {
  return render(
    <ProfileEditForm
      initialProfile={currentUser}
      onDirtyChange={vi.fn()}
      onCancel={vi.fn()}
      onSaved={vi.fn()}
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
