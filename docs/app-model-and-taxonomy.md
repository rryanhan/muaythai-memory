# App Model And Taxonomy

## Core Model

The main saved object is a Drill.

Training Methods, Core Ideas, Tags, Custom Tags, and Status markers help organize and display drills.

```txt
Training Methods + Core Idea + Tags + Custom Tags + Status -> Drill
```

The user-facing model should stay simple:

```txt
Training Method + Core Idea + Tags + Status -> Drill
```

## Drill

A Drill is the smallest concrete saved unit of Muay Thai training knowledge.

Examples:

- Jab-cross, slip right, step through to southpaw, left uppercut, exit.
- Check low kick, return cross, pivot off.
- Partner feeds jab, defender parries and counters with right kick.

Suggested fields:

- Title
- Summary
- Steps
- Notes
- Coach cues
- Training Methods
- Core Idea
- Tags
- Custom Tags
- Status
- Date created
- Last practiced

## Training Method

Training Method describes how or where a drill is practiced.

First-pass methods:

- Pad Work
- Bag Work
- Partner Drill
- Clinch
- Technical Work

Notes:

- Partner Drill means controlled work with another person.
- Sparring-specific work can be represented with tags or custom tags rather than a core training method.
- Clinch should be represented as a Training Method, not a standard Tag, to avoid duplicating method and tag meaning.
- Shadowboxing should be represented as a standard Tag, not a Training Method. It is a practice format that can apply to many kinds of drills.
- Technical Work means isolated technique practice, mechanics, motion rehearsal, stance work, balance work, slow reps, and solo motion practice that is not specifically pad work, bag work, partner drilling, or clinch.
- Warmup should not be a first-pass Muay Thai Training Method. Warmups belong more naturally in the future workout or conditioning system.

## Tags

Tags are predefined Muay Thai labels the app understands. In the first-pass data model these are stored as `trainingTags`, but the UI should usually call them Tags.

Tags are grouped for browsing, but the group names are not tags. For example, `Boxing` is a UI category that contains `Jab`, `Cross`, `Hook`, `Uppercut`, and `Body Shot`; the user should not end up with both `Boxing` and `Jab` attached to the same drill.

First-pass tag groups:

Boxing:
- Jab
- Cross
- Hook
- Uppercut
- Body Shot

Kicking:
- Teep
- Round Kick
- Low Kick

Knees:
- Knee

Elbows:
- Elbow

Defense:
- Kick Check
- Kick Catch
- Parry
- Long Guard

Head Movement:
- Slip
- Roll

Footwork:
- Pivot
- Switch Step
- Step Through
- Stance Switch

Clinch:
- Frame
- Hand Trap
- Hand Fighting
- Body Lock

Sweeps And Dumps:
- Sweep
- Dump

Movement & Timing:
- Entry
- Angle
- Distance
- Timing
- Pressure
- Feint

Practice Format:
- Shadowboxing

Tags should stay practical and filterable. Group labels help users browse, but only leaf tags should be saved to a drill.

Tag cleanup rules:

- Do not keep singular and plural versions of the same concept. Use `Sweep`, not both `Sweep` and `Sweeps`.
- Do not duplicate Core Ideas as Tags. For example, `Counter Rotation`, `Ring Cutting`, and `Frame To Knee` belong in Core Ideas, not Tags.
- Do not save group labels as tags. Use `Jab`, `Cross`, or `Hook`, not `Boxing`; use `Check` or `Parry`, not `Defense`.
- Do not create strike-specific entry tags when existing tags already cover the idea. Use `Entry` + `Elbow` instead of `Elbow Entry`; use `Entry` + `Knee` instead of `Knee Entry`.
- Do not create method tags. Use Training Method for `Pad Work`, `Bag Work`, `Partner Drill`, `Clinch`, and `Technical Work`.
- Prefer concrete leaf tags over broad family labels. Example: `Low Kick` + `Timing`, not `Kicking` + `Low Kick`.

## Core Idea

Core Idea is the main training pattern the drill is teaching, when one is clearly present.

Tags answer "what is involved in this drill?" Core Idea answers "what is this drill really about?"

Core Ideas should be standardized. The first-pass list should stay small enough to be usable as a real filter, not another loose tag pile.

First-pass Core Ideas:

- Range Finding
- Feint To Draw
- Jab To Enter
- Teep To Interrupt
- Hand Trap Entry
- Pressure Entry
- Slip To Counter
- Parry To Counter
- Check And Return
- Catch And Return
- Shell And Return
- Roll And Return
- Counter Rotation
- Exit After Scoring
- Angle After Strike
- Angle After Defense
- Ring Cutting
- Stance Switch Attack
- Open Stance Attack
- Rhythm Change
- Frame To Knee
- Inside Control
- Posture Break
- Turn To Attack
- Catch To Sweep

Rules:

- Core Idea is optional.
- A Drill should have one primary Core Idea only when the drill has a clear main idea.
- If the drill is just a useful sequence, general rep structure, bag round, pad combination, or note without a distinct concept, Core Idea should be empty.
- Core Idea should be chosen from the predefined app taxonomy first.
- AI can suggest a possible new Core Idea only when the user reviews the draft, but it should not silently create new Core Ideas.
- AI should leave Core Idea empty rather than inventing meaning.
- Core Idea should be visible on the drill detail when present and usable in search and filters.
- Core Idea can become an optional graph layer later, but it should not clutter the default method-first graph.

Example:

```json
{
  "title": "Jab Teep Feint To Shift Knee",
  "trainingMethods": ["Partner Drill", "Technical Work"],
  "trainingTags": ["Jab", "Teep", "Knee", "Entry", "Timing", "Stance Switch", "Feint"],
  "coreIdea": "Feint To Draw",
  "customTags": ["sparring-focus"]
}
```

No Core Idea example:

```json
{
  "title": "Jab Cross Rear Kick Pad Return",
  "trainingMethods": ["Pad Work"],
  "trainingTags": ["Jab", "Cross", "Round Kick", "Distance"],
  "coreIdea": null,
  "customTags": []
}
```

## Custom Tags

Users should be able to add personal tags.

Examples:

- coach-cue
- bad-habit
- to-ask-coach
- southpaw-problem
- favorite

Custom Tags should not replace standard Tags, but they give users flexibility.

Rules:

- AI should prefer standard Tags first.
- AI can suggest Custom Tags when no standard Tag fits well.
- Users can create Custom Tags manually.
- Users should eventually be able to merge or rename Custom Tags.
- Custom Tags can appear in search, filtering, and the graph.

## Status

Status markers are built-in labels that support common training behaviors. They are separate from tags because they drive workflows and visual states.

Status is not part of the MVP AI capture output. It can be added by the user after a drill is saved.

First-pass markers:

- Starred
- Drill Back In
- Focus
- Try in sparring
- Needs cleanup
- Archived

Status should affect how drills are displayed:

- Starred can show a star or favorites view.
- Drill Back In can power a review queue for drills the user wants to revisit soon.
- Focus can show a ring, glow, or active-focus view.
- Try in sparring can power a sparring-prep view.
- Needs cleanup can power an editing/review queue.
- Archived can hide drills by default.
