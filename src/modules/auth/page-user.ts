import { redirect } from "next/navigation";
import { safeInternalPath } from "@/lib/safe-internal-path";
import {
  AuthenticationRequiredError,
  requireCurrentAppUser,
  requireCurrentUserId,
} from "./current-user";

export async function requireCurrentPageUser(nextPath = "/") {
  try {
    return await requireCurrentAppUser();
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError)) throw error;
    redirect(`/auth/sign-in?next=${encodeURIComponent(safeInternalPath(nextPath))}`);
  }
}

export async function requireCurrentPageUserId(nextPath = "/") {
  try {
    return await requireCurrentUserId();
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError)) throw error;
    redirect(`/auth/sign-in?next=${encodeURIComponent(safeInternalPath(nextPath))}`);
  }
}
