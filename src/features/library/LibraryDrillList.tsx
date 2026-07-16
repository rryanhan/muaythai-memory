"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { DrillSummary } from "@/data";
import styles from "./LibraryDrillList.module.css";

export function LibraryDrillRow({ drill }: { drill: DrillSummary }) {
  const router = useRouter();
  const visibleTags = [...drill.tags, ...drill.customTags].slice(0, 5);
  const href = `/drills/${drill.id}`;

  function prefetchDetail() {
    router.prefetch(href);
  }

  return (
    <article className={styles.row}>
      <Link href={href} prefetch onFocus={prefetchDetail} onPointerEnter={prefetchDetail} onTouchStart={prefetchDetail}>
        <h2>{drill.title}</h2>
        {visibleTags.length > 0 && (
          <span className={styles.tags} aria-label={`Tags: ${visibleTags.map((tag) => tag.name).join(", ")}`}>
            {visibleTags.map((tag) => (
              <span key={tag.id} className={styles.tag}>
                {tag.name}
              </span>
            ))}
          </span>
        )}
      </Link>
    </article>
  );
}

export function LibraryLoadingList() {
  return (
    <div className="library-list library-loading-list" aria-label="Loading drill entries" aria-busy="true">
      <span className="sr-only">Loading drills</span>
      {Array.from({ length: 6 }).map((_, index) => (
        <article key={index} className="library-loading-row" aria-hidden="true">
          <span className="library-skeleton library-skeleton-title" />
          <span className="library-skeleton library-skeleton-tags" />
        </article>
      ))}
    </div>
  );
}

export function LibraryStatePanel({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <section className="library-state-panel">
      <p className="eyebrow">Training Log</p>
      <h2>{title}</h2>
      <p>{body}</p>
      {children}
    </section>
  );
}
