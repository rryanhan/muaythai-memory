import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";
import { JournalDeleteSection } from "@/features/journal/JournalDeleteSection";
import { JournalVideoPlayer } from "@/features/journal/JournalVideoPlayer";
import styles from "@/features/journal/Journal.module.css";
import { requireCurrentPageUserId } from "@/modules/auth";
import { getJournalEntryById } from "@/modules/journal/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().uuid() });
const getCachedEntry = cache(getJournalEntryById);

type JournalEntryPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ fromDrill?: string }>;
};

export async function generateMetadata({ params }: JournalEntryPageProps): Promise<Metadata> {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return { title: "Journal entry not found | Muay Thai Memory" };
  const userId = await requireCurrentPageUserId(`/journal/${parsed.data.id}`);
  const entry = await getCachedEntry(userId, parsed.data.id);
  return { title: entry ? `${formatJournalDate(entry.occurredOn)} | Progress Journal` : "Journal entry not found | Muay Thai Memory" };
}

export default async function JournalEntryPage({ params, searchParams }: JournalEntryPageProps) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const userId = await requireCurrentPageUserId(`/journal/${parsed.data.id}`);
  const entry = await getCachedEntry(userId, parsed.data.id);
  if (!entry) notFound();
  const fromDrill = z.string().uuid().safeParse((await searchParams)?.fromDrill);
  const backHref = fromDrill.success ? `/drills/${fromDrill.data}/journal` : "/?view=profile";
  const editHref = fromDrill.success
    ? `/journal/${entry.id}/edit?fromDrill=${fromDrill.data}`
    : `/journal/${entry.id}/edit`;

  return (
    <main className={styles.page}>
      <div className="notebook-grid" aria-hidden="true" />
      <header className={styles.routeHeader}>
        <Link className={styles.back} href={backHref} aria-label="Back">←</Link>
        <p className="eyebrow">Progress Journal</p>
        <Link className={styles.headerAction} href={editHref} prefetch>Edit</Link>
      </header>
      <JournalVideoPlayer
        src={entry.playbackUrl}
        poster={entry.posterUrl}
        label="Journal entry video"
        autoPlay
        loop
        initialMuted
        preload="auto"
      />
      <section className={styles.entryMeta}>
        <p className={styles.entryDate}>
          <time dateTime={entry.occurredOn}>{formatJournalDate(entry.occurredOn)}</time>
          {entry.durationMs !== null ? ` · ${formatDuration(entry.durationMs)}` : ""}
        </p>
        {entry.caption && <p className={styles.entryCaption}>{entry.caption}</p>}
        {entry.drill && (
          <Link className={styles.linkedDrill} href={`/drills/${entry.drill.id}`} prefetch>
            <span>Related drill</span>
            <strong>{entry.drill.title}</strong>
          </Link>
        )}
      </section>
      <JournalDeleteSection entryId={entry.id} />
      <RoutedBottomNav activeView="profile" />
    </main>
  );
}

function formatJournalDate(value: string): string {
  return new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}
