import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/features/auth/ForgotPasswordForm";
import styles from "@/features/auth/SignIn.module.css";
import { safeInternalPath } from "@/lib/safe-internal-path";

export const metadata: Metadata = { title: "Reset password | Muay Thai Memory" };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const nextPath = safeInternalPath((await searchParams).next);
  return <main className={styles.page}><div className="notebook-grid" aria-hidden="true" /><ForgotPasswordForm nextPath={nextPath} /></main>;
}
