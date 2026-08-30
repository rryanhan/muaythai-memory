"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
  cancelOrUnfollow,
  getConnectionSectionPage,
  getConnectionsSummary,
  requestFollow,
  respondToFollowRequest,
  searchFighter,
  unblockFighter,
  type ConnectionMutationResponse,
  type ConnectionSection,
  type ConnectionSectionItem,
  type FighterConnection,
  type FighterSummary,
} from "@/data/connections";
import { ProfileAvatar } from "@/features/profile/ProfileAvatar";
import { ProfileInviteSheet } from "./ProfileInviteSheet";
import { SharedDrillsSection } from "./SharedDrillsSection";
import styles from "./Connections.module.css";

export type ConnectionsTab = "followers" | "following" | "requests" | "blocked";

type ConnectionAction =
  | { type: "follow"; profile: FighterSummary }
  | { type: "accept"; profile: FighterSummary }
  | { type: "decline"; profile: FighterSummary }
  | { type: "cancel-or-unfollow"; profile: FighterSummary }
  | { type: "unblock"; profile: FighterSummary };

const tabs: Array<{ id: ConnectionsTab; label: string }> = [
  { id: "followers", label: "Followers" },
  { id: "following", label: "Following" },
  { id: "requests", label: "Requests" },
  { id: "blocked", label: "Blocked" },
];

export function ConnectionsScreen({
  currentUsername,
  initialTab,
}: {
  currentUsername: string;
  initialTab: ConnectionsTab;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [username, setUsername] = useState("");
  const [searchResult, setSearchResult] = useState<FighterConnection | null | undefined>();
  const [inviteOpen, setInviteOpen] = useState(false);
  const summaryQuery = useQuery({
    queryKey: ["connections", "summary"],
    queryFn: ({ signal }) => getConnectionsSummary({ requestInit: { signal } }),
    staleTime: 30 * 1000,
  });
  const followersQuery = useConnectionSection("followers", activeTab === "followers");
  const followingQuery = useConnectionSection("following", activeTab === "following");
  const incomingQuery = useConnectionSection("incoming", activeTab === "requests");
  const outgoingQuery = useConnectionSection("outgoing", activeTab === "requests");
  const blockedQuery = useConnectionSection("blocked", activeTab === "blocked");
  const searchMutation = useMutation({
    mutationFn: (value: string) => searchFighter(value),
    onSuccess: setSearchResult,
  });
  const actionMutation = useMutation({
    mutationFn: runConnectionAction,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["connections"] });
      void queryClient.invalidateQueries({ queryKey: ["fighter"] });
      void queryClient.invalidateQueries({ queryKey: ["drill-share"] });
      void queryClient.invalidateQueries({ queryKey: ["shared-drills"] });
      setSearchResult((current) => current?.profile.id === result.userId
        ? applyMutationResult(current, result)
        : current);
    },
  });
  const counts = summaryQuery.data?.counts;

  function selectTab(tab: ConnectionsTab) {
    setActiveTab(tab);
    router.replace(`/connections?tab=${tab}`, { scroll: false });
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    actionMutation.reset();
    searchMutation.reset();
    setSearchResult(undefined);
    searchMutation.mutate(username);
  }

  function mutate(action: ConnectionAction) {
    actionMutation.reset();
    actionMutation.mutate(action);
  }

  return (
    <main className={styles.page}>
      <div className="notebook-grid" aria-hidden="true" />
      <header className={styles.routeHeader}>
        <Link className={styles.back} href="/?view=profile" aria-label="Back to Profile">←</Link>
        <p className="eyebrow">Profile</p>
      </header>

      <section className={styles.heading}>
        <h1>Connections</h1>
        <p>
          {summaryQuery.isPending
            ? "Loading connections"
            : `${counts?.followers ?? 0} followers · ${counts?.following ?? 0} following`}
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
          <label className="sr-only" htmlFor="connection-username">Exact username</label>
          <input
            id="connection-username"
            value={username}
            onChange={(event) => {
              searchMutation.reset();
              setSearchResult(undefined);
              setUsername(event.target.value);
            }}
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
          <SearchResult
            connection={searchResult}
            disabled={actionMutation.isPending}
            onAction={(type) => mutate({ type, profile: searchResult.profile })}
          />
        )}
      </section>

      <SharedDrillsSection />

      <nav className={styles.connectionTabs} aria-label="Connection lists">
        {tabs.map((tab) => {
          const requestCount = tab.id === "requests"
            ? (counts?.incoming ?? 0) + (counts?.outgoing ?? 0)
            : 0;
          return (
            <button
              key={tab.id}
              type="button"
              data-active={activeTab === tab.id ? "true" : undefined}
              aria-current={activeTab === tab.id ? "page" : undefined}
              onClick={() => selectTab(tab.id)}
            >
              {tab.label}
              {requestCount > 0 && <span aria-label={`${requestCount} pending requests`}>{requestCount}</span>}
            </button>
          );
        })}
      </nav>

      {summaryQuery.isError ? (
        <button className={styles.retry} type="button" onClick={() => void summaryQuery.refetch()}>
          Connections couldn’t be loaded. Retry
        </button>
      ) : activeTab === "followers" ? (
        <ConnectionList
          title="Followers"
          empty="No followers yet."
          query={followersQuery}
          items={flattenSection(followersQuery.data?.pages)}
        />
      ) : activeTab === "following" ? (
        <ConnectionList
          title="Following"
          empty="You aren’t following anyone yet."
          query={followingQuery}
          items={flattenSection(followingQuery.data?.pages)}
        />
      ) : activeTab === "requests" ? (
        <div>
          <RequestList
            title="Received"
            total={counts?.incoming ?? 0}
            items={flattenSection(incomingQuery.data?.pages)}
            query={incomingQuery}
            disabled={actionMutation.isPending}
            onAccept={(profile) => mutate({ type: "accept", profile })}
            onDecline={(profile) => mutate({ type: "decline", profile })}
          />
          <RequestList
            title="Sent"
            total={counts?.outgoing ?? 0}
            items={flattenSection(outgoingQuery.data?.pages)}
            query={outgoingQuery}
            disabled={actionMutation.isPending}
            onCancel={(profile) => mutate({ type: "cancel-or-unfollow", profile })}
          />
        </div>
      ) : (
        <BlockedList
          query={blockedQuery}
          items={flattenSection(blockedQuery.data?.pages)}
          disabled={actionMutation.isPending}
          onUnblock={(profile) => mutate({ type: "unblock", profile })}
        />
      )}

      {actionMutation.isError && (
        <p className={styles.actionError} role="alert">{readError(actionMutation.error)}</p>
      )}
      {actionMutation.isPending && actionMutation.variables && (
        <p className="sr-only" role="status">
          Updating @{actionMutation.variables.profile.username}.
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
  onAction: (type: ConnectionAction["type"]) => void;
}) {
  const { profile, outgoing, incoming, isSelf } = connection;
  return (
    <div className={styles.searchResult}>
      <Link className={styles.connectionIdentityLink} href={`/fighters/${encodeURIComponent(profile.username)}`} prefetch>
        <ConnectionIdentity profile={profile} />
      </Link>
      <div className={styles.searchResultAction}>
        {isSelf ? (
          <span className={styles.pendingLabel}>Your profile</span>
        ) : (
          <>
            {incoming.status === "pending" && (
              <>
                <button type="button" disabled={disabled} onClick={() => onAction("accept")}>Accept</button>
                <button type="button" disabled={disabled} onClick={() => onAction("decline")}>Decline</button>
              </>
            )}
            {outgoing.status === "none" && (
              <button type="button" disabled={disabled} onClick={() => onAction("follow")}>
                <UserPlus size={18} weight="bold" aria-hidden="true" />
                Follow
              </button>
            )}
            {outgoing.status === "pending" && (
              <button type="button" disabled={disabled} onClick={() => onAction("cancel-or-unfollow")}>
                Requested
              </button>
            )}
            {outgoing.status === "accepted" && (
              <button type="button" disabled={disabled} onClick={() => onAction("cancel-or-unfollow")}>
                Following
              </button>
            )}
            {incoming.status === "accepted" && (
              <span className={styles.pendingLabel}>Follows you</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ConnectionList({
  title,
  empty,
  query,
  items,
}: {
  title: string;
  empty: string;
  query: ReturnType<typeof useConnectionSection>;
  items: ConnectionSectionItem[];
}) {
  return (
    <section className={styles.section} aria-labelledby={`connections-${title.toLowerCase()}`}>
      <div className={styles.sectionHeading}>
        <p className="eyebrow" id={`connections-${title.toLowerCase()}`}>{title}</p>
      </div>
      {query.isPending ? <ConnectionRowsLoading /> : items.length > 0 ? (
        <div className={styles.rows}>
          {items.map(({ profile }) => <ConnectionRow key={profile.id} profile={profile} linked />)}
        </div>
      ) : <p className={styles.empty}>{empty}</p>}
      <SectionPagination query={query} label={title.toLowerCase()} />
    </section>
  );
}

function RequestList({
  title,
  total,
  items,
  query,
  disabled,
  onAccept,
  onDecline,
  onCancel,
}: {
  title: "Received" | "Sent";
  total: number;
  items: ConnectionSectionItem[];
  query: ReturnType<typeof useConnectionSection>;
  disabled: boolean;
  onAccept?: (profile: FighterSummary) => void;
  onDecline?: (profile: FighterSummary) => void;
  onCancel?: (profile: FighterSummary) => void;
}) {
  return (
    <section className={styles.section} aria-labelledby={`requests-${title.toLowerCase()}`}>
      <div className={styles.sectionHeading}>
        <p className="eyebrow" id={`requests-${title.toLowerCase()}`}>{title}</p>
        <span>{total}</span>
      </div>
      {query.isPending ? <ConnectionRowsLoading /> : items.length > 0 ? (
        <div className={styles.rows}>
          {items.map(({ profile }) => (
            <ConnectionRow key={profile.id} profile={profile} linked>
              {onAccept && onDecline ? (
                <>
                  <IconAction label={`Accept @${profile.username}`} disabled={disabled} onClick={() => onAccept(profile)}>
                    <Check size={19} weight="bold" aria-hidden="true" />
                  </IconAction>
                  <IconAction label={`Decline @${profile.username}`} disabled={disabled} onClick={() => onDecline(profile)}>
                    <X size={19} weight="bold" aria-hidden="true" />
                  </IconAction>
                </>
              ) : (
                <button className={styles.textAction} type="button" disabled={disabled} onClick={() => onCancel?.(profile)}>
                  Cancel
                </button>
              )}
            </ConnectionRow>
          ))}
        </div>
      ) : <p className={styles.empty}>No {title.toLowerCase()} requests.</p>}
      <SectionPagination query={query} label={`${title.toLowerCase()} requests`} />
    </section>
  );
}

function BlockedList({
  query,
  items,
  disabled,
  onUnblock,
}: {
  query: ReturnType<typeof useConnectionSection>;
  items: ConnectionSectionItem[];
  disabled: boolean;
  onUnblock: (profile: FighterSummary) => void;
}) {
  return (
    <section className={styles.section} aria-labelledby="blocked-fighters-title">
      <div className={styles.sectionHeading}>
        <p className="eyebrow" id="blocked-fighters-title">Blocked Fighters</p>
      </div>
      {query.isPending ? <ConnectionRowsLoading /> : items.length > 0 ? (
        <div className={styles.rows}>
          {items.map(({ profile }) => (
            <ConnectionRow key={profile.id} profile={profile}>
              <button className={styles.textAction} type="button" disabled={disabled} onClick={() => onUnblock(profile)}>
                Unblock
              </button>
            </ConnectionRow>
          ))}
        </div>
      ) : <p className={styles.empty}>No blocked fighters.</p>}
      <SectionPagination query={query} label="blocked fighters" />
    </section>
  );
}

function ConnectionRow({
  profile,
  linked = false,
  children,
}: {
  profile: FighterSummary;
  linked?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={styles.connectionRow}>
      {linked ? (
        <Link className={styles.connectionIdentityLink} href={`/fighters/${encodeURIComponent(profile.username)}`} prefetch>
          <ConnectionIdentity profile={profile} />
        </Link>
      ) : <ConnectionIdentity profile={profile} />}
      {children && <div className={styles.rowActions}>{children}</div>}
    </div>
  );
}

function ConnectionIdentity({ profile }: { profile: FighterSummary }) {
  return (
    <div className={styles.connectionIdentity}>
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
    <button className={styles.iconAction} type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

function ConnectionRowsLoading() {
  return (
    <div className={styles.loadingRows} role="status" aria-label="Loading connections">
      {Array.from({ length: 3 }).map((_, index) => <span key={index}><i /><b /></span>)}
    </div>
  );
}

async function runConnectionAction(action: ConnectionAction): Promise<ConnectionMutationResponse> {
  switch (action.type) {
    case "follow":
      return requestFollow(action.profile.username);
    case "accept":
    case "decline":
      return respondToFollowRequest(action.profile.id, { action: action.type });
    case "cancel-or-unfollow":
      return cancelOrUnfollow(action.profile.id);
    case "unblock":
      return unblockFighter(action.profile.id);
  }
}

function applyMutationResult(
  connection: FighterConnection,
  result: ConnectionMutationResponse,
): FighterConnection {
  return {
    ...connection,
    blockedByViewer: result.blockedByViewer,
    outgoing: result.outgoing,
    incoming: result.incoming,
    mutual: result.mutual,
  };
}

function useConnectionSection(section: ConnectionSection, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ["connections", "section", section],
    queryFn: ({ pageParam, signal }) => getConnectionSectionPage(
      section,
      pageParam,
      { requestInit: { signal } },
    ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30 * 1000,
    enabled,
  });
}

function flattenSection(
  pages: Array<{ items: ConnectionSectionItem[] }> | undefined,
): ConnectionSectionItem[] {
  return pages?.flatMap((page) => page.items) ?? [];
}

function SectionPagination({
  query,
  label,
}: {
  query: ReturnType<typeof useConnectionSection>;
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
