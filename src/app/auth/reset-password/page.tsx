import type { Metadata } from "next";
import { ResetPasswordForm } from "@/features/auth/ResetPasswordForm";
import styles from "@/features/auth/SignIn.module.css";
import { safeInternalPath } from "@/lib/safe-internal-path";
import { requireAuthenticatedPageUser } from "@/modules/auth";

export const metadata: Metadata = { title: "Choose password | Muay Thai Memory" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const nextPath = safeInternalPath((await searchParams).next);
  await requireAuthenticatedPageUser(`/auth/reset-password?next=${encodeURIComponent(nextPath)}`);
  return <main className={styles.page}><div className="notebook-grid" aria-hidden="true" /><ResetPasswordForm nextPath={nextPath} /></main>;
}
