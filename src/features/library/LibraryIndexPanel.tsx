"use client";

import { ListBullets, Microphone, Plus } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { TrainingMethodDto } from "@/data";
import { badgeByIconKey } from "@/components/shared/context-badges";
import type { TaxonomyLoadState } from "./types";

type LibraryIndexPanelProps = {
  methods: TrainingMethodDto[];
  selectedMethodSlug: string | null;
  taxonomyState: TaxonomyLoadState;
  onSelectMethod: (methodSlug: string | null) => void;
  onClose: () => void;
  onRetry: () => void;
};

export function LibraryIndexPanel({
  methods,
  selectedMethodSlug,
  taxonomyState,
  onSelectMethod,
  onClose,
  onRetry,
}: LibraryIndexPanelProps) {
  const router = useRouter();

  function prefetchAddDrill() {
    router.prefetch("/drills/new");
  }

  function prefetchCaptureDraft() {
    router.prefetch("/capture/new?mode=voice&from=library");
  }

  useEffect(() => {
    prefetchAddDrill();
    prefetchCaptureDraft();
  }, []);

  return (
    <aside className="library-index-panel" aria-label="Training Method index">
      <header>
        <p className="eyebrow">Index</p>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </header>

      {taxonomyState.status === "loading" && <p className="library-muted">Loading methods</p>}
      {taxonomyState.status === "error" && (
        <div className="library-filter-state">
          <p>{taxonomyState.message}</p>
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}
      {taxonomyState.status === "loaded" && (
        <>
          <div className="library-index-action-block">
            <Link
              className="library-add-drill-link"
              href="/capture/new?mode=voice&from=library"
              prefetch
              onFocus={prefetchCaptureDraft}
              onPointerEnter={prefetchCaptureDraft}
              onTouchStart={prefetchCaptureDraft}
            >
              <span className="library-index-action-icon" aria-hidden="true">
                <Microphone size={22} weight="bold" />
              </span>
              <span>Capture Drill</span>
            </Link>
            <Link
              className="library-add-drill-link"
              href="/drills/new"
              prefetch
              onFocus={prefetchAddDrill}
              onPointerEnter={prefetchAddDrill}
              onTouchStart={prefetchAddDrill}
            >
              <span className="library-index-action-icon" aria-hidden="true">
                <Plus size={22} weight="bold" />
              </span>
              <span>Add Drill</span>
            </Link>
          </div>

          <section className="library-index-section" aria-label="Training Method filters">
            <p className="library-index-section-label">Training Methods</p>
            <div className="library-method-list">
              <button
                type="button"
                data-kind="all"
                data-selected={!selectedMethodSlug}
                onClick={() => onSelectMethod(null)}
              >
                <span className="library-index-utility-icon" aria-hidden="true">
                  <ListBullets size={24} weight="regular" />
                </span>
                <span>All Drills</span>
              </button>
              {methods.map((method) => (
                <button
                  key={method.id}
                  type="button"
                  data-selected={selectedMethodSlug === method.slug}
                  onClick={() => onSelectMethod(method.slug)}
                >
                  <img src={badgeByIconKey[method.iconKey]} alt="" aria-hidden="true" />
                  <span>{method.name}</span>
                </button>
              ))}
            </div>
          </section>
        </>
      )}
    </aside>
  );
}
