import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOnboardedUserId } from "@/modules/auth";
import {
  drillShareErrorResponse,
  getSharedDrillById,
  sharedDrillDetailResponseSchema,
} from "@/modules/sharing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireOnboardedUserId();
    const { id } = paramsSchema.parse(await context.params);
    const detail = await getSharedDrillById(userId, id);
    if (!detail) {
      return NextResponse.json({ error: "Shared drill not found." }, { status: 404 });
    }
    return NextResponse.json(sharedDrillDetailResponseSchema.parse(detail));
  } catch (error) {
    return drillShareErrorResponse(error, "Shared drill could not be loaded.");
  }
}
