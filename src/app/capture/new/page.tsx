import type { Metadata } from "next";
import { CaptureDraftScreen, type CaptureOrigin } from "@/features/capture/CaptureDraftScreen";
import type { CaptureMode } from "@/features/capture/CaptureDraftForm";
import { requireCurrentPageUserId } from "@/modules/auth";

export const metadata: Metadata = {
  title: "Capture Drill | Muay Thai Memory",
  description: "Record or type a training note and turn it into a drill.",
};

type CaptureDraftPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CaptureDraftPage({ searchParams }: CaptureDraftPageProps) {
  const params = await searchParams;
  const initialMode: CaptureMode = params.mode === "text" ? "text" : "voice";
  const origin: CaptureOrigin = params.from === "network" ? "network" : "library";
  await requireCurrentPageUserId(`/capture/new?mode=${initialMode}&from=${origin}`);

  return <CaptureDraftScreen initialMode={initialMode} origin={origin} />;
}
