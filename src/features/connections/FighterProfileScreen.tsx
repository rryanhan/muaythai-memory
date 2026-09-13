"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { lazy, Suspense, useId, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "@phosphor-icons/react/Check";
import { DotsThree } from "@phosphor-icons/react/DotsThree";
import { UserPlus } from "@phosphor-icons/react/UserPlus";
import { X } from "@phosphor-icons/react/X";
import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";
import { badgeByIconKey } from "@/components/shared/context-badges";
import { DecodedImage } from "@/components/shared/DecodedImage";
import { useModalFallbackAccessibility } from "@/components/shared/useModalFallbackAccessibility";
import {
  blockFighter,
  cancelOrUnfollow,
  getFighterProfile,
  reportFighter,
  requestFollow,
  respondToFollowRequest,
  type ConnectionMutationResponse,
  type FighterProfile,
  type ReportReason,
} from "@/data/connections";
import { ProfileAvatar } from "@/features/profile/ProfileAvatar";
import { drillShareQueryKeyPrefix } from "./query-keys";
import { SharedDrillsSection } from "./SharedDrillsSection";
import styles from "./Connections.module.css";

const FighterActionConfirmationSheet = lazy(
  () => import("./FighterActionConfirmationSheet")
    .then((module) => ({ default: module.FighterActionConfirmationSheet })),
);
const FighterMoreActionsSheet = lazy(
  () => import("./FighterMoreActionsSheet")
    .then((module) => ({ default: module.FighterMoreActionsSheet })),
);
const FighterReportSheet = lazy(
  () => import("./FighterReportSheet")
    .then((module) => ({ default: module.FighterReportSheet })),
);

type ProfileAction =
  | "follow"
  | "accept"
  | "decline"
  | "cancel"
  | "unfollow"
  | "block";

export function FighterProfileScreen({
  initialFighter,
}: {
  initialFighter: FighterProfile;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirmationMounted, setConfirmationMounted] = useState(false);
  const [confirmation, setConfirmation] = useState<"unfollow" | "block" | null>(null);
  const [moreMounted, setMoreMounted] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [reportMounted, setReportMounted] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCycle, setReportCycle] = useState(0);
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
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
    onSuccess: (result, action) => {
      queryClient.setQueryData<FighterProfile>(queryKey, (current) => current
        ? {
            ...current,
            blockedByViewer: result.blockedByViewer,
            outgoing: result.outgoing,
            incoming: result.incoming,
            mutual: result.mutual,
            stats: result.mutual ? current.stats : null,
          }
        : current);
      void queryClient.invalidateQueries({ queryKey: ["connections"] });
      void queryClient.invalidateQueries({ queryKey: ["fighter"] });
      void queryClient.invalidateQueries({ queryKey: drillShareQueryKeyPrefix });
      void queryClient.invalidateQueries({ queryKey: ["shared-drills"] });
      setConfirmation(null);
      if (action === "block") router.replace("/connections?tab=blocked");
    },
  });
  const reportMutation = useMutation({
    mutationFn: ({ reason, details }: { reason: ReportReason; details: string }) => (
      reportFighter({ userId: fighterQuery.data.profile.id, reason, details })
    ),
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
        <Link className={styles.back} href="/connections" aria-label="Back to Connections">←</Link>
        <p className="eyebrow">Fighter Profile</p>
      </header>

      <section className={styles.fighterHero}>
        <ProfileAvatar
          profile={{ displayName: fighter.profile.username, avatarUrl: fighter.profile.avatarUrl }}
          className={styles.heroAvatar}
          imageClassName={styles.avatarImage}
          priority
        />
        <h1>@{fighter.profile.username}</h1>
        <div className={styles.fighterSocialCounts} aria-label="Connection counts">
          <SocialCount
            count={fighter.socialCounts.followers}
            label="Followers"
            href={fighter.canViewConnections
              ? `/fighters/${encodeURIComponent(fighter.profile.username)}/connections?tab=followers`
              : null}
          />
          <SocialCount
            count={fighter.socialCounts.following}
            label="Following"
            href={fighter.canViewConnections
              ? `/fighters/${encodeURIComponent(fighter.profile.username)}/connections?tab=following`
              : null}
          />
        </div>
      </section>

      <ProfileActions
        fighter={fighter}
        moreTriggerRef={moreTriggerRef}
        pending={actionMutation.isPending}
        onMore={() => {
          setMoreMounted(true);
          setMoreOpen(true);
        }}
        onAction={(action) => {
          actionMutation.reset();
          if (action === "unfollow" || action === "block") {
            setConfirmationMounted(true);
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
        <section className={styles.trainingStats} aria-labelledby="fighter-training-title">
          <div className={styles.statTotal}>
            <strong>{fighter.stats.drillCount}</strong>
            <span>{fighter.stats.drillCount === 1 ? "drill recorded" : "drills recorded"}</span>
          </div>
          <div className={styles.sectionHeading}>
            <p className="eyebrow" id="fighter-training-title">Training Methods</p>
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
                  ) : <span className={styles.methodFallback} aria-hidden="true" />}
                  <strong>{method.count}</strong>
                </div>
              ))}
            </div>
          ) : <p className={styles.empty}>No Training Method totals yet.</p>}
        </section>
      )}

      {!fighter.stats && fighter.mutual && !fighterQuery.isError && (
        <section className={styles.privateNotice} role="status">
          <p className="eyebrow">Training Totals</p>
          <p>Loading private training totals…</p>
        </section>
      )}

      {!fighter.stats && !fighter.mutual && (
        <section className={styles.privateNotice}>
          <p className="eyebrow">Private Training</p>
          <p>Training totals appear after you both follow each other.</p>
        </section>
      )}

      {fighter.mutual && <SharedDrillsSection ownerUsername={fighter.profile.username} />}

      {confirmationMounted && (
        <Suspense
          fallback={confirmation
            ? (
                <FighterSheetLoading
                  title={confirmation === "unfollow" ? "Unfollow?" : "Block Fighter?"}
                  message="Loading confirmation…"
                  returnFocusFallbackRef={moreTriggerRef}
                  onCancel={() => {
                    actionMutation.reset();
                    setConfirmation(null);
                  }}
                />
              )
            : null}
        >
          <FighterActionConfirmationSheet
            action={confirmation ?? "unfollow"}
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
        </Suspense>
      )}
      {moreMounted && (
        <Suspense
          fallback={moreOpen
            ? (
                <FighterSheetLoading
                  title={`@${fighter.profile.username}`}
                  message="Loading fighter actions…"
                  returnFocusFallbackRef={moreTriggerRef}
                  onCancel={() => setMoreOpen(false)}
                />
              )
            : null}
        >
          <FighterMoreActionsSheet
            fighter={fighter.profile}
            open={moreOpen}
            allowBlock
            onClose={() => setMoreOpen(false)}
            onShare={() => void shareProfile()}
            onReport={() => {
              setMoreOpen(false);
              reportMutation.reset();
              setReportCycle((cycle) => cycle + 1);
              setReportMounted(true);
              setReportOpen(true);
            }}
            onBlock={() => {
              setMoreOpen(false);
              setConfirmationMounted(true);
              setConfirmation("block");
            }}
          />
        </Suspense>
      )}
      {reportMounted && (
        <Suspense
          fallback={reportOpen
            ? (
                <FighterSheetLoading
                  title="Report Fighter"
                  message="Loading report form…"
                  returnFocusFallbackRef={moreTriggerRef}
                  onCancel={() => {
                    reportMutation.reset();
                    setReportOpen(false);
                  }}
                />
              )
            : null}
        >
          <FighterReportSheet
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
        </Suspense>
      )}
      <RoutedBottomNav activeView="profile" />
    </main>
  );
}

function FighterSheetLoading({
  title,
  message,
  returnFocusFallbackRef,
  onCancel,
}: {
  title: string;
  message: string;
  returnFocusFallbackRef: RefObject<HTMLButtonElement | null>;
  onCancel: () => void;
}) {
  const titleId = useId();
  const messageId = useId();
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const handleKeyDown = useModalFallbackAccessibility({
    backdropRef,
    dialogRef,
    fallbackReturnFocusRef: returnFocusFallbackRef,
    initialFocusRef: cancelButtonRef,
    onEscape: onCancel,
  });

  return createPortal(
    <>
      <div ref={backdropRef} className={styles.drawerBackdrop} aria-hidden="true" />
      <div
        ref={dialogRef}
        className={styles.confirmationSheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <h2 id={titleId}>{title}</h2>
        <p id={messageId} role="status" aria-live="polite">{message}</p>
        <div className={styles.drawerActions}>
          <button ref={cancelButtonRef} type="button" onClick={onCancel}>Cancel</button>
          <button type="button" disabled>Loading…</button>
        </div>
      </div>
    </>,
    document.body,
  );
}

function SocialCount({ count, label, href }: { count: number; label: string; href: string | null }) {
  const content = <><strong>{count}</strong><span>{label}</span></>;
  return href ? <Link href={href} prefetch>{content}</Link> : <span>{content}</span>;
}

function ProfileActions({
  fighter,
  moreTriggerRef,
  pending,
  onMore,
  onAction,
}: {
  fighter: FighterProfile;
  moreTriggerRef: RefObject<HTMLButtonElement | null>;
  pending: boolean;
  onMore: () => void;
  onAction: (action: ProfileAction) => void;
}) {
  return (
    <div className={styles.profileActions}>
      {fighter.incoming.status === "pending" && (
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
      {fighter.outgoing.status === "none" && (
        <button type="button" disabled={pending} onClick={() => onAction("follow")}>
          <UserPlus size={18} weight="bold" aria-hidden="true" />
          Follow
        </button>
      )}
      {fighter.outgoing.status === "pending" && (
        <button type="button" disabled={pending} onClick={() => onAction("cancel")}>
          Requested
        </button>
      )}
      {fighter.outgoing.status === "accepted" && (
        <button type="button" disabled={pending} onClick={() => onAction("unfollow")}>
          Following
        </button>
      )}
      {fighter.incoming.status === "accepted" && (
        <span className={styles.followsYou}>Follows you</span>
      )}
      <button
        ref={moreTriggerRef}
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
): Promise<ConnectionMutationResponse> {
  switch (action) {
    case "follow":
      return requestFollow(fighter.profile.username);
    case "accept":
    case "decline":
      return respondToFollowRequest(fighter.profile.id, { action });
    case "cancel":
    case "unfollow":
      return cancelOrUnfollow(fighter.profile.id);
    case "block":
      return blockFighter(fighter.profile.id);
  }
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}
