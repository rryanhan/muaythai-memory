"use client";

import Link from "next/link";
import { PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { Play } from "@phosphor-icons/react/Play";
import { Plus } from "@phosphor-icons/react/Plus";
import { Star } from "@phosphor-icons/react/Star";
import { Target } from "@phosphor-icons/react/Target";
import { VideoCamera } from "@phosphor-icons/react/VideoCamera";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { badgeByIconKey } from "@/components/shared/context-badges";
import { DecodedImage } from "@/components/shared/DecodedImage";
import { getConnectionsSummary } from "@/data/connections";
import { getJournalEntries } from "@/data/journal";
import { getProfileOverview } from "@/data/profile";
import type { JournalEntrySummary } from "@/data/types";
import { SignOutButton } from "@/features/auth/SignOutButton";
import type { CurrentAppUser } from "@/modules/auth";
import { ProfileAvatar } from "./ProfileAvatar";
import styles from "./Profile.module.css";

type ProfileViewProps = {
  currentUser: CurrentAppUser;
};

export function ProfileView({ currentUser }: ProfileViewProps) {
  const overviewQuery = useQuery({
    queryKey: ["profile", "overview"],
    queryFn: ({ signal }) => getProfileOverview({ requestInit: { signal } }),
    staleTime: 60 * 1000,
  });
  const journalQuery = useInfiniteQuery({
    queryKey: ["journal"],
    queryFn: ({ pageParam, signal }) => getJournalEntries(
      { cursor: pageParam, limit: 10 },
      { requestInit: { signal } },
    ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 60 * 1000,
  });
  const connectionsQuery = useQuery({
    queryKey: ["connections", "summary"],
    queryFn: ({ signal }) => getConnectionsSummary({ requestInit: { signal } }),
    staleTime: 30 * 1000,
  });
  const overview = overviewQuery.data;
  const journalEntries = journalQuery.data?.pages.flatMap((page) => page.entries) ?? [];

  return (
    <section className={styles.root} aria-label="Profile">
      <header className={styles.header}>
        <ProfileAvatar
          profile={currentUser}
          className={styles.avatar}
          imageClassName={styles.avatarImage}
          priority
        />
        <div className={styles.identity}>
          <p className="eyebrow">Profile</p>
          <h1>{currentUser.username ? `@${currentUser.username}` : currentUser.displayName}</h1>
        </div>
        <Link className={styles.editLink} href="/profile/edit" aria-label="Edit profile">
          <PencilSimple size={21} weight="regular" aria-hidden="true" />
        </Link>
        <div className={styles.profileStats} aria-label="Profile counts">
          <span>
            <strong>{overviewQuery.isPending ? "–" : overview?.drillCount ?? 0}</strong>
            Drills
          </span>
          <Link href="/connections?tab=followers">
            <strong>{connectionsQuery.data?.counts.followers ?? "–"}</strong>
            Followers
            {(connectionsQuery.data?.counts.incoming ?? 0) > 0 && (
              <small aria-label={`${connectionsQuery.data?.counts.incoming} pending follow requests`}>
                {connectionsQuery.data?.counts.incoming}
              </small>
            )}
          </Link>
          <Link href="/connections?tab=following">
            <strong>{connectionsQuery.data?.counts.following ?? "–"}</strong>
            Following
          </Link>
        </div>
      </header>

      {overviewQuery.isError && (
        <button className={styles.loadError} type="button" onClick={() => void overviewQuery.refetch()}>
          Couldn’t load profile entries. Retry
        </button>
      )}

      <nav className={styles.savedRail} aria-label="Saved drill lists">
        <SavedListLink
          title="Favourites"
          href="/profile/favourites"
          count={overviewQuery.isPending ? null : overview?.favouriteCount ?? 0}
          icon={<Star size={18} weight="regular" aria-hidden="true" />}
        />
        <SavedListLink
          title="Drill Back In"
          href="/profile/drill-back-in"
          count={overviewQuery.isPending ? null : overview?.drillBackInCount ?? 0}
          icon={<Target size={18} weight="regular" aria-hidden="true" />}
        />
      </nav>

      <section className={styles.methodBreakdown} aria-labelledby="training-methods-title">
        <p className="eyebrow" id="training-methods-title">Training Methods</p>
        {overviewQuery.isPending ? (
          <div className={styles.methodStripLoading} aria-label="Loading Training Method counts">
            {Array.from({ length: 5 }).map((_, index) => <span key={index} />)}
          </div>
        ) : (overview?.trainingMethods.length ?? 0) > 0 ? (
          <div className={styles.methodStrip}>
            {overview?.trainingMethods.map((method) => (
              <div key={method.id} className={styles.methodStat} aria-label={`${method.name}: ${method.count} drills`}>
                {badgeByIconKey[method.iconKey] ? (
                  <Image
                    src={badgeByIconKey[method.iconKey]}
                    width={30}
                    height={30}
                    alt=""
                    aria-hidden="true"
                  />
                ) : <span className={styles.methodFallback} aria-hidden="true" />}
                <strong>{method.count}</strong>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.compactEmpty}>Method totals appear after your first drill.</p>
        )}
      </section>

      <section className={styles.journal} aria-labelledby="progress-journal-title">
        <div className={styles.journalHeading}>
          <div>
            <p className="eyebrow">Training Memory</p>
            <h2 id="progress-journal-title">Progress Journal</h2>
          </div>
          <Link className={styles.addEntry} href="/journal/new">
            <Plus size={18} weight="bold" aria-hidden="true" />
            Add Entry
          </Link>
        </div>

        {journalQuery.isPending ? (
          <div className={styles.journalLoading} aria-label="Loading journal entries">
            {Array.from({ length: 3 }).map((_, index) => <span key={index} />)}
          </div>
        ) : journalQuery.isError ? (
          <button className={styles.journalError} type="button" onClick={() => void journalQuery.refetch()}>
            Journal entries couldn’t be loaded. Retry
          </button>
        ) : journalEntries.length > 0 ? (
          <div className={styles.journalRows}>
            {journalEntries.map((entry, index) => (
              <JournalEntryRow key={entry.id} entry={entry} eager={index < 2} priority={index === 0} />
            ))}
            {journalQuery.hasNextPage && (
              <button
                className={styles.loadMore}
                type="button"
                disabled={journalQuery.isFetchingNextPage}
                onClick={() => void journalQuery.fetchNextPage()}
              >
                {journalQuery.isFetchingNextPage ? "Loading..." : "Load more"}
              </button>
            )}
          </div>
        ) : (
          <div className={styles.journalEmpty}>
            <p>Your training clips will collect here by date.</p>
            <Link href="/journal/new">Add your first entry</Link>
          </div>
        )}
      </section>

      <section className={styles.account}>
        <p className="eyebrow">Account</p>
        <SignOutButton className={styles.signOut} errorClassName={styles.signOutError} />
      </section>
    </section>
  );
}

function SavedListLink({
  title,
  href,
  count,
  icon,
}: {
  title: string;
  href: string;
  count: number | null;
  icon: React.ReactNode;
}) {
  return (
    <Link className={styles.savedLink} href={href}>
      {icon}
      <span>{title}</span>
      <strong>{count ?? "–"}</strong>
    </Link>
  );
}

function JournalEntryRow({
  entry,
  eager,
  priority,
}: {
  entry: JournalEntrySummary;
  eager: boolean;
  priority: boolean;
}) {
  const href = `/journal/${entry.id}`;

  return (
    <Link
      className={styles.journalRow}
      href={href}
    >
      <span className={styles.videoTile} aria-hidden="true">
        <span className={styles.videoFallback}>
          <VideoCamera size={20} weight="regular" />
        </span>
        {entry.posterUrl && (
          <DecodedImage
            src={entry.posterUrl}
            alt=""
            loading={eager ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            decoding="async"
          />
        )}
        <Play className={styles.videoPlay} size={16} weight="fill" />
        {entry.durationMs !== null && <small>{formatDuration(entry.durationMs)}</small>}
      </span>
      <span className={styles.journalCopy}>
        <time dateTime={entry.occurredOn}>{formatJournalDate(entry.occurredOn)}</time>
        <strong>{entry.caption || "Training entry"}</strong>
        {entry.drill && <small>{entry.drill.title}</small>}
      </span>
    </Link>
  );
}

function formatJournalDate(value: string): string {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
