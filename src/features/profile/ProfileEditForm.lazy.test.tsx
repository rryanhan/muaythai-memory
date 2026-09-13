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

let originalBodyStyle: string | null | undefined;
let preservedBackground: HTMLElement | null = null;

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

afterAll(() => {
  cropSheetModule.resolveLoading();
  restoreBodyStyle();
  preservedBackground?.remove();
});

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
  originalBodyStyle = document.body.getAttribute("style");
  const originalBodyInert = document.body.getAttribute("inert");
  const originalBodyAriaHidden = document.body.getAttribute("aria-hidden");
  document.body.style.setProperty("overflow", "clip", "important");
  container.setAttribute("aria-hidden", "false");
  const existingBackground = document.createElement("aside");
  existingBackground.setAttribute("inert", "profile-preserved");
  existingBackground.setAttribute("aria-hidden", "false");
  preservedBackground = existingBackground;
  document.body.append(existingBackground);

  expect(cropSheetModule.loadStarted).not.toHaveBeenCalled();
  const fileInput = chooseFile(
    container,
    new File(["source"], "source.png", { type: "image/png" }),
  );

  const loadingDialog = await screen.findByRole("dialog", { name: "Preparing editor" });
  expect(container).not.toContainElement(loadingDialog);
  expect(loadingDialog.parentElement).toBe(document.body);
  expect(screen.getByRole("status")).toHaveTextContent("Loading photo editor…");
  expect(document.body.style.overflow).toBe("hidden");
  expect(document.body.style.getPropertyPriority("overflow")).toBe("important");
  expect(document.body.getAttribute("inert")).toBe(originalBodyInert);
  expect(document.body.getAttribute("aria-hidden")).toBe(originalBodyAriaHidden);
  expect(container).toHaveAttribute("inert", "");
  expect(container).toHaveAttribute("aria-hidden", "true");
  expect(existingBackground).toHaveAttribute("inert", "");
  expect(existingBackground).toHaveAttribute("aria-hidden", "true");
  const loadingCancel = within(loadingDialog).getByRole("button", { name: "Cancel" });
  expect(loadingCancel).toHaveFocus();
  fireEvent.keyDown(loadingDialog, { key: "Tab" });
  expect(loadingCancel).toHaveFocus();
  fireEvent.keyDown(loadingDialog, { key: "Tab", shiftKey: true });
  expect(loadingCancel).toHaveFocus();
  await waitFor(() => expect(cropSheetModule.loadStarted).toHaveBeenCalledOnce());

  fireEvent.keyDown(loadingDialog, { key: "Escape" });
  await waitFor(() => {
    expect(screen.queryByRole("dialog", { name: "Preparing editor" })).not.toBeInTheDocument();
    expect(fileInput).toHaveFocus();
    expect(document.body.style.overflow).toBe("clip");
    expect(document.body.style.getPropertyPriority("overflow")).toBe("important");
    expect(container).not.toHaveAttribute("inert");
    expect(container).toHaveAttribute("aria-hidden", "false");
  });
  expect(existingBackground).toHaveAttribute("inert", "profile-preserved");
  expect(existingBackground).toHaveAttribute("aria-hidden", "false");
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:profile-1");

  chooseFile(container, new File(["source again"], "source-again.png", { type: "image/png" }));
  expect(await screen.findByRole("dialog", { name: "Preparing editor" })).toBeVisible();

  await act(async () => {
    cropSheetModule.resolveLoading();
    await cropSheetModule.loadingGate;
  });

  expect(await screen.findByText("Crop source: blob:profile-2")).toBeVisible();
  expect(document.body.style.overflow).toBe("clip");
  expect(document.body.style.getPropertyPriority("overflow")).toBe("important");
  expect(container).not.toHaveAttribute("inert");
  expect(container).toHaveAttribute("aria-hidden", "false");
  expect(existingBackground).toHaveAttribute("inert", "profile-preserved");
  expect(existingBackground).toHaveAttribute("aria-hidden", "false");
  expect(cropSheetModule.loadStarted).toHaveBeenCalledOnce();
  unmount();
  restoreBodyStyle();
  existingBackground.remove();
  preservedBackground = null;
});

function renderForm() {
  return render(
    <ProfileEditForm
      initialProfile={currentUser}
      onDirtyChange={vi.fn()}
      onSavePendingChange={vi.fn()}
      onCancel={vi.fn()}
      onSaved={vi.fn()}
    />,
  );
}

function chooseFile(container: HTMLElement, file: File) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("Profile photo input was not rendered.");
  input.focus();
  fireEvent.change(input, { target: { files: [file] } });
  return input;
}

function restoreBodyStyle() {
  if (originalBodyStyle === undefined) return;
  if (originalBodyStyle === null) document.body.removeAttribute("style");
  else document.body.setAttribute("style", originalBodyStyle);
  originalBodyStyle = undefined;
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
