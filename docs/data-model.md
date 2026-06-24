# Data Model

## MVP Entities

The MVP should keep the core model small.

```txt
Training Methods + Core Idea + Tags + Custom Tags -> Drill
```

Status and Training Plans are useful product concepts, but they do not need to be part of the initial AI capture output. Saved drills can still have user-set Status markers after capture.

## Drill

A Drill is the main saved object.

Required MVP fields:

- `id`
- `title`
- `summary`
- `steps`
- `trainingMethods`
- `trainingTags`
- `customTags`
- `createdAt`
- `updatedAt`

Optional MVP fields:

- `coreIdea`
- `status`

Optional later fields:

- `notes`
- `lastPracticedAt`
- `practiceCount`
- `sourceTranscript`
- `trainingPlanIds`

## Training Method

Training Method describes how or where a drill is practiced.

First-pass methods:

- Pad Work
- Bag Work
- Partner Drill
- Clinch
- Technical Work

These should be graph anchors by default.

Sparring-specific work should not be a first-pass Training Method. For now, sparring intent can be represented through standard Tags or Custom Tags such as `sparring-focus`.

Shadowboxing should not be a first-pass Training Method. Store it as a standard Tag because it is a practice format that can apply to many different drills.

Warmup should not be a first-pass Training Method. It belongs in the later workout, conditioning, or preparation system. For Muay Thai memory capture, use Technical Work for isolated mechanics, technical motions, slow reps, stance transitions, balance drills, solo motion practice, and other technique-first practice that does not fit the other methods.

## Tag

Tags are predefined Muay Thai labels the app understands. The current data field is `trainingTags`, but the UI should usually say Tags.

Tags are organized under browse categories, but only the leaf tags should be stored. Category names such as `Boxing`, `Kicking`, `Defense`, and `Footwork` are not saved as tags because they overlap with more useful leaf tags.

First-pass tag groups:

- Boxing: `Jab`, `Cross`, `Hook`, `Uppercut`, `Body Shot`
- Kicking: `Teep`, `Round Kick`, `Low Kick`
- Knees: `Knee`
- Elbows: `Elbow`
- Defense: `Check`, `Catch`, `Parry`, `Shell`, `Long Guard`
- Head Movement: `Slip`, `Roll`
- Footwork: `Pivot`, `Switch Step`, `Step Through`, `Stance Switch`
- Clinch: `Frame`, `Hand Trap`, `Hand Fighting`, `Body Lock`
- Sweeps And Dumps: `Sweep`, `Dump`
- Training Qualities: `Entries`, `Exits`, `Angles`, `Distance`, `Timing`, `Balance`, `Pressure`, `Rhythm`
- Practice Format: `Shadowboxing`

Tags should be optional graph nodes. They should be visible through filters, search, and optional graph layers.

## Core Idea

Core Idea is an optional single primary training pattern attached to a Drill.

It is more intentional than a broad Tag, but less free-form than a Custom Tag. It should capture the main training pattern the user should remember only when the drill has a clear main idea.

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

Example:

```json
{
  "trainingTags": ["Jab", "Teep", "Knee", "Entries"],
  "coreIdea": "Feint To Draw"
}
```

First-pass storage:

- `coreIdea`: string or `null`

Use `null` when a drill is just a sequence, general rep structure, bag round, pad combination, or note without a distinct concept.

Possible later storage:

- `coreIdeaId`
- `secondaryCoreIdeas`
- `coreIdeaConfidence`

Core Idea should be searchable and filterable. It can be an optional graph layer, but the default graph should remain method-first.

## Status

Status markers are user-set workflow labels. They are separate from Custom Tags because they drive common app states and collection views.

First-pass Status markers:

- `Starred`
- `Drill Back In`
- `Focus`
- `Try in sparring`
- `Needs cleanup`
- `Archived`

First-pass storage:

- `status`: array of strings

Status should not be generated as part of the default AI capture output. The user can add or remove Status after a Drill is saved.

## Custom Tag

Custom Tags are user-created or AI-suggested tags that do not fit the standard taxonomy.

Examples:

- southpaw-transition
- coach-cue
- anti-reach
- sparring-focus

Custom Tags should be searchable and filterable. They should be hidden from the graph by default unless the user turns on the Custom Tags layer.

## Network View Data

The default Network View should show:

```txt
Training Method -> Drill
```

Optional layers:

- Tags
- Core Ideas
- Custom Tags
- Status
- Training Plans

This keeps the first graph readable while still allowing deeper relationship views.

## Physical Prep Model

Workouts are a parallel system to Muay Thai skill memory.

They should not replace Drills, Training Methods, or Tags. They should connect to skill knowledge through support relationships.

The current workout model is defined in [Workout Model](workout-model.md). The key decision is that grouped workouts, circuits, and training blocks are saved pathways, not graph nodes.

First-pass entities:

- Exercise
- Saved Pathway
- Workout Type
- Physical Quality
- Equipment
- Body Area
- Muay Thai Relevance

Exercise fields:

- `id`
- `title`
- `summary`
- `workoutTypes`
- `equipment`
- `physicalQualities`
- `bodyAreas`
- `muayThaiRelevance`
- `aliases`
- `cues`

Saved Pathway fields:

- `id`
- `title`
- `kind`
- `summary`
- `exerciseIds`
- `structure`
- `goal`
- `notes`

Graph relationships:

```txt
Workout Type -> Exercise
Exercise -> Physical Quality
Exercise -> Equipment
Exercise -> Body Area
Exercise -> Muay Thai Relevance
Exercise -> Exercise -> Exercise
```

The final line represents saved pathways. A circuit or grouped workout should be shown as a highlighted route through exercise nodes, not as its own node.
