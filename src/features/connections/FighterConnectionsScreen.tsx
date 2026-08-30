"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";
import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";
import {
  getAuthorizedConnectionPage,
  type AuthorizedConnectionPageResponse,
  type PublicConnectionSection,
} from "@/data/connections";
import { ProfileAvatar } from "@/features/profile/ProfileAvatar";
import styles from "./Connections.module.css";

export function FighterConnectionsScreen({
  initialPage,
}: {
  initialPage: AuthorizedConnectionPageResponse;
}) {
  const router = useRouter();
  const { owner, section } = initialPage;
  const query = useInfiniteQuery({
    queryKey: ["fighter", owner.username, "connections", section],
    queryFn: ({ pageParam, signal }) => getAuthorizedConnectionPage(
      owner.username,
      section,
      pageParam,
      { requestInit: { signal } },
    ),
    initialPageParam: null as string | null,
    initialData: { pages: [initialPage], pageParams: [null] },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30 * 1000,
  });
  const items = query.data.pages.flatMap((page) => page.items);

  function selectSection(nextSection: PublicConnectionSection) {
    router.replace(
      `/fighters/${encodeURIComponent(owner.username)}/connections?tab=${nextSection}`,
      { scroll: false },
    );
  }

  return (
    <main className={styles.page}>
      <div className="notebook-grid" aria-hidden="true" />
      <header className={styles.routeHeader}>
        <Link
          className={styles.back}
          href={`/fighters/${encodeURIComponent(owner.username)}`}
          aria-label={`Back to @${owner.username}`}
        >
          ←
        </Link>
        <p className="eyebrow">Fighter Profile</p>
      </header>
      <section className={styles.heading}>
        <h1>@{owner.username}</h1>
        <p>Connections</p>
      </section>
      <nav className={styles.connectionTabsCompact} aria-label="Fighter connection lists">
        {(["followers", "following"] as const).map((value) => (
          <button
            key={value}
            type="button"
            data-active={section === value ? "true" : undefined}
            aria-current={section === value ? "page" : undefined}
            onClick={() => selectSection(value)}
          >
            {value === "followers" ? "Followers" : "Following"}
          </button>
        ))}
      </nav>
      <section className={styles.section}>
        {query.isError ? (
          <button className={styles.retry} type="button" onClick={() => void query.refetch()}>
            Connections couldn’t be loaded. Retry
          </button>
        ) : items.length > 0 ? (
          <div className={styles.rows}>
            {items.map(({ profile }) => (
              <div className={styles.connectionRow} key={profile.id}>
                <Link className={styles.connectionIdentityLink} href={`/fighters/${encodeURIComponent(profile.username)}`} prefetch>
                  <span className={styles.connectionIdentity}>
                    <ProfileAvatar
                      profile={{ displayName: profile.username, avatarUrl: profile.avatarUrl }}
                      className={styles.avatar}
                      imageClassName={styles.avatarImage}
                    />
                    <strong>@{profile.username}</strong>
                  </span>
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.empty}>No {section} yet.</p>
        )}
        {query.hasNextPage && (
          <button
            className={styles.loadMore}
            type="button"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? "Loading…" : `Load more ${section}`}
          </button>
        )}
      </section>
      <RoutedBottomNav activeView="profile" />
    </main>
  );
}
