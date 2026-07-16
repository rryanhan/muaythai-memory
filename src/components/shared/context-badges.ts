// Single frontend map for Training Method badge assets used by graph, library, and detail surfaces.
export const badgeByIconKey: Record<string, string> = {
  "pad-work": "/context-badges/pad-work-simple.svg",
  "bag-work": "/context-badges/bag-work-simple.svg",
  "partner-drill": "/context-badges/partner-drill-simple.svg",
  clinch: "/context-badges/clinch-simple.svg",
  "technical-work": "/context-badges/technical-work-simple.svg",
};

// Preload the complete five-badge set before client data and graph layout reveal
// the first badge element. The set is intentionally small (about 12 KB total).
export const contextBadgeUrls = Object.values(badgeByIconKey);
