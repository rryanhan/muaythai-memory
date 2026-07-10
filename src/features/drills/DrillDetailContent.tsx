import type { DrillDetail } from "@/data";

type DrillDetailContentProps = {
  drill: DrillDetail;
  badgeByIconKey: Record<string, string>;
};

export function DrillDetailContent({ drill, badgeByIconKey }: DrillDetailContentProps) {
  const primaryMethod = drill.trainingMethods[0];
  const primaryBadge = primaryMethod ? badgeByIconKey[primaryMethod.iconKey] : undefined;
  const summary = drill.summary.trim();
  const notes = drill.notes?.trim();

  return (
    <article className="drill-detail-content">
      <div className="drill-detail-title-row">
        {primaryBadge && (
          <img className="drill-detail-method-badge" src={primaryBadge} alt="" aria-hidden="true" />
        )}
        <div>
          <h2>{drill.title}</h2>
          {primaryMethod && <p>{primaryMethod.name}</p>}
        </div>
      </div>

      {summary && <p className="drill-detail-summary">{summary}</p>}

      <div className="drill-detail-tags" aria-label="Drill tags">
        {drill.tags.map((tag) => (
          <span key={tag.id} className="drill-detail-chip">
            {tag.name}
          </span>
        ))}
        {drill.customTags.map((tag) => (
          <span key={tag.id} className="drill-detail-chip drill-detail-chip-custom">
            {tag.name}
          </span>
        ))}
        {drill.statusTags.map((status) => (
          <span key={status.id} className="drill-detail-chip drill-detail-chip-status">
            {status.name}
          </span>
        ))}
      </div>

      <section className="drill-detail-section">
        <h3>Steps</h3>
        {drill.steps.length > 0 ? (
          <ol>
            {drill.steps.map((step) => (
              <li key={step.id}>{step.body}</li>
            ))}
          </ol>
        ) : (
          <p>No steps saved yet.</p>
        )}
      </section>

      {notes && (
        <section className="drill-detail-section">
          <h3>Notes</h3>
          <p>{notes}</p>
        </section>
      )}
    </article>
  );
}
