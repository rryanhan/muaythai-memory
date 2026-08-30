import { z } from "zod";
import {
  drillShareRecipientPageSchema,
  sharedDrillListResponseSchema,
  updateDrillShareInputSchema,
  updateDrillShareResponseSchema,
  type DrillShareRecipientPage,
  type SharedDrillListResponse,
  type UpdateDrillShareInput,
  type UpdateDrillShareResponse,
} from "@/modules/sharing/contracts";
import { fetchJson } from "./api-core";
import type { ApiClientOptions } from "./types";

export type {
  DrillShareRecipientItem,
  DrillShareRecipientPage,
  SharedDrillDetailResponse,
  SharedDrillListItem,
  SharedDrillListResponse,
  UpdateDrillShareInput,
  UpdateDrillShareResponse,
} from "@/modules/sharing/contracts";

export async function getDrillShareRecipientPage(
  drillId: string,
  cursor: string | null,
  options: ApiClientOptions = {},
): Promise<DrillShareRecipientPage> {
  const id = z.string().uuid().parse(drillId);
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  const query = params.size > 0 ? `?${params.toString()}` : "";
  return fetchJson(
    `/api/drills/${encodeURIComponent(id)}/shares${query}`,
    drillShareRecipientPageSchema,
    options,
  );
}

export async function updateDrillShare(
  drillId: string,
  rawInput: UpdateDrillShareInput,
  options: ApiClientOptions = {},
): Promise<UpdateDrillShareResponse> {
  const id = z.string().uuid().parse(drillId);
  const input = updateDrillShareInputSchema.parse(rawInput);
  return fetchJson(
    `/api/drills/${encodeURIComponent(id)}/shares`,
    updateDrillShareResponseSchema,
    options,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export async function getSharedDrills(
  input: { cursor?: string | null; ownerUsername?: string } = {},
  options: ApiClientOptions = {},
): Promise<SharedDrillListResponse> {
  const params = new URLSearchParams();
  if (input.cursor) params.set("cursor", input.cursor);
  if (input.ownerUsername) params.set("owner", input.ownerUsername);
  const query = params.size > 0 ? `?${params.toString()}` : "";
  return fetchJson(
    `/api/shared-drills${query}`,
    sharedDrillListResponseSchema,
    options,
  );
}
