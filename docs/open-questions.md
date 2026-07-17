# Open Questions

## Naming

- Should grouped drills be called Training Plans, Session Plans, Practice Sets, or Drill Sets?
- Should the internal field stay `trainingTags` while the UI simply says Tags?

## Taxonomy

- How granular should standard Tags become before the app feels too textbook-like?
- Which tags must be part of the first standard taxonomy?
- What custom-tag controls are needed early: create, rename, merge, hide?

Resolved for now:

- Technical Work should be a Training Method for isolated mechanics, technique-first motions, stance transitions, balance drills, and slow reps.
- Warmup should not be a Muay Thai Training Method in the MVP. It belongs in the future workout, conditioning, or preparation system.
- The broadest category is called Training Method.
- Core Idea is now the product language for the main training pattern attached to a drill.
- Core Idea should be optional. Use one primary Core Idea only when a drill has a clear main idea; leave it empty when forcing one would feel fake.
- The first-pass Core Idea taxonomy is capped at 25 ideas: Range Finding, Feint To Draw, Jab To Enter, Teep To Interrupt, Hand Trap Entry, Pressure Entry, Slip To Counter, Parry To Counter, Check And Return, Catch And Return, Shell And Return, Roll And Return, Counter Rotation, Exit After Scoring, Angle After Strike, Angle After Defense, Ring Cutting, Stance Switch Attack, Open Stance Attack, Rhythm Change, Frame To Knee, Inside Control, Posture Break, Turn To Attack, Catch To Sweep.
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

## Later Systems

- Workout and strength training should become a parallel system later, not part of the MVP.
- Future social features could let users view or share parts of each other's knowledge graph.
- Need to decide whether sharing is public, friend-based, coach-student, or gym/team-based.
