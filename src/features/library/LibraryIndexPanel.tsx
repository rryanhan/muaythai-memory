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
        <div className="library-method-list">
          <button type="button" data-selected={!selectedMethodSlug} onClick={() => onSelectMethod(null)}>
            <span className="library-method-all-mark" aria-hidden="true" />
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
      )}
    </aside>
  );
}
