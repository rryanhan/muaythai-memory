import {
  blockFighter,
  cancelOrUnfollow,
  findFighterByUsername,
  getConnectionSectionPage,
  getConnectionsSummary,
  getReciprocalConnectionCount,
  getReciprocalConnectionPage,
  removeLegacyFriendship,
  reportFighter,
  requestFollow,
  respondToFollowRequest,
  unblockFighter,
  type ConnectionMutationResponse,
  type FighterConnection as DirectedFighterConnection,
} from "@/modules/connections";
import type {
  FighterConnection,
  FriendMutationResponse,
  FriendReportReason,
  FriendSection,
  FriendSectionPageResponse,
  FriendsSummaryResponse,
  ReportFighterResponse,
  RespondToFriendRequestInput,
} from "./contracts";

export async function getLegacyFriendsSummary(
  currentUserId: string,
): Promise<FriendsSummaryResponse> {
  const [summary, friends] = await Promise.all([
    getConnectionsSummary(currentUserId),
    getReciprocalConnectionCount(currentUserId),
  ]);
  return {
    counts: {
      friends,
      incoming: summary.counts.incoming,
      outgoing: summary.counts.outgoing,
      blocked: summary.counts.blocked,
    },
  };
}

export async function getLegacyFriendSectionPage(
  currentUserId: string,
  section: FriendSection,
  cursor: string | null,
  limit = 20,
): Promise<FriendSectionPageResponse> {
  const page = section === "friends"
    ? await getReciprocalConnectionPage(currentUserId, cursor, limit)
    : await getConnectionSectionPage(currentUserId, section, cursor, limit);
  return { section, items: page.items, nextCursor: page.nextCursor };
}

export async function findLegacyFighterByUsername(
  currentUserId: string,
  username: string,
): Promise<FighterConnection | null> {
  const fighter = await findFighterByUsername(currentUserId, username);
  return fighter ? toLegacyConnection(fighter) : null;
}

export async function sendLegacyFriendRequest(
  currentUserId: string,
  username: string,
): Promise<FriendMutationResponse> {
  return toLegacyMutation(await requestFollow(currentUserId, username));
}

export async function cancelLegacyFriendRequest(
  currentUserId: string,
  otherUserId: string,
): Promise<FriendMutationResponse> {
  return toLegacyMutation(await cancelOrUnfollow(currentUserId, otherUserId));
}

export async function respondToLegacyFriendRequest(
  currentUserId: string,
  otherUserId: string,
  input: RespondToFriendRequestInput,
): Promise<FriendMutationResponse> {
  return toLegacyMutation(await respondToFollowRequest(currentUserId, otherUserId, input));
}

export async function blockLegacyFighter(
  currentUserId: string,
  otherUserId: string,
): Promise<FriendMutationResponse> {
  return toLegacyMutation(await blockFighter(currentUserId, otherUserId));
}

export async function unblockLegacyFighter(
  currentUserId: string,
  otherUserId: string,
): Promise<FriendMutationResponse> {
  return toLegacyMutation(await unblockFighter(currentUserId, otherUserId));
}

export { removeLegacyFriendship };

export async function reportLegacyFighter(
  currentUserId: string,
  otherUserId: string,
  reason: FriendReportReason,
  details: string | null,
): Promise<ReportFighterResponse> {
  return reportFighter(currentUserId, otherUserId, reason, details);
}

function toLegacyConnection(fighter: DirectedFighterConnection): FighterConnection {
  return {
    profile: fighter.profile,
    relationship: fighter.isSelf
      ? "self"
      : toLegacyRelationship({
          userId: fighter.profile.id,
          blockedByViewer: fighter.blockedByViewer,
          outgoing: fighter.outgoing,
          incoming: fighter.incoming,
          mutual: fighter.mutual,
        }),
    requestedAt: fighter.outgoing.status === "pending"
      ? fighter.outgoing.requestedAt
      : fighter.incoming.status === "pending"
        ? fighter.incoming.requestedAt
        : null,
    connectedAt: fighter.mutual
      ? fighter.outgoing.acceptedAt ?? fighter.incoming.acceptedAt
      : null,
  };
}

function toLegacyMutation(result: ConnectionMutationResponse): FriendMutationResponse {
  return { userId: result.userId, relationship: toLegacyRelationship(result) };
}

function toLegacyRelationship(result: ConnectionMutationResponse) {
  if (result.blockedByViewer) return "blocked" as const;
  if (result.mutual) return "friends" as const;
  if (result.outgoing.status === "pending") return "outgoing" as const;
  if (result.incoming.status === "pending") return "incoming" as const;
  // Legacy clients cannot represent one-way accepted follows. Treat them as
  // connected so old deployments never prompt a duplicate request.
  if (result.outgoing.status === "accepted" || result.incoming.status === "accepted") {
    return "friends" as const;
  }
  return "none" as const;
}
