"use client";

import { useState, type FormEvent } from "react";
import { Drawer } from "vaul";
import { useDrawerFocus } from "@/features/media/use-drawer-focus";
import type {
  FighterSummary,
  ReportReason,
} from "@/data/connections";
import styles from "./Connections.module.css";

const reasons: Array<{ value: ReportReason; label: string }> = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "impersonation", label: "Impersonation" },
  { value: "unsafe-content", label: "Unsafe Content" },
  { value: "other", label: "Other" },
];

export function FighterReportSheet({
  fighter,
  open,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  fighter: FighterSummary;
  open: boolean;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (reason: ReportReason, details: string) => void;
}) {
  const contentRef = useDrawerFocus(open);
  const [reason, setReason] = useState<ReportReason>("spam");
  const [details, setDetails] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(reason, details);
  }

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(nextOpen) => !nextOpen && !pending && onClose()}
      direction="bottom"
      modal
      dismissible={!pending}
      autoFocus={false}
    >
      <Drawer.Portal>
        <Drawer.Overlay className={styles.drawerBackdrop} />
        <Drawer.Content
          ref={contentRef}
          className={styles.reportSheet}
          aria-label={`Report @${fighter.username}`}
        >
          <Drawer.Handle className="sheet-handle" />
          <Drawer.Title asChild>
            <h2>Report Fighter</h2>
          </Drawer.Title>
          <Drawer.Description asChild>
            <p>Tell us what is wrong with @{fighter.username}.</p>
          </Drawer.Description>
          <form onSubmit={handleSubmit}>
            <fieldset disabled={pending}>
              <legend>Reason</legend>
              <div className={styles.reportReasons}>
                {reasons.map((option) => (
                  <label key={option.value}>
                    <input
                      type="radio"
                      name="report-reason"
                      value={option.value}
                      checked={reason === option.value}
                      onChange={() => setReason(option.value)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
              <label className={styles.reportDetails}>
                Details <small>(optional)</small>
                <textarea
                  value={details}
                  maxLength={500}
                  rows={3}
                  onChange={(event) => setDetails(event.target.value)}
                />
              </label>
            </fieldset>
            {error && <p className={styles.drawerError} role="alert">{error}</p>}
            <div className={styles.drawerActions}>
              <button
                type="button"
                data-drawer-initial-focus
                disabled={pending}
                onClick={onClose}
              >
                Cancel
              </button>
              <button type="submit" disabled={pending}>
                {pending ? "Submitting…" : "Submit Report"}
              </button>
            </div>
          </form>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
