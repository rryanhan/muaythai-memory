import { AppShell } from "@/components/app/AppShell";
import type { AppView } from "@/components/navigation/BottomNav";
import { getMuayThaiGraph } from "@/modules/graph";
import type { GraphResponse } from "@/data";
import { requireCurrentPageUser } from "@/modules/auth";

export const dynamic = "force-dynamic";

type HomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const initialView = getInitialView(searchParams ? await searchParams : undefined);
  const user = await requireCurrentPageUser(initialView === "network" ? "/" : `/?view=${initialView}`);
  const initialGraph = initialView === "network" ? await getInitialGraph(user.id) : undefined;

  return <AppShell currentUser={user} initialGraph={initialGraph} initialView={initialView} />;
}

async function getInitialGraph(userId: string): Promise<GraphResponse | undefined> {
  try {
    return await getMuayThaiGraph(
      userId,
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
