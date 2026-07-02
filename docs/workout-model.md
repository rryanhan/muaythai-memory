# Workout Model

## Purpose

The workout system is a parallel map for Muay Thai-oriented physical prep.

It should help the user remember useful exercises, understand what each exercise trains, and connect exercises into circuits or grouped workouts without turning those groupings into graph nodes.

This system should not become a generic fitness tracker. It should stay tied to fight-relevant qualities such as explosiveness, rotational power, footwork, grip, clinch strength, hip drive, shoulder endurance, balance, conditioning, and durability.

## Clean Graph Model

The workout graph should mirror the Muay Thai graph, but with workout-specific language.

```txt
Workout Type -> Exercise / Movement
```

Workout Type is the largest node, parallel to Training Method in the Muay Thai graph.

Exercise / Movement is the smallest saved node, parallel to Drill in the Muay Thai graph.

Grouped workouts, circuits, strength sets, and training blocks are not nodes. They are saved pathways that connect Exercise / Movement nodes.

## Node Types

### Workout Type Node

Workout Type describes the broad kind of physical work an exercise belongs to.

First-pass Workout Types:

- Strength
- Plyometrics
- Conditioning
- Mobility & Stretching
- Isometrics
- Core & Stability

These should be the largest visual anchors in the workout graph.

Workout Type nodes should use a consistent SVG badge system parallel to the Muay Thai Training Method badges:

- Same hex frame.
- Same off-white badge fill.
- Same red-orange border.
- Same graphite stroke.
- Muted teal only as a small accent.
- One simple object or symbol per type.
- No bodies, tiny anatomy, dense hatching, or complex exercise diagrams.

First-pass icon concepts:

- Strength: dumbbell.
- Plyometrics: jump arc.
- Conditioning: timer or pulse.
- Mobility & Stretching: mobility arc or stretch path.
- Isometrics: hold/pause/opposing-force mark.
- Core & Stability: target or balance mark.

### Exercise / Movement Node

Exercise / Movement is the smallest saved workout item.

Examples:

- Landmine Punch Press
- Med Ball Rotational Throw
- Lateral Bound And Stick
- Band-Resisted Knee Drive
- Towel Grip Row
- Copenhagen Plank
- Jump Rope Sprint Round

The UI can use whichever label feels more natural later, but the model should avoid calling this smallest unit a full workout. A workout usually sounds like a grouped session, while this object is one movement or exercise.

## Optional Viewable Tag Nodes

These can be shown as optional layers or used in filters.

They should not all be visible by default, because the graph will get messy.

### Physical Quality

What the exercise develops.

Examples:

- Explosive Power
- Rotational Power
- Elasticity
- Strength
- Strength Endurance
- Conditioning
- Mobility
- Stability
- Isometric Strength

### Equipment

What the user needs.

Examples:

- Bodyweight
- Band
- Medicine Ball
- Kettlebell
- Dumbbell
- Barbell
- Landmine
- Sled
- Jump Rope

### Body Area

What area is emphasized.

Examples:

- Full Body
- Core
- Hips
- Legs
- Shoulders
- Back
- Grip
- Ankles / Calves

### Muay Thai Relevance

What fight action or training problem the exercise supports.

Examples:

- Punching
- Kicking
- Knees
- Elbows
- Clinch
- Footwork
- Guard
- Balance
- Defense

## Saved Pathways

Grouped workouts are saved pathways across Exercise / Movement nodes.

They should appear as search results, active filter chips, or highlighted routes, not as graph nodes.

Example:

```txt
Uppercut Power Circuit

1. Med Ball Rotational Throw
2. Landmine Punch Press
3. Plyo Push-Up
4. Hollow Hold
```

When the user selects `Uppercut Power Circuit`, the graph should:

- Dim unrelated nodes.
- Brighten the included Exercise / Movement nodes.
- Draw a unique colored pathway through the selected exercises.
- Optionally show order numbers on the route.
- Show `Uppercut Power Circuit` as an active chip, not as a node.

## Connection Rules

Default graph:

```txt
Workout Type -> Exercise / Movement
```

Optional layers:

```txt
Exercise / Movement -> Physical Quality
Exercise / Movement -> Equipment
Exercise / Movement -> Body Area
Exercise / Movement -> Muay Thai Relevance
```

Saved pathway overlay:

```txt
Exercise / Movement -> Exercise / Movement -> Exercise / Movement
```

## Workout Graph Filters

Workout graph filtering should parallel the Muay Thai Skill Graph.

Default graph:

- Workout Type nodes are visible.
- Exercise / Movement nodes are visible.
- Workout tag nodes are hidden.

Focus behavior:

- Tapping a Workout Type node focuses the graph on connected exercises.
- Connected exercises and edges stay bright.
- Unrelated nodes dim.
- The focus appears as a removable chip, such as `Focus: Strength (4)`.

Workout tag filter:

- Tags are grouped by Physical Quality, Equipment, Body Area, and Muay Thai Relevance.
- Selecting multiple workout tags should use AND logic.
- Example: `Bodyweight` + `Explosive Power` shows exercises that contain both tags.
- Active tags appear as removable chips.

Workout tag layer:

- Turning on workout tag nodes should show optional tag anchors connected to exercises.
- To avoid clutter, the default visible tag layer should stay sparse.
- Active selected tags should always appear as tag nodes when the workout tag layer or tag filter is active.

Search behavior:

- Search should match exercise titles, summaries, aliases, cues, workout types, physical qualities, equipment, body areas, and Muay Thai relevance.
- Search should also match saved pathway titles.
- If a saved pathway matches, the graph should highlight the exercise route as a pathway overlay.

## Naming Guidance

Exercise names should not have to carry the whole memory. The system should use names, tags, and visuals together.

Preferred naming formula:

```txt
Equipment + Movement + Modifier
```

Examples:

- Landmine Punch Press
- Band-Resisted Knee Drive
- Med Ball Rotational Throw
- Lateral Bound And Stick
- Towel Grip Row

If there is no equipment:

```txt
Movement + Modifier
```

Examples:

- Plyo Push-Up
- Split Squat Jump
- Copenhagen Plank
- Bear Crawl Shoulder Tap

If the exercise is very Muay Thai-specific:

```txt
Fight Action + Training Style
```

Examples:

- Kick Return Balance Drill
- Knee Drive Band Pull
- Footwork Sprint Reset
- Guard Endurance Hold

Users should be allowed to enter rough names. AI can suggest a cleaner title, aliases, and tags.

## Capture Fields

Exercise / Movement:

- `id`
- `title`
- `summary`
- `workoutTypes`
- `physicalQualities`
- `equipment`
- `bodyAreas`
- `muayThaiRelevance`
- `aliases`
- `cues`
- `thumbnail` or `video` later

Saved pathway:

- `id`
- `title`
- `kind`
- `summary`
- `exerciseIds`
- `structure`
- `goal`
- `notes`

`kind` describes the grouping format, such as Circuit, Strength Set, Conditioning Round, Warmup, or Finisher. It belongs to the saved pathway, not the individual Exercise / Movement node.

## Visual Principle

The workout graph should be visual-first where possible.

Names help, tags find, visuals confirm.

The first pass can use simple icons, colors, and detail sheets. Later versions can add thumbnails, uploaded clips, or generated visual references for exercises.
