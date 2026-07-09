import type { ReactNode } from "react";

const loadingMethods = [
  { label: "Pad Work", left: "45%", top: "39%" },
  { label: "Bag Work", left: "74%", top: "42%" },
  { label: "Technical Work", left: "26%", top: "49%" },
  { label: "Partner Drill", left: "50%", top: "57%" },
  { label: "Clinch", left: "29%", top: "70%" },
];

const loadingDots = [
  { left: "33%", top: "29%" },
  { left: "47%", top: "27%" },
  { left: "58%", top: "31%" },
  { left: "68%", top: "35%" },
  { left: "30%", top: "42%" },
  { left: "57%", top: "45%" },
  { left: "78%", top: "51%" },
  { left: "39%", top: "56%" },
  { left: "66%", top: "61%" },
  { left: "21%", top: "66%" },
  { left: "46%", top: "73%" },
  { left: "61%", top: "77%" },
];

const loadingLines = [
  [45, 39, 33, 29],
  [45, 39, 47, 27],
  [45, 39, 58, 31],
  [74, 42, 68, 35],
  [74, 42, 78, 51],
  [26, 49, 30, 42],
  [26, 49, 39, 56],
  [50, 57, 57, 45],
  [50, 57, 66, 61],
  [50, 57, 61, 77],
  [29, 70, 21, 66],
  [29, 70, 46, 73],
];

export function NetworkGraphLoading() {
  return (
    <>
      <div className="network-map-scroll" aria-label="Loading Muay Thai drill network">
        <div className="network-map">
          <div className="network-grid" aria-hidden="true" />
          <div className="network-chip-row">
            <div className="network-status-chip network-loading-chip">Building network</div>
          </div>

          <div className="network-loading-graph" aria-hidden="true">
            <svg className="network-loading-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
              {loadingLines.map(([x1, y1, x2, y2], index) => (
                <line key={`${x1}-${y1}-${x2}-${y2}-${index}`} x1={x1} y1={y1} x2={x2} y2={y2} />
              ))}
            </svg>

            {loadingMethods.map((method) => (
              <div
                key={method.label}
                className="network-loading-method"
                style={{ left: method.left, top: method.top }}
              >
                <span className="network-loading-method-badge" />
                <span className="network-loading-method-label">{method.label}</span>
              </div>
            ))}

            {loadingDots.map((dot, index) => (
              <span
                key={`${dot.left}-${dot.top}-${index}`}
                className="network-loading-dot"
                style={{ left: dot.left, top: dot.top }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="network-action-rail network-action-rail-loading" aria-hidden="true">
        <button type="button" aria-label="Network controls" disabled>
          <span className="rail-icon rail-icon-filter" aria-hidden="true" />
        </button>
        <button type="button" aria-label="Search network" disabled>
          <span className="rail-icon rail-icon-search" aria-hidden="true" />
        </button>
        <button type="button" className="record-button" aria-label="Record drill" disabled>
          <span className="rail-icon rail-icon-record" aria-hidden="true" />
        </button>
      </div>
    </>
  );
}

export function NetworkStatePanel({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <>
      <div className="network-grid" aria-hidden="true" />
      <div className="network-state-panel">
        <p className="eyebrow">Network</p>
        <h1>{title}</h1>
        <p>{body}</p>
        {children}
      </div>
    </>
  );
}
