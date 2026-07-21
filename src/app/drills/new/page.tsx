import type { Metadata } from "next";
import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";
import { DrillDetailBackButton } from "@/features/drills/DrillDetailBackButton";
import { AddDrillPageForm } from "@/features/drills/AddDrillPageForm";
import routeStyles from "@/features/drills/DrillRouteShell.module.css";
import { safeInternalPath } from "@/lib/safe-internal-path";
import { requireCurrentPageUserId, requireProfileOnboardedPageUser } from "@/modules/auth";

export const metadata: Metadata = {
  title: "Add Drill | Muay Thai Memory",
  description: "Create a saved Muay Thai drill.",
};

export default async function AddDrillPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; next?: string; onboarding?: string; replay?: string }>;
}) {
  const params = await searchParams;
  const fromJournal = params.from === "journal";
  const onboarding = params.onboarding === "1";
  const replay = params.replay === "1";
  const nextPath = safeInternalPath(params.next);
  if (onboarding) {
    const returnParams = new URLSearchParams({ onboarding: "1", next: nextPath });
    if (replay) returnParams.set("replay", "1");
    await requireProfileOnboardedPageUser(`/drills/new?${returnParams.toString()}`);
  } else {
    await requireCurrentPageUserId("/drills/new");
  }

  return (
    <main className={routeStyles.formPage}>
      <div className="notebook-grid" aria-hidden="true" />
      <header className="drill-detail-page-header">
        <DrillDetailBackButton />
        <p className="eyebrow">Add Drill</p>
      </header>
      <section className="add-drill-heading">
        <h1>{fromJournal ? "New Related Drill" : "New Drill"}</h1>
        <p>{fromJournal ? "Create the drill, then return to your journal entry." : "Save the steps, notes, and tags while it is still fresh."}</p>
      </section>
      <AddDrillPageForm
        fromJournal={fromJournal}
        onboarding={onboarding}
        nextPath={nextPath}
        replay={replay}
      />
      {!onboarding && <RoutedBottomNav activeView={fromJournal ? "profile" : "library"} />}
    </main>
  );
}
