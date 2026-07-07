import { AppShell } from "@/components/AppShell";
import type { AppView } from "@/components/BottomNav";
import { getMuayThaiGraph } from "@/modules/graph";
import type { GraphResponse } from "@/data";

export const dynamic = "force-dynamic";

type HomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const initialView = getInitialView(searchParams ? await searchParams : undefined);
  const initialGraph = initialView === "network" ? await getInitialGraph() : undefined;

  return <AppShell initialGraph={initialGraph} initialView={initialView} />;
}

async function getInitialGraph(): Promise<GraphResponse | undefined> {
  try {
    return await getMuayThaiGraph(
      {},
      {
        showTags: false,
        showCustomTags: false,
        showStatusTags: false,
      },
    );
  } catch {
    return undefined;
  }
}

function getInitialView(searchParams: Record<string, string | string[] | undefined> | undefined): AppView {
  const view = searchParams?.view;
  const value = Array.isArray(view) ? view[0] : view;

  if (value === "library" || value === "profile") return value;
  return "network";
}
