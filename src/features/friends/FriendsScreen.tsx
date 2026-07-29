"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Check } from "@phosphor-icons/react/Check";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { ShareNetwork } from "@phosphor-icons/react/ShareNetwork";
import { UserPlus } from "@phosphor-icons/react/UserPlus";
import { X } from "@phosphor-icons/react/X";
import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";
import {
  cancelFriendRequest,
  getFriendSectionPage,
  getFriendsSummary,
  respondToFriendRequest,
  searchFighter,
  sendFriendRequest,
  unblockFighter,
  type FighterConnection,
  type FighterSummary,
  type FriendSection,
  type FriendSectionItem,
  type FriendMutationResponse,
} from "@/data/friends";
import { ProfileAvatar } from "@/features/profile/ProfileAvatar";
import { ProfileInviteSheet } from "./ProfileInviteSheet";
import { SharedDrillsSection } from "./SharedDrillsSection";
import styles from "./Friends.module.css";

type FriendAction =
  | { type: "send"; profile: FighterSummary }
  | { type: "accept"; profile: FighterSummary }
  | { type: "decline"; profile: FighterSummary }
  | { type: "cancel"; profile: FighterSummary }
  | { type: "unblock"; profile: FighterSummary };

export function FriendsScreen({ currentUsername }: { currentUsername: string }) {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState("");
  const [searchResult, setSearchResult] = useState<FighterConnection | null | undefined>();
  const [inviteOpen, setInviteOpen] = useState(false);
  const summaryQuery = useQuery({
    queryKey: ["friends", "summary"],
    queryFn: ({ signal }) => getFriendsSummary({ requestInit: { signal } }),
    staleTime: 30 * 1000,
  });
  const friendsQuery = useFriendSection("friends");
  const incomingQuery = useFriendSection("incoming");
  const outgoingQuery = useFriendSection("outgoing");
  const blockedQuery = useFriendSection("blocked");
  const searchMutation = useMutation({
    mutationFn: (value: string) => searchFighter(value),
    onSuccess: setSearchResult,
  });
  const actionMutation = useMutation({
    mutationFn: runFriendAction,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["friends"] });
      void queryClient.invalidateQueries({ queryKey: ["fighter"] });
      setSearchResult((current) => current?.profile.id === result.userId
        ? { ...current, relationship: result.relationship }
        : current);
    },
  });

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    actionMutation.reset();
    searchMutation.reset();
    setSearchResult(undefined);
    searchMutation.mutate(username);
  }

  function handleUsernameChange(value: string) {
    searchMutation.reset();
    setSearchResult(undefined);
    setUsername(value);
  }

  function mutateFriendAction(action: FriendAction) {
    actionMutation.reset();
    actionMutation.mutate(action);
  }

  const pendingAction = actionMutation.variables;
  const actionsDisabled = actionMutation.isPending;
  const counts = summaryQuery.data?.counts;
  const friends = flattenSection(friendsQuery.data?.pages);
  const incoming = flattenSection(incomingQuery.data?.pages);
  const outgoing = flattenSection(outgoingQuery.data?.pages);
  const blocked = flattenSection(blockedQuery.data?.pages);

  return (
    <main className={styles.page}>
      <div className="notebook-grid" aria-hidden="true" />
      <header className={styles.routeHeader}>
        <Link className={styles.back} href="/?view=profile" aria-label="Back to Profile">←</Link>
        <p className="eyebrow">Profile</p>
      </header>

      <section className={styles.heading}>
        <h1>Friends</h1>
        <p>
          {summaryQuery.isPending
            ? "Loading connections"
            : `${counts?.friends ?? 0} ${(counts?.friends ?? 0) === 1 ? "friend" : "friends"}`}
        </p>
        <button className={styles.shareProfile} type="button" onClick={() => setInviteOpen(true)}>
          <ShareNetwork size={18} weight="bold" aria-hidden="true" />
          Share @{currentUsername}
        </button>
      </section>

      <section className={styles.searchSection} aria-labelledby="find-fighter-title">
        <div className={styles.sectionHeading}>
          <p className="eyebrow" id="find-fighter-title">Find Fighter</p>
        </div>
        <form className={styles.searchForm} onSubmit={handleSearch}>
          <label className="sr-only" htmlFor="friend-username">Exact username</label>
          <input
            id="friend-username"
            value={username}
            onChange={(event) => handleUsernameChange(event.target.value)}
            placeholder="Exact username"
            minLength={3}
            maxLength={30}
            pattern="[A-Za-z0-9_]+"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={searchMutation.isPending}
          />
          <button
            type="submit"
            aria-label="Search username"
            disabled={searchMutation.isPending || username.trim().length < 3}
          >
            <MagnifyingGlass size={21} weight="bold" aria-hidden="true" />
          </button>
        </form>

        {searchMutation.isPending && <p className={styles.status}>Searching…</p>}
        {searchMutation.isError && (
          <p className={styles.error} role="alert">{readError(searchMutation.error)}</p>
        )}
        {searchResult === null && (
          <p className={styles.empty}>No fighter found with that username.</p>
        )}
        {searchResult && (
          <>
            <p className="sr-only" role="status">
              Found @{searchResult.profile.username}.
            </p>
            <SearchResult
              connection={searchResult}
              disabled={actionsDisabled}
              onAction={(type) => mutateFriendAction({
                type,
                profile: searchResult.profile,
              })}
            />
          </>
        )}
      </section>

      <SharedDrillsSection />

      {summaryQuery.isError ? (
        <button className={styles.retry} type="button" onClick={() => void summaryQuery.refetch()}>
          Friends couldn’t be loaded. Retry
        </button>
      ) : (
        <>
          {(counts?.incoming ?? incoming.length) > 0 && (
            <section className={styles.section} aria-labelledby="friend-requests-title">
              <div className={styles.sectionHeading}>
                <p className="eyebrow" id="friend-requests-title">Requests</p>
                <span>{counts?.incoming ?? incoming.length}</span>
              </div>
              <div className={styles.rows}>
                {incoming.map(({ profile }) => (
                  <FriendRow key={profile.id} profile={profile} linked>
                    <IconAction
                      label={`Accept @${profile.username}`}
                      disabled={actionsDisabled}
                      onClick={() => mutateFriendAction({ type: "accept", profile })}
                    >
                      <Check size={19} weight="bold" aria-hidden="true" />
                    </IconAction>
                    <IconAction
                      label={`Decline @${profile.username}`}
                      disabled={actionsDisabled}
                      onClick={() => mutateFriendAction({ type: "decline", profile })}
                    >
                      <X size={19} weight="bold" aria-hidden="true" />
                    </IconAction>
                  </FriendRow>
                ))}
              </div>
              <SectionPagination query={incomingQuery} label="requests" />
            </section>
          )}

          <section className={styles.section} aria-labelledby="friends-title">
            <div className={styles.sectionHeading}>
              <p className="eyebrow" id="friends-title">Friends</p>
            </div>
            {friendsQuery.isPending ? (
              <FriendRowsLoading />
            ) : friends.length > 0 ? (
              <div className={styles.rows}>
                {friends.map(({ profile }) => (
                  <FriendRow key={profile.id} profile={profile} linked />
                ))}
              </div>
            ) : (
              <p className={styles.empty}>No friends added yet.</p>
            )}
            <SectionPagination query={friendsQuery} label="friends" />
          </section>

          {(counts?.outgoing ?? outgoing.length) > 0 && (
            <section className={styles.section} aria-labelledby="sent-requests-title">
              <div className={styles.sectionHeading}>
                <p className="eyebrow" id="sent-requests-title">Sent Requests</p>
              </div>
              <div className={styles.rows}>
                {outgoing.map(({ profile }) => (
                  <FriendRow key={profile.id} profile={profile} linked>
                    <button
                      className={styles.textAction}
                      type="button"
                      disabled={actionsDisabled}
                      onClick={() => mutateFriendAction({ type: "cancel", profile })}
                    >
                      Cancel
                    </button>
                  </FriendRow>
                ))}
              </div>
              <SectionPagination query={outgoingQuery} label="sent requests" />
            </section>
          )}

          {(counts?.blocked ?? blocked.length) > 0 && (
            <details className={styles.blockedSection}>
              <summary>Blocked fighters <span>{counts?.blocked ?? blocked.length}</span></summary>
              <div className={styles.rows}>
                {blocked.map(({ profile }) => (
                  <FriendRow key={profile.id} profile={profile}>
                    <button
                      className={styles.textAction}
                      type="button"
                      disabled={actionsDisabled}
                      onClick={() => mutateFriendAction({ type: "unblock", profile })}
                    >
                      Unblock
                    </button>
                  </FriendRow>
                ))}
              </div>
              <SectionPagination query={blockedQuery} label="blocked fighters" />
            </details>
          )}
        </>
      )}

      {actionMutation.isError && (
        <p className={styles.actionError} role="alert">{readError(actionMutation.error)}</p>
      )}
      {actionsDisabled && pendingAction && (
        <p className="sr-only" role="status">
          Updating @{pendingAction.profile.username}.
        </p>
      )}
      <ProfileInviteSheet
        username={currentUsername}
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
      />
      <RoutedBottomNav activeView="profile" />
    </main>
  );
}

function SearchResult({
  connection,
  disabled,
  onAction,
}: {
  connection: FighterConnection;
  disabled: boolean;
  onAction: (type: FriendAction["type"]) => void;
}) {
  const { profile, relationship } = connection;
  return (
    <div className={styles.searchResult}>
      <Link className={styles.friendIdentityLink} href={`/fighters/${encodeURIComponent(profile.username)}`} prefetch>
        <FriendIdentity profile={profile} />
      </Link>
      <div className={styles.searchResultAction}>
        {relationship === "none" && (
          <button type="button" disabled={disabled} onClick={() => onAction("send")}>
            <UserPlus size={18} weight="bold" aria-hidden="true" />
            Add Friend
          </button>
        )}
        {relationship === "incoming" && (
          <>
            <button type="button" disabled={disabled} onClick={() => onAction("accept")}>Accept</button>
            <button type="button" disabled={disabled} onClick={() => onAction("decline")}>Decline</button>
          </>
        )}
        {relationship === "outgoing" && (
          <button type="button" disabled={disabled} onClick={() => onAction("cancel")}>
            Cancel Request
          </button>
        )}
        {relationship === "friends" && (
          <Link href={`/fighters/${encodeURIComponent(profile.username)}`} prefetch>View Profile</Link>
        )}
        {relationship === "blocked" && (
          <button type="button" disabled={disabled} onClick={() => onAction("unblock")}>Unblock</button>
        )}
        {relationship === "self" && <span className={styles.pendingLabel}>Your profile</span>}
      </div>
    </div>
  );
}

function FriendRow({
  profile,
  linked = false,
  children,
}: {
  profile: FighterSummary;
  linked?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={styles.friendRow}>
      {linked ? (
        <Link className={styles.friendIdentityLink} href={`/fighters/${encodeURIComponent(profile.username)}`} prefetch>
          <FriendIdentity profile={profile} />
        </Link>
      ) : (
        <FriendIdentity profile={profile} />
      )}
      {children && <div className={styles.rowActions}>{children}</div>}
    </div>
  );
}

function FriendIdentity({ profile }: { profile: FighterSummary }) {
  return (
    <div className={styles.friendIdentity}>
      <ProfileAvatar
        profile={{ displayName: profile.username, avatarUrl: profile.avatarUrl }}
        className={styles.avatar}
        imageClassName={styles.avatarImage}
      />
      <strong>@{profile.username}</strong>
    </div>
  );
}

function IconAction({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={styles.iconAction}
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function FriendRowsLoading() {
  return (
    <div className={styles.loadingRows} role="status" aria-label="Loading friends">
      {Array.from({ length: 3 }).map((_, index) => (
        <span key={index}><i /><b /></span>
      ))}
    </div>
  );
}

async function runFriendAction(action: FriendAction): Promise<FriendMutationResponse> {
  switch (action.type) {
    case "send":
      return sendFriendRequest(action.profile.username);
    case "accept":
      return respondToFriendRequest(action.profile.id, { action: "accept" });
    case "decline":
      return respondToFriendRequest(action.profile.id, { action: "decline" });
    case "cancel":
      return cancelFriendRequest(action.profile.id);
    case "unblock":
      return unblockFighter(action.profile.id);
  }
}

function useFriendSection(section: FriendSection) {
  return useInfiniteQuery({
    queryKey: ["friends", "section", section],
    queryFn: ({ pageParam, signal }) => getFriendSectionPage(
      section,
      pageParam,
      { requestInit: { signal } },
    ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30 * 1000,
  });
}

function flattenSection(
  pages: Array<{ items: FriendSectionItem[] }> | undefined,
): FriendSectionItem[] {
  return pages?.flatMap((page) => page.items) ?? [];
}

function SectionPagination({
  query,
  label,
}: {
  query: ReturnType<typeof useFriendSection>;
  label: string;
}) {
  if (query.isError) {
    return (
      <button className={styles.sectionRetry} type="button" onClick={() => void query.refetch()}>
        Couldn’t load {label}. Retry
      </button>
    );
  }
  if (!query.hasNextPage) return null;
  return (
    <button
      className={styles.loadMore}
      type="button"
      disabled={query.isFetchingNextPage}
      onClick={() => void query.fetchNextPage()}
    >
      {query.isFetchingNextPage ? "Loading…" : `Load more ${label}`}
    </button>
  );
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}
