import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JournalUploadIntentResponse } from "@/modules/journal/contracts";

type PreviousUpload = {
  size: number | null;
  metadata: Record<string, string>;
  creationTime: string;
  urlStorageKey: string;
  uploadUrl: string | null;
  parallelUploadUrls: string[] | null;
};

type UploadOptions = {
  endpoint: string;
  headers: Record<string, string>;
  metadata: Record<string, string>;
  onSuccess: () => void;
};

const mocks = vi.hoisted(() => ({
  instances: [] as Array<{
    options: UploadOptions;
    resumeFromPreviousUpload: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
  }>,
  previousUploads: [] as PreviousUpload[],
}));

vi.mock("tus-js-client", () => ({
  Upload: class {
    options: UploadOptions;
    resumeFromPreviousUpload = vi.fn();
    start = vi.fn(() => this.options.onSuccess());

    constructor(_file: File, options: UploadOptions) {
      this.options = options;
      mocks.instances.push(this);
    }

    abort() {
      return Promise.resolve();
    }

    findPreviousUploads() {
      return Promise.resolve(mocks.previousUploads);
    }
  },
}));

import { uploadJournalVideo } from "./upload-journal-video";

const endpoint = "https://staging.storage.supabase.co/storage/v1/upload/resumable/sign";

beforeEach(() => {
  mocks.instances = [];
  mocks.previousUploads = [];
});

describe("uploadJournalVideo resumptions", () => {
  it("resumes the newest upload for the exact current object intent", async () => {
    const currentIntent = intent("user/current/video.mp4", "current-token");
    const older = previousUpload(currentIntent.upload.path, "older", "2026-07-23T10:00:00Z");
    const newer = previousUpload(currentIntent.upload.path, "newer", "2026-07-23T11:00:00Z");
    mocks.previousUploads = [
      previousUpload("user/superseded/video.mp4", "stale", "2026-07-23T12:00:00Z"),
      older,
      newer,
    ];

    await upload(currentIntent);

    expect(mocks.instances[0]?.resumeFromPreviousUpload).toHaveBeenCalledOnce();
    expect(mocks.instances[0]?.resumeFromPreviousUpload).toHaveBeenCalledWith(newer);
  });

  it("starts fresh when the same file fingerprint has a new path and token", async () => {
    const interruptedIntent = intent("user/old-entry/video.mp4", "expired-token");
    mocks.previousUploads = [
      previousUpload(interruptedIntent.upload.path, "interrupted", "2026-07-23T12:00:00Z"),
    ];
    const replacementIntent = intent("user/new-entry/video.mp4", "fresh-token");

    await upload(replacementIntent);

    const instance = mocks.instances[0];
    expect(instance?.resumeFromPreviousUpload).not.toHaveBeenCalled();
    expect(instance?.options.metadata.objectName).toBe(replacementIntent.upload.path);
    expect(instance?.options.headers).toEqual({ "x-signature": "fresh-token" });
    expect(instance?.start).toHaveBeenCalledOnce();
  });

  it.each([
    {
      label: "another bucket",
      previous: previousUpload("user/current/video.mp4", "wrong-bucket", "2026-07-23T12:00:00Z", {
        bucketName: "profile-media",
      }),
    },
    {
      label: "another Supabase project",
      previous: previousUpload("user/current/video.mp4", "wrong-project", "2026-07-23T12:00:00Z", {
        uploadUrl: "https://production.storage.supabase.co/storage/v1/upload/resumable/wrong-project",
      }),
    },
  ])("ignores a matching object path from $label", async ({ previous }) => {
    mocks.previousUploads = [previous];

    await upload(intent("user/current/video.mp4", "current-token"));

    expect(mocks.instances[0]?.resumeFromPreviousUpload).not.toHaveBeenCalled();
    expect(mocks.instances[0]?.start).toHaveBeenCalledOnce();
  });
});

async function upload(currentIntent: JournalUploadIntentResponse): Promise<void> {
  await uploadJournalVideo({
    file: new File(["same bytes"], "round.mp4", {
      type: "video/mp4",
      lastModified: 1_700_000_000_000,
    }),
    intent: currentIntent,
    signal: new AbortController().signal,
    onProgress: vi.fn(),
  });
}

function intent(path: string, token: string): JournalUploadIntentResponse {
  return {
    entryId: "11111111-1111-4111-8111-111111111111",
    upload: { endpoint, path, token },
  };
}

function previousUpload(
  objectName: string,
  key: string,
  creationTime: string,
  overrides: {
    bucketName?: string;
    uploadUrl?: string;
  } = {},
): PreviousUpload {
  return {
    size: 10,
    metadata: {
      bucketName: overrides.bucketName ?? "journal-media",
      objectName,
      contentType: "video/mp4",
    },
    creationTime,
    urlStorageKey: key,
    uploadUrl: overrides.uploadUrl
      ?? `https://staging.storage.supabase.co/storage/v1/upload/resumable/${key}`,
    parallelUploadUrls: null,
  };
}
