import {
  authorizedConnectionPageResponseSchema,
  blockFighterInputSchema,
  connectionMutationResponseSchema,
  connectionSectionPageResponseSchema,
  connectionSectionSchema,
  connectionsSummaryResponseSchema,
  fighterProfileResponseSchema,
  fighterSearchResponseSchema,
  publicConnectionSectionSchema,
  reportFighterInputSchema,
  reportFighterResponseSchema,
  requestFollowInputSchema,
  respondToFollowRequestInputSchema,
  type AuthorizedConnectionPageResponse,
  type ConnectionMutationResponse,
  type ConnectionSection,
  type ConnectionSectionPageResponse,
  type ConnectionsSummaryResponse,
  type FighterConnection,
  type FighterProfile,
  type PublicConnectionSection,
  type ReportFighterInput,
  type ReportFighterResponse,
  type RespondToFollowRequestInput,
} from "@/modules/connections/contracts";
import { ApiError, fetchJson } from "./api-core";
import type { ApiClientOptions } from "./types";

export type {
  AuthorizedConnectionPageResponse,
  ConnectionCounts,
  ConnectionMutationResponse,
  ConnectionSection,
  ConnectionSectionItem,
  ConnectionSectionPageResponse,
  ConnectionsSummaryResponse,
  FighterConnection,
  FighterProfile,
  FighterSummary,
  FollowDirection,
  FollowStatus,
  PublicConnectionSection,
  ReportReason,
  RespondToFollowRequestInput,
} from "@/modules/connections/contracts";

export async function getConnectionsSummary(
  options: ApiClientOptions = {},
): Promise<ConnectionsSummaryResponse> {
  return fetchJson("/api/connections", connectionsSummaryResponseSchema, options);
}

export async function getConnectionSectionPage(
  section: ConnectionSection,
  cursor: string | null,
  options: ApiClientOptions = {},
): Promise<ConnectionSectionPageResponse> {
  const normalized = connectionSectionSchema.parse(section);
  const params = new URLSearchParams({ section: normalized, limit: "20" });
  if (cursor) params.set("cursor", cursor);
  return fetchJson(
    `/api/connections?${params.toString()}`,
    connectionSectionPageResponseSchema,
    options,
  );
}

export async function getAuthorizedConnectionPage(
  username: string,
  section: PublicConnectionSection,
  cursor: string | null,
  options: ApiClientOptions = {},
): Promise<AuthorizedConnectionPageResponse> {
  const normalizedUsername = requestFollowInputSchema.shape.username.parse(username);
  const normalizedSection = publicConnectionSectionSchema.parse(section);
  const params = new URLSearchParams({ section: normalizedSection, limit: "20" });
  if (cursor) params.set("cursor", cursor);
  return withReadableError(() => fetchJson(
    `/api/fighters/${encodeURIComponent(normalizedUsername)}/connections?${params.toString()}`,
    authorizedConnectionPageResponseSchema,
    options,
  ));
}

export async function searchFighter(
  username: string,
  options: ApiClientOptions = {},
): Promise<FighterConnection | null> {
  const normalized = requestFollowInputSchema.shape.username.parse(username);
  const response = await withReadableError(() => fetchJson(
    `/api/connections/search?username=${encodeURIComponent(normalized)}`,
    fighterSearchResponseSchema,
    options,
  ));
  return response.fighter;
}

export async function getFighterProfile(
  username: string,
  options: ApiClientOptions = {},
): Promise<FighterProfile> {
  const normalized = requestFollowInputSchema.shape.username.parse(username);
  const response = await withReadableError(() => fetchJson(
    `/api/fighters/${encodeURIComponent(normalized)}`,
    fighterProfileResponseSchema,
    options,
  ));
  return response.fighter;
}

export async function requestFollow(
  username: string,
  options: ApiClientOptions = {},
): Promise<ConnectionMutationResponse> {
  const input = requestFollowInputSchema.parse({ username });
  return withReadableError(() => fetchJson(
    "/api/follows",
    connectionMutationResponseSchema,
    options,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  ));
}

export async function cancelOrUnfollow(
  userId: string,
  options: ApiClientOptions = {},
): Promise<ConnectionMutationResponse> {
  return withReadableError(() => fetchJson(
    `/api/follows/${encodeURIComponent(userId)}`,
    connectionMutationResponseSchema,
    options,
    { method: "DELETE" },
  ));
}

export async function respondToFollowRequest(
  followerUserId: string,
  rawInput: RespondToFollowRequestInput,
  options: ApiClientOptions = {},
): Promise<ConnectionMutationResponse> {
  const input = respondToFollowRequestInputSchema.parse(rawInput);
  return withReadableError(() => fetchJson(
    `/api/follow-requests/${encodeURIComponent(followerUserId)}`,
    connectionMutationResponseSchema,
    options,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  ));
}

export async function blockFighter(
  userId: string,
  options: ApiClientOptions = {},
): Promise<ConnectionMutationResponse> {
  const input = blockFighterInputSchema.parse({ userId });
  return withReadableError(() => fetchJson(
    "/api/connections/blocks",
    connectionMutationResponseSchema,
    options,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  ));
}

export async function unblockFighter(
  userId: string,
  options: ApiClientOptions = {},
): Promise<ConnectionMutationResponse> {
  return withReadableError(() => fetchJson(
    `/api/connections/blocks/${encodeURIComponent(userId)}`,
    connectionMutationResponseSchema,
    options,
    { method: "DELETE" },
  ));
}

export async function reportFighter(
  rawInput: ReportFighterInput,
  options: ApiClientOptions = {},
): Promise<ReportFighterResponse> {
  const input = reportFighterInputSchema.parse(rawInput);
  return withReadableError(() => fetchJson(
    "/api/connections/reports",
    reportFighterResponseSchema,
    options,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  ));
}

async function withReadableError<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (error instanceof ApiError && hasErrorMessage(error.responseBody)) {
      throw new ConnectionsApiError(error.responseBody.error, error.status);
    }
    throw error;
  }
}

export class ConnectionsApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ConnectionsApiError";
    this.status = status;
  }
}

function hasErrorMessage(value: unknown): value is { error: string } {
  return typeof value === "object"
    && value !== null
    && "error" in value
    && typeof value.error === "string";
}
