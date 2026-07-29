"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "@phosphor-icons/react/Check";
import { DotsThree } from "@phosphor-icons/react/DotsThree";
import { UserPlus } from "@phosphor-icons/react/UserPlus";
import { X } from "@phosphor-icons/react/X";
import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";
import { badgeByIconKey } from "@/components/shared/context-badges";
import { DecodedImage } from "@/components/shared/DecodedImage";
import {
  blockFighter,
  cancelFriendRequest,
  getFighterProfile,
  removeFriend,
  reportFighter,
  respondToFriendRequest,
  sendFriendRequest,
  unblockFighter,
  type FighterProfile,
  type FriendReportReason,
  type FriendshipState,
} from "@/data/friends";
import { ProfileAvatar } from "@/features/profile/ProfileAvatar";
import { FriendConfirmationSheet } from "./FriendConfirmationSheet";
import { FriendMoreActionsSheet } from "./FriendMoreActionsSheet";
import { FriendReportSheet } from "./FriendReportSheet";
import { SharedDrillsSection } from "./SharedDrillsSection";
import styles from "./Friends.module.css";

type ProfileAction =
  | "send"
  | "accept"
  | "decline"
  | "cancel"
  | "remove"
  | "block"
  | "unblock";

export function FighterProfileScreen({
  initialFighter,
}: {
  initialFighter: FighterProfile;
}) {
  const queryClient = useQueryClient();
  const [confirmation, setConfirmation] = useState<"remove" | "block" | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCycle, setReportCycle] = useState(0);
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const queryKey = ["fighter", initialFighter.profile.username];
  const fighterQuery = useQuery({
    queryKey,
    queryFn: ({ signal }) => getFighterProfile(
      initialFighter.profile.username,
      { requestInit: { signal } },
    ),
    initialData: initialFighter,
    staleTime: 30 * 1000,
  });
  const actionMutation = useMutation({
    mutationFn: (action: ProfileAction) => runProfileAction(fighterQuery.data, action),
    onSuccess: (relationship) => {
      queryClient.setQueryData<FighterProfile>(queryKey, (current) => current
        ? {
            ...current,
            relationship,
            stats: relationship === "friends" ? current.stats : null,
          }
        : current);
      void queryClient.invalidateQueries({ queryKey: ["friends"] });
      void queryClient.invalidateQueries({ queryKey });
      setConfirmation(null);
    },
  });
  const reportMutation = useMutation({
    mutationFn: ({
      reason,
      details,
    }: {
      reason: FriendReportReason;
      details: string;
    }) => reportFighter({
      userId: fighterQuery.data.profile.id,
      reason,
      details,
    }),
    onSuccess: () => {
      setReportOpen(false);
      setProfileStatus("Report submitted. Thank you for letting us know.");
    },
  });
  const fighter = fighterQuery.data;

  async function shareProfile() {
    setProfileStatus(null);
    const profileUrl = window.location.href;
    const shareData = {
      title: `@${fighter.profile.username} on Muay Thai Memory`,
      text: `View @${fighter.profile.username} on Muay Thai Memory`,
      url: profileUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setProfileStatus("Profile shared.");
      } else {
        await navigator.clipboard.writeText(profileUrl);
        setProfileStatus("Profile link copied.");
      }
      setMoreOpen(false);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setProfileStatus("Profile could not be shared. Try again.");
    }
  }

  return (
    <main className={styles.page}>
      <div className="notebook-grid" aria-hidden="true" />
      <header className={styles.routeHeader}>
        <Link className={styles.back} href="/friends" aria-label="Back to Friends">←</Link>
        <p className="eyebrow">Fighter Profile</p>
      </header>

      <section className={styles.fighterHero}>
        <ProfileAvatar
          profile={{
            displayName: fighter.profile.username,
            avatarUrl: fighter.profile.avatarUrl,
          }}
          className={styles.heroAvatar}
          imageClassName={styles.avatarImage}
        />
        <h1>@{fighter.profile.username}</h1>
        <p>{relationshipLabel(fighter.relationship)}</p>
      </section>

      <ProfileActions
        relationship={fighter.relationship}
        pending={actionMutation.isPending}
        onMore={() => setMoreOpen(true)}
        onAction={(action) => {
          actionMutation.reset();
          if (action === "remove" || action === "block") {
            setConfirmation(action);
          } else {
            actionMutation.mutate(action);
          }
        }}
      />

      {profileStatus && <p className={styles.profileStatus} role="status">{profileStatus}</p>}
      {actionMutation.isError && confirmation === null && (
        <p className={styles.actionError} role="alert">{readError(actionMutation.error)}</p>
      )}
      {fighterQuery.isError && (
        <button className={styles.retry} type="button" onClick={() => void fighterQuery.refetch()}>
          Fighter details couldn’t be refreshed. Retry
        </button>
      )}

      {fighter.stats && (
        <section className={styles.friendStats} aria-labelledby="friend-training-title">
          <div className={styles.statTotal}>
            <strong>{fighter.stats.drillCount}</strong>
            <span>{fighter.stats.drillCount === 1 ? "drill recorded" : "drills recorded"}</span>
          </div>
          <div className={styles.sectionHeading}>
            <p className="eyebrow" id="friend-training-title">Training Methods</p>
          </div>
          {fighter.stats.trainingMethods.length > 0 ? (
            <div className={styles.methodStrip}>
              {fighter.stats.trainingMethods.map((method) => (
                <div key={method.id} className={styles.methodStat} aria-label={`${method.name}: ${method.count} drills`}>
                  {method.iconKey && badgeByIconKey[method.iconKey] ? (
                    <DecodedImage
                      src={badgeByIconKey[method.iconKey]}
                      alt=""
                      aria-hidden="true"
                      loading="eager"
                      decoding="async"
                    />
                  ) : (
                    <span className={styles.methodFallback} aria-hidden="true" />
                  )}
                  <strong>{method.count}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.empty}>No Training Method totals yet.</p>
          )}
        </section>
      )}

      {!fighter.stats && fighter.relationship === "friends" && !fighterQuery.isError && (
        <section className={styles.privateNotice} role="status">
          <p className="eyebrow">Training Totals</p>
          <p>Loading your friend’s training totals…</p>
        </section>
      )}

      {!fighter.stats
        && fighter.relationship !== "self"
        && fighter.relationship !== "friends"
        && (
          <section className={styles.privateNotice}>
            <p className="eyebrow">Private Training</p>
            <p>Training totals appear after you become friends.</p>
          </section>
        )}

      {fighter.relationship === "friends" && (
        <SharedDrillsSection ownerUsername={fighter.profile.username} />
      )}

      <FriendConfirmationSheet
        action={confirmation ?? "remove"}
        fighter={fighter.profile}
        open={confirmation !== null}
        pending={actionMutation.isPending}
        error={actionMutation.isError ? readError(actionMutation.error) : null}
        onClose={() => {
          actionMutation.reset();
          setConfirmation(null);
        }}
        onConfirm={() => confirmation && actionMutation.mutate(confirmation)}
      />
      <FriendMoreActionsSheet
        fighter={fighter.profile}
        open={moreOpen}
        allowBlock={fighter.relationship !== "blocked"}
        onClose={() => setMoreOpen(false)}
        onShare={() => void shareProfile()}
        onReport={() => {
          setMoreOpen(false);
          reportMutation.reset();
          setReportCycle((cycle) => cycle + 1);
          setReportOpen(true);
        }}
        onBlock={() => {
          setMoreOpen(false);
          setConfirmation("block");
        }}
      />
      <FriendReportSheet
        key={reportCycle}
        fighter={fighter.profile}
        open={reportOpen}
        pending={reportMutation.isPending}
        error={reportMutation.isError ? readError(reportMutation.error) : null}
        onClose={() => {
          reportMutation.reset();
          setReportOpen(false);
        }}
        onSubmit={(reason, details) => reportMutation.mutate({ reason, details })}
      />
      <RoutedBottomNav activeView="profile" />
    </main>
  );
}

function ProfileActions({
  relationship,
  pending,
  onMore,
  onAction,
}: {
  relationship: FriendshipState;
  pending: boolean;
  onMore: () => void;
  onAction: (action: ProfileAction) => void;
}) {
  return (
    <div className={styles.profileActions}>
      {relationship === "none" && (
        <button type="button" disabled={pending} onClick={() => onAction("send")}>
          <UserPlus size={18} weight="bold" aria-hidden="true" />
          Add Friend
        </button>
      )}
      {relationship === "incoming" && (
        <>
          <button type="button" disabled={pending} onClick={() => onAction("accept")}>
            <Check size={18} weight="bold" aria-hidden="true" />
            Accept
          </button>
          <button type="button" disabled={pending} onClick={() => onAction("decline")}>
            <X size={18} weight="bold" aria-hidden="true" />
            Decline
          </button>
        </>
      )}
      {relationship === "outgoing" && (
        <button type="button" disabled={pending} onClick={() => onAction("cancel")}>
          Cancel Request
        </button>
      )}
      {relationship === "friends" && (
        <button type="button" disabled={pending} onClick={() => onAction("remove")}>Remove Friend</button>
      )}
      {relationship === "blocked" && (
        <button type="button" disabled={pending} onClick={() => onAction("unblock")}>Unblock Fighter</button>
      )}
      <button
        className={styles.moreTrigger}
        type="button"
        aria-label="More fighter actions"
        title="More actions"
        disabled={pending}
        onClick={onMore}
      >
        <DotsThree size={22} weight="bold" aria-hidden="true" />
      </button>
    </div>
  );
}

async function runProfileAction(
  fighter: FighterProfile,
  action: ProfileAction,
): Promise<FriendshipState> {
  switch (action) {
    case "send":
      return (await sendFriendRequest(fighter.profile.username)).relationship;
    case "accept":
    case "decline":
      return (await respondToFriendRequest(
        fighter.profile.id,
        { action },
      )).relationship;
    case "cancel":
      return (await cancelFriendRequest(fighter.profile.id)).relationship;
    case "remove":
      await removeFriend(fighter.profile.id);
      return "none";
    case "block":
      return (await blockFighter(fighter.profile.id)).relationship;
    case "unblock":
      return (await unblockFighter(fighter.profile.id)).relationship;
  }
}

function relationshipLabel(relationship: FriendshipState) {
  switch (relationship) {
    case "self":
      return "Your profile";
    case "none":
      return "Not connected";
    case "incoming":
      return "Sent you a friend request";
    case "outgoing":
      return "Friend request pending";
    case "friends":
      return "Friends";
    case "blocked":
      return "Blocked";
  }
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}
