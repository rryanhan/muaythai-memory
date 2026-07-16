import type { Metadata } from "next";
import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";
import { DrillDetailBackButton } from "@/features/drills/DrillDetailBackButton";
import { AddDrillForm } from "@/features/drills/AddDrillForm";
import routeStyles from "@/features/drills/DrillRouteShell.module.css";
import { requireCurrentPageUserId } from "@/modules/auth";

export const metadata: Metadata = {
  title: "Add Drill | Muay Thai Memory",
  description: "Create a saved Muay Thai drill.",
};

export default async function AddDrillPage() {
  await requireCurrentPageUserId("/drills/new");

  return (
    <main className={routeStyles.formPage}>
      <div className="notebook-grid" aria-hidden="true" />
      <header className="drill-detail-page-header">
        <DrillDetailBackButton />
        <p className="eyebrow">Add Drill</p>
      </header>
      <section className="add-drill-heading">
        <h1>New Drill</h1>
        <p>Save the steps, notes, and tags while it is still fresh.</p>
      </section>
      <AddDrillForm />
      <RoutedBottomNav activeView="library" />
    </main>
  );
}
