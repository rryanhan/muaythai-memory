import skeletonStyles from "@/components/shared/Skeleton.module.css";
import styles from "./DrillForm.module.css";

export function AddDrillSkeleton() {
  const skeletonClassName = `${skeletonStyles.skeleton} drill-detail-skeleton`;

  return (
    <div className={styles.skeleton} aria-hidden="true">
      <section className="add-drill-section">
        <span className={`${skeletonClassName} drill-detail-skeleton-section-title`} />
        <div className="add-drill-skeleton-fields">
          <span className={`${skeletonClassName} add-drill-skeleton-field`} />
          <span className={`${skeletonClassName} add-drill-skeleton-area`} />
          <span className={`${skeletonClassName} add-drill-skeleton-area add-drill-skeleton-area-tall`} />
        </div>
      </section>

      <section className="add-drill-section">
        <span className={`${skeletonClassName} drill-detail-skeleton-section-title`} />
        <div className="add-drill-skeleton-steps">
          <span className={skeletonClassName} />
          <span className={skeletonClassName} />
        </div>
      </section>

      <section className="add-drill-section">
        <span className={`${skeletonClassName} drill-detail-skeleton-section-title`} />
        <div className="add-drill-skeleton-methods">
          <span className={skeletonClassName} />
          <span className={skeletonClassName} />
          <span className={skeletonClassName} />
          <span className={skeletonClassName} />
        </div>
      </section>

      <section className="add-drill-section">
        <span className={`${skeletonClassName} drill-detail-skeleton-section-title`} />
        <div className="add-drill-skeleton-tags">
          <span className={skeletonClassName} />
          <span className={skeletonClassName} />
          <span className={skeletonClassName} />
          <span className={skeletonClassName} />
          <span className={skeletonClassName} />
        </div>
      </section>
    </div>
  );
}
