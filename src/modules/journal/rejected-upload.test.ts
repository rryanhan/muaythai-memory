import { describe, expect, it, vi } from "vitest";
import { cleanupRejectedJournalUpload } from "./rejected-upload";

describe("cleanupRejectedJournalUpload", () => {
  it("removes the video and poster before deleting the upload record", async () => {
    const order: string[] = [];
    const removeObjects = vi.fn(async (paths: string[]) => {
      order.push(`storage:${paths.join(",")}`);
      return { error: null };
    });
    const deleteUploadRecord = vi.fn(async () => {
      order.push("database");
    });

    await expect(cleanupRejectedJournalUpload(
      ["user/entry/video.mp4", "user/entry/poster.webp"],
      { removeObjects, deleteUploadRecord },
    )).resolves.toEqual({ ok: true });
    expect(order).toEqual([
      "storage:user/entry/video.mp4,user/entry/poster.webp",
      "database",
    ]);
  });

  it("preserves the upload record when Storage reports cleanup failure", async () => {
    const removeObjects = vi.fn().mockResolvedValue({
      error: { message: "storage unavailable" },
    });
    const deleteUploadRecord = vi.fn();

    const result = await cleanupRejectedJournalUpload(
      ["user/entry/video.mp4", "user/entry/poster.webp"],
      { removeObjects, deleteUploadRecord },
    );

    expect(result).toEqual({
      ok: false,
      error: { message: "storage unavailable" },
    });
    expect(removeObjects).toHaveBeenCalledWith([
      "user/entry/video.mp4",
      "user/entry/poster.webp",
    ]);
    expect(deleteUploadRecord).not.toHaveBeenCalled();
  });

  it("preserves the upload record when Storage throws", async () => {
    const failure = new Error("network failed");
    const deleteUploadRecord = vi.fn();

    await expect(cleanupRejectedJournalUpload(
      ["user/entry/video.mp4"],
      {
        removeObjects: vi.fn().mockRejectedValue(failure),
        deleteUploadRecord,
      },
    )).resolves.toEqual({ ok: false, error: failure });
    expect(deleteUploadRecord).not.toHaveBeenCalled();
  });
});
