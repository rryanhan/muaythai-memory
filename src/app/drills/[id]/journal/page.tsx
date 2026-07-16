import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";
import journalStyles from "@/features/journal/Journal.module.css";
import mediaStyles from "@/features/journal/JournalMedia.module.css";
import routeStyles from "@/features/drills/DrillRouteShell.module.css";
import { requireCurrentPageUserId } from "@/modules/auth";
import { getDrillById } from "@/modules/drills/queries";
import { listJournalEntries } from "@/modules/journal/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().uuid() });

export default async function DrillJournalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const userId = await requireCurrentPageUserId(`/drills/${parsed.data.id}/journal`);
  const drill = await getDrillById(userId, parsed.data.id);
  if (!drill) notFound();
  const { cursor } = await searchParams;
  const result = await listJournalEntries(userId, { drillId: drill.id, cursor, limit: 25 });

  return (
    <main className={routeStyles.detailPage}>
      <div className="notebook-grid" aria-hidden="true" />
      <header className="drill-detail-page-header">
        <Link className={journalStyles.back} href={`/drills/${drill.id}`} aria-label="Back to drill">←</Link>
        <p className="eyebrow">Training Clips</p>
      </header>
      <section className={mediaStyles.relatedJournalPage}>
        <h1>{drill.title}</h1>
        <p>{result.entries.length === 0 ? "No linked journal entries yet." : "Journal entries linked to this drill."}</p>
        <div className={mediaStyles.relatedJournalRows}>
          {result.entries.map((entry) => (
            <Link key={entry.id} href={`/journal/${entry.id}?fromDrill=${drill.id}`} prefetch>
              <span aria-hidden="true">▶</span>
              <div>
                <time dateTime={entry.occurredOn}>{formatJournalDate(entry.occurredOn)}</time>
                <strong>{entry.caption || "Training entry"}</strong>
              </div>
            </Link>
          ))}
        </div>
        {result.nextCursor && (
          <Link className={mediaStyles.nextPageAction} href={`/drills/${drill.id}/journal?cursor=${encodeURIComponent(result.nextCursor)}`}>
            Next entries
          </Link>
        )}
      </section>
      <RoutedBottomNav activeView="library" />
    </main>
  );
}

function formatJournalDate(value: string): string {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}
