"use client";

import { ListBullets } from "@phosphor-icons/react/ListBullets";
import { ListChecks } from "@phosphor-icons/react/ListChecks";
import { Microphone } from "@phosphor-icons/react/Microphone";
import { Plus } from "@phosphor-icons/react/Plus";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { TrainingMethodDto } from "@/data";
import { badgeByIconKey } from "@/components/shared/context-badges";
import type { TaxonomyLoadState } from "./types";

type LibraryIndexPanelProps = {
  methods: TrainingMethodDto[];
  selectedMethodSlug: string | null;
  taxonomyState: TaxonomyLoadState;
  onSelectMethod: (methodSlug: string | null) => void;
  onRetry: () => void;
};

export function LibraryIndexPanel({
  methods,
  selectedMethodSlug,
  taxonomyState,
  onSelectMethod,
  onRetry,
}: LibraryIndexPanelProps) {
  const router = useRouter();

  function prefetchAddDrill() {
    router.prefetch("/drills/new");
  }

  function prefetchCaptureDraft() {
    router.prefetch("/capture/new?mode=voice&from=library");
  }

  function prefetchFirstDrillGuide() {
    router.prefetch("/onboarding/first-drill?replay=1&next=%2F%3Fview%3Dlibrary");
  }

  return (
    <>
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
              prefetch={false}
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
              prefetch={false}
              onFocus={prefetchAddDrill}
              onPointerEnter={prefetchAddDrill}
              onTouchStart={prefetchAddDrill}
            >
              <span className="library-index-action-icon" aria-hidden="true">
                <Plus size={22} weight="bold" />
              </span>
              <span>Add Drill</span>
            </Link>
            <Link
              className="library-add-drill-link"
              href="/onboarding/first-drill?replay=1&next=%2F%3Fview%3Dlibrary"
              prefetch={false}
              onFocus={prefetchFirstDrillGuide}
              onPointerEnter={prefetchFirstDrillGuide}
              onTouchStart={prefetchFirstDrillGuide}
            >
              <span className="library-index-action-icon" aria-hidden="true">
                <ListChecks size={22} weight="bold" />
              </span>
              <span>First Drill Guide</span>
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
                  <Image
                    src={badgeByIconKey[method.iconKey]}
                    width={42}
                    height={42}
                    alt=""
                    aria-hidden="true"
                  />
                  <span>{method.name}</span>
                </button>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}
