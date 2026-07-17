export const trainingMethodSeeds = [
  { name: "Pad Work", slug: "pad-work", iconKey: "pad-work", sortOrder: 10 },
  { name: "Bag Work", slug: "bag-work", iconKey: "bag-work", sortOrder: 20 },
  { name: "Partner Drill", slug: "partner-drill", iconKey: "partner-drill", sortOrder: 30 },
  { name: "Clinch", slug: "clinch", iconKey: "clinch", sortOrder: 40 },
  { name: "Technical Work", slug: "technical-work", iconKey: "technical-work", sortOrder: 50 },
] as const;

export const tagCategorySeeds = [
  { name: "Boxing", slug: "boxing", sortOrder: 10 },
  { name: "Kicking", slug: "kicking", sortOrder: 20 },
  { name: "Knees", slug: "knees", sortOrder: 30 },
  { name: "Elbows", slug: "elbows", sortOrder: 40 },
  { name: "Defense", slug: "defense", sortOrder: 50 },
  { name: "Head Movement", slug: "head-movement", sortOrder: 60 },
  { name: "Footwork", slug: "footwork", sortOrder: 70 },
  { name: "Sweeps", slug: "sweeps", sortOrder: 80 },
  { name: "Movement & Timing", slug: "movement-and-timing", sortOrder: 90 },
  { name: "Practice Format", slug: "practice-format", sortOrder: 100 },
] as const;

export const standardTagSeeds = [
  { name: "Jab", slug: "jab", categorySlug: "boxing", sortOrder: 10 },
  { name: "Cross", slug: "cross", categorySlug: "boxing", sortOrder: 20 },
  { name: "Hook", slug: "hook", categorySlug: "boxing", sortOrder: 30 },
  { name: "Uppercut", slug: "uppercut", categorySlug: "boxing", sortOrder: 40 },
  { name: "Body Shot", slug: "body-shot", categorySlug: "boxing", sortOrder: 50 },
  { name: "Teep", slug: "teep", categorySlug: "kicking", sortOrder: 10 },
  { name: "Round Kick", slug: "round-kick", categorySlug: "kicking", sortOrder: 20 },
  { name: "Low Kick", slug: "low-kick", categorySlug: "kicking", sortOrder: 30 },
  { name: "Knee", slug: "knee", categorySlug: "knees", sortOrder: 10 },
  { name: "Elbow", slug: "elbow", categorySlug: "elbows", sortOrder: 10 },
  { name: "Kick Check", slug: "kick-check", categorySlug: "defense", sortOrder: 10 },
  { name: "Kick Catch", slug: "kick-catch", categorySlug: "defense", sortOrder: 20 },
  { name: "Parry", slug: "parry", categorySlug: "defense", sortOrder: 30 },
  { name: "Long Guard", slug: "long-guard", categorySlug: "defense", sortOrder: 40 },
  { name: "Slip", slug: "slip", categorySlug: "head-movement", sortOrder: 10 },
  { name: "Roll", slug: "roll", categorySlug: "head-movement", sortOrder: 20 },
  { name: "Pivot", slug: "pivot", categorySlug: "footwork", sortOrder: 10 },
  { name: "Switch Step", slug: "switch-step", categorySlug: "footwork", sortOrder: 20 },
  { name: "Step Through", slug: "step-through", categorySlug: "footwork", sortOrder: 30 },
  { name: "Stance Switch", slug: "stance-switch", categorySlug: "footwork", sortOrder: 40 },
  { name: "Sweep", slug: "sweep", categorySlug: "sweeps", sortOrder: 10 },
  { name: "Entry", slug: "entry", categorySlug: "movement-and-timing", sortOrder: 10 },
  { name: "Angle", slug: "angle", categorySlug: "movement-and-timing", sortOrder: 20 },
  { name: "Distance", slug: "distance", categorySlug: "movement-and-timing", sortOrder: 30 },
  { name: "Timing", slug: "timing", categorySlug: "movement-and-timing", sortOrder: 40 },
  { name: "Pressure", slug: "pressure", categorySlug: "movement-and-timing", sortOrder: 50 },
  { name: "Feint", slug: "feint", categorySlug: "movement-and-timing", sortOrder: 60 },
  { name: "Shadowboxing", slug: "shadowboxing", categorySlug: "practice-format", sortOrder: 10 },
] as const;

export const statusTagSeeds = [
  { name: "Favourite", slug: "starred", sortOrder: 10 },
  { name: "Drill Back In", slug: "drill-back-in", sortOrder: 20 },
] as const;
