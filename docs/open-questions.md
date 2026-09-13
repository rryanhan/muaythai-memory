# Open Questions

## Naming

- Should grouped drills be called Training Plans, Session Plans, Practice Sets, or Drill Sets?

Resolved: the UI says Tags; Drill writes use `tagSlugs`, and reads return `tags`
plus `customTags`. `trainingTags` remains only in older sample-data shapes.

## Taxonomy

- How granular should standard Tags become before the app feels too textbook-like?
- Which tags must be part of the first standard taxonomy?
- What custom-tag controls are needed early: create, rename, merge, hide?

Resolved for now:

- Technical Work should be a Training Method for isolated mechanics, technique-first motions, stance transitions, balance drills, and slow reps.
- Warmup should not be a Muay Thai Training Method in the MVP. It belongs in the future workout, conditioning, or preparation system.
- The broadest category is called Training Method.
- Core Idea is parked. It is absent from the current schema, API, capture output,
  search, graph, and UI; `docs/app-model-and-taxonomy.md` preserves the earlier
  exploration.
- Clinch is a Training Method, not a standard Tag.

## Voice And AI

- Should users be able to save raw transcripts alongside cleaned drill entries?
- Should AI ask follow-up questions when the voice memo is unclear?
- How much should AI infer versus leaving fields blank?

## Graph

- Should drill nodes be visually small because training methods are the largest nodes, or should important drills become visually prominent?
- Should brightness mean frequency, recency, or a combined activity score?
- Should the graph show all drills by default, or start filtered to recent/focus items?
- Should Custom Tags look visually different from standard Tags?

## Review And Memory Loop

- Does Drill Back In need scheduling or reminders beyond its current saved collection?
- Should future training plans remain separate from Saved Lists?

## Current Connections Decisions

- Follows are directed, username-based, and require approval. Follower and
  following counts are visible to signed-in users; private training totals
  require accepted follows in both directions.
- Individual Drills may be shared explicitly and read-only with reciprocal
  accepted follows. Saved Lists, Journal media, and graph data do not travel with a
  shared Drill.
- Do not build a generic social feed. Sharing should solve a concrete training
  exchange before adding passive social content.
- Knowledge graphs remain private.

## Later Systems

- Workout and strength training should become a parallel system later, not part of the MVP.
- Decide whether a later shared Journal feed should be connections-only or also
  support explicit coach-student and gym/team circles.
