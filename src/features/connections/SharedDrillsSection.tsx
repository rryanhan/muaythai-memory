"use client";

import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { getSharedDrills } from "@/data/sharing";
import { ProfileAvatar } from "@/features/profile/ProfileAvatar";
import styles from "./Connections.module.css";

export function SharedDrillsSection({
  ownerUsername,
}: {
  ownerUsername?: string;
}) {
  const query = useInfiniteQuery({
    queryKey: ["shared-drills", ownerUsername ?? "all"],
    queryFn: ({ pageParam, signal }) => getSharedDrills(
      { cursor: pageParam, ownerUsername },
      { requestInit: { signal } },
    ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30 * 1000,
  });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  if (query.isPending) {
    return (
      <section className={styles.sharedSection} aria-label="Loading shared drills">
        <p className="eyebrow">Shared Drills</p>
        <p className={styles.status} role="status">Loading shared drills…</p>
      </section>
    );
  }
  if (query.isError) {
    return (
      <section className={styles.sharedSection}>
        <p className="eyebrow">Shared Drills</p>
        <button className={styles.sectionRetry} type="button" onClick={() => void query.refetch()}>
          Shared drills couldn’t be loaded. Retry
        </button>
      </section>
    );
  }
  if (items.length === 0) return null;

  return (
    <section className={styles.sharedSection} aria-labelledby={`shared-drills-${ownerUsername ?? "all"}`}>
      <div className={styles.sectionHeading}>
        <p className="eyebrow" id={`shared-drills-${ownerUsername ?? "all"}`}>
          Shared Drills
        </p>
      </div>
      <div className={styles.sharedRows}>
        {items.map((item) => (
          <Link
            key={`${item.owner.id}:${item.drill.id}`}
            href={`/shared/drills/${item.drill.id}`}
            prefetch
          >
            {!ownerUsername && (
              <ProfileAvatar
                profile={{
                  displayName: item.owner.username,
                  avatarUrl: item.owner.avatarUrl,
                }}
                className={styles.sharedAvatar}
                imageClassName={styles.avatarImage}
              />
            )}
            <span>
              <strong>{item.drill.title}</strong>
              <small>
                {ownerUsername
                  ? item.drill.trainingMethods[0]?.name ?? "Shared drill"
                  : `@${item.owner.username}`}
              </small>
            </span>
            <ArrowRight size={18} weight="bold" aria-hidden="true" />
          </Link>
        ))}
      </div>
      {query.hasNextPage && (
        <button
          className={styles.loadMore}
          type="button"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? "Loading…" : "Load more shared drills"}
        </button>
      )}
    </section>
  );
}
