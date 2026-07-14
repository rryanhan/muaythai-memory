import type { Metadata } from "next";
import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";
import { CaptureDraftForm } from "@/features/capture/CaptureDraftForm";
import { DrillDetailBackButton } from "@/features/drills/DrillDetailBackButton";
import routeStyles from "@/features/drills/DrillRouteShell.module.css";

export const metadata: Metadata = {
  title: "Capture Draft | Muay Thai Memory",
  description: "Turn a messy training note into a draft drill.",
};

export default function CaptureDraftPage() {
  return (
    <main className={routeStyles.formPage}>
      <div className="notebook-grid" aria-hidden="true" />
      <header className="drill-detail-page-header">
        <DrillDetailBackButton />
        <p className="eyebrow">Capture Draft</p>
      </header>
      <section className="add-drill-heading">
        <h1>Capture Draft</h1>
        <p>Paste the messy version. Clean it up before saving.</p>
      </section>
      <CaptureDraftForm />
      <RoutedBottomNav activeView="library" />
    </main>
  );
}
