import { z } from "zod";
import {
  deleteDrillResponseSchema,
  drillDetailResponseSchema,
  drillListResponseSchema,
} from "@/modules/drills/contracts";
import type {
  ApiClientOptions,
  CreateDrillInput,
  DrillDetail,
  DrillFilterInput,
  DrillListResponse,
  UpdateDrillInput,
} from "./types";
import { fetchJson } from "./api-core";
import { appendQueryString, buildDrillSearchParams } from "./filter-query";

export async function getDrills(
  filters: DrillFilterInput = {},
  options: ApiClientOptions = {},
): Promise<DrillListResponse> {
  return fetchJson(buildDrillsApiPath(filters), drillListResponseSchema, options);
}

export async function getDrill(id: string, options: ApiClientOptions = {}): Promise<DrillDetail> {
  const drillId = z.string().uuid().parse(id);
  const response = await fetchJson(
    `/api/drills/${encodeURIComponent(drillId)}`,
    drillDetailResponseSchema,
    options,
  );
  return response.drill;
}

export async function createDrill(
  input: CreateDrillInput,
  options: ApiClientOptions = {},
): Promise<DrillDetail> {
  const response = await fetchJson("/api/drills", drillDetailResponseSchema, options, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return response.drill;
}

export async function updateDrill(
  id: string,
  input: UpdateDrillInput,
  options: ApiClientOptions = {},
): Promise<DrillDetail> {
  const drillId = z.string().uuid().parse(id);
  const response = await fetchJson(
    `/api/drills/${encodeURIComponent(drillId)}`,
    drillDetailResponseSchema,
    options,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  return response.drill;
}

export async function deleteDrill(id: string, options: ApiClientOptions = {}): Promise<string> {
  const drillId = z.string().uuid().parse(id);
  const response = await fetchJson(
    `/api/drills/${encodeURIComponent(drillId)}`,
    deleteDrillResponseSchema,
    options,
    { method: "DELETE" },
  );
  return response.deletedId;
}

export function buildDrillsApiPath(filters: DrillFilterInput = {}): string {
  return appendQueryString("/api/drills", buildDrillSearchParams(filters));
}

export { buildDrillSearchParams } from "./filter-query";
