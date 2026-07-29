import {
  blockFighterInputSchema,
  fighterProfileResponseSchema,
  fighterSearchResponseSchema,
  friendSectionPageResponseSchema,
  friendSectionSchema,
  friendMutationResponseSchema,
  friendsSummaryResponseSchema,
  removeFriendResponseSchema,
  reportFighterInputSchema,
  reportFighterResponseSchema,
  respondToFriendRequestInputSchema,
  sendFriendRequestInputSchema,
  type FighterConnection,
  type FighterProfile,
  type FriendSection,
  type FriendSectionPageResponse,
  type FriendMutationResponse,
  type FriendsSummaryResponse,
  type ReportFighterInput,
  type ReportFighterResponse,
  type RespondToFriendRequestInput,
} from "@/modules/friends/contracts";
import { ApiError, fetchJson } from "./api-core";
import type { ApiClientOptions } from "./types";

export type {
  FighterConnection,
  FighterProfile,
  FighterSummary,
  FriendMutationResponse,
  FriendReportReason,
  FriendSection,
  FriendSectionItem,
  FriendSectionPageResponse,
  FriendsSummaryResponse,
  FriendshipState,
  RespondToFriendRequestInput,
} from "@/modules/friends/contracts";

export async function getFriendsSummary(
  options: ApiClientOptions = {},
): Promise<FriendsSummaryResponse> {
  return fetchJson("/api/friends", friendsSummaryResponseSchema, options);
}

export async function getFriendSectionPage(
  section: FriendSection,
  cursor: string | null,
  options: ApiClientOptions = {},
): Promise<FriendSectionPageResponse> {
  const normalizedSection = friendSectionSchema.parse(section);
  const searchParams = new URLSearchParams({ section: normalizedSection, limit: "20" });
  if (cursor) searchParams.set("cursor", cursor);
  return fetchJson(
    `/api/friends?${searchParams.toString()}`,
    friendSectionPageResponseSchema,
    options,
  );
}

export async function searchFighter(
  username: string,
  options: ApiClientOptions = {},
): Promise<FighterConnection | null> {
  const normalizedUsername = sendFriendRequestInputSchema.shape.username.parse(username);
  const response = await requestWithReadableError(
    () => fetchJson(
      `/api/friends/search?username=${encodeURIComponent(normalizedUsername)}`,
      fighterSearchResponseSchema,
      options,
    ),
  );
  return response.fighter;
}

export async function getFighterProfile(
  username: string,
  options: ApiClientOptions = {},
): Promise<FighterProfile> {
  const normalizedUsername = sendFriendRequestInputSchema.shape.username.parse(username);
  const response = await requestWithReadableError(
    () => fetchJson(
      `/api/fighters/${encodeURIComponent(normalizedUsername)}`,
      fighterProfileResponseSchema,
      options,
    ),
  );
  return response.fighter;
}

export async function sendFriendRequest(
  username: string,
  options: ApiClientOptions = {},
): Promise<FriendMutationResponse> {
  const input = sendFriendRequestInputSchema.parse({ username });
  return requestWithReadableError(
    () => fetchJson("/api/friends/requests", friendMutationResponseSchema, options, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function respondToFriendRequest(
  userId: string,
  rawInput: RespondToFriendRequestInput,
  options: ApiClientOptions = {},
): Promise<FriendMutationResponse> {
  const input = respondToFriendRequestInputSchema.parse(rawInput);
  return requestWithReadableError(
    () => fetchJson(
      `/api/friends/requests/${encodeURIComponent(userId)}`,
      friendMutationResponseSchema,
      options,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      },
    ),
  );
}

export async function cancelFriendRequest(
  userId: string,
  options: ApiClientOptions = {},
): Promise<FriendMutationResponse> {
  return requestWithReadableError(
    () => fetchJson(
      `/api/friends/requests/${encodeURIComponent(userId)}`,
      friendMutationResponseSchema,
      options,
      { method: "DELETE" },
    ),
  );
}

export async function removeFriend(
  userId: string,
  options: ApiClientOptions = {},
): Promise<string> {
  const response = await requestWithReadableError(
    () => fetchJson(
      `/api/friends/${encodeURIComponent(userId)}`,
      removeFriendResponseSchema,
      options,
      { method: "DELETE" },
    ),
  );
  return response.removedUserId;
}

export async function blockFighter(
  userId: string,
  options: ApiClientOptions = {},
): Promise<FriendMutationResponse> {
  const input = blockFighterInputSchema.parse({ userId });
  return requestWithReadableError(
    () => fetchJson("/api/friends/blocks", friendMutationResponseSchema, options, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function unblockFighter(
  userId: string,
  options: ApiClientOptions = {},
): Promise<FriendMutationResponse> {
  return requestWithReadableError(
    () => fetchJson(
      `/api/friends/blocks/${encodeURIComponent(userId)}`,
      friendMutationResponseSchema,
      options,
      { method: "DELETE" },
    ),
  );
}

export async function reportFighter(
  rawInput: ReportFighterInput,
  options: ApiClientOptions = {},
): Promise<ReportFighterResponse> {
  const input = reportFighterInputSchema.parse(rawInput);
  return requestWithReadableError(
    () => fetchJson(
      "/api/friends/reports",
      reportFighterResponseSchema,
      options,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      },
    ),
  );
}

async function requestWithReadableError<T>(
  request: () => Promise<T>,
): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (error instanceof ApiError && hasErrorMessage(error.responseBody)) {
      throw new FriendsApiError(error.responseBody.error, error.status);
    }
    throw error;
  }
}

export class FriendsApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "FriendsApiError";
    this.status = status;
  }
}

function hasErrorMessage(value: unknown): value is { error: string } {
  return typeof value === "object"
    && value !== null
    && "error" in value
    && typeof value.error === "string";
}
