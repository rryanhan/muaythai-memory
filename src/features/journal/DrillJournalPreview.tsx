"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getDrillJournalPreview } from "@/data/journal";
import { JournalVideoPlayer } from "./JournalVideoPlayer";
import styles from "./JournalMedia.module.css";

export function DrillJournalPreview({ drillId }: { drillId: string }) {
  const previewQuery = useQuery({
    queryKey: ["drill-journal", drillId, "preview"],
    queryFn: ({ signal }) => getDrillJournalPreview(drillId, { requestInit: { signal } }),
    staleTime: 5 * 60 * 1000,
  });

  if (previewQuery.isPending) {
    return null;
  }
  if (previewQuery.isError || !previewQuery.data.entry) return null;

  const { entry, total } = previewQuery.data;
  return (
    <section className={styles.relatedClip} aria-labelledby="training-clip-heading">
      <div className={styles.relatedClipHeading}>
        <div>
          <p className="eyebrow">Progress Journal</p>
          <h3 id="training-clip-heading">Training Clip</h3>
        </div>
        {total > 1 && <Link href={`/drills/${drillId}/journal`} prefetch>View all {total}</Link>}
      </div>
      <JournalVideoPlayer src={entry.playbackUrl} label="Latest training clip for this drill" />
      <div className={styles.relatedClipMeta}>
        <time dateTime={entry.occurredOn}>{formatJournalDate(entry.occurredOn)}</time>
        {entry.caption && <p>{entry.caption}</p>}
      </div>
    </section>
  );
}

function formatJournalDate(value: string): string {
  return new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}
