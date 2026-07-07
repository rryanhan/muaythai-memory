import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { drillDetailResponseSchema } from "@/modules/drills/contracts";
import { getDrillById } from "@/modules/drills/queries";

export const dynamic = "force-dynamic";

const routeParamsSchema = z.object({
  id: z.string().uuid(),
});

// Drill detail endpoint for opening a node/list row without bloating graph or
// library payloads.
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = routeParamsSchema.parse(await context.params);
    const drill = await getDrillById(id);

    if (!drill) {
      return NextResponse.json({ error: "Drill not found." }, { status: 404 });
    }

    const response = drillDetailResponseSchema.parse({ drill });
    return NextResponse.json(response);
  } catch (error) {
    return handleRouteError(error, "Failed to load drill.");
  }
}

function handleRouteError(error: unknown, fallbackMessage: string) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Invalid drill id or response shape.", issues: error.issues }, { status: 400 });
  }

  console.error(fallbackMessage, error);
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}
