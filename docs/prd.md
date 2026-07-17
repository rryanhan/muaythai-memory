# Product Requirements

## Goal

Build an MVP for capturing and organizing Muay Thai drills through voice-first input, AI cleanup, structured categorization, and a visual knowledge graph.

## Primary User

A Muay Thai student or serious hobbyist who learns drills, techniques, and coach cues during training and wants a low-friction way to preserve and reuse them.

## MVP Scope

The first version focuses only on Muay Thai training knowledge.

Workout tracking, strength programming, circuits, and general fitness planning were intentionally out of scope for the first Muay Thai memory MVP. The current wireframe now includes an experimental graph-only parallel system for Muay Thai-oriented physical prep. It should not be folded into the drill library by default.

Physical prep should emphasize Muay Thai-relevant qualities:

- Explosiveness
- Rotational power
- Hip drive
- Footwork
- Grip
- Shoulder endurance
- Anaerobic capacity
- Durability

Warmups and conditioning-style preparation should also live in that later parallel workout system. The Muay Thai MVP should focus on drill and technique memory; isolated mechanics, shadowboxing, or motion practice should be captured under Technical Work, with `Shadowboxing` as a Tag when useful.

## Core User Flow

1. User records or uploads a voice memo after training.
2. AI transcribes the memo.
3. AI cleans the transcript into a readable drill entry.
4. AI suggests categorization:
   - Training Method
   - Tags
   - Core Idea
   - Custom Tags when useful
5. User reviews and edits the generated drill.
6. User saves the drill.
7. Drill appears in both the Network View and the Organized View.
8. User can browse, search, star, tag, open, edit, and group drills into future training plans.

## Core Features

### Voice Capture

Users can record a voice memo describing a drill, training detail, coach cue, or sequence they learned.

The app should support messy, natural speech. Users should not need to speak in a formal template.

Capture should be a persistent action, not a main navigation view.

The main navigation should have three primary views:

- Network
- Organized View
- Profile

The capture control should be accessible from Network and Organized View.

Preferred interaction:

- Tap the mic button to start a voice memo.
- Hold the mic button to reveal an alternate manual-input icon.
- While holding, swipe up to the manual-input icon to open manual entry.

This keeps voice capture as the default path while still making manual entry available without adding another main nav item.

### AI Cleanup

AI should extract:

- A clear drill title.
- A cleaned summary.
- Step-by-step instructions.
- Suggested Training Methods.
- Suggested Tags.
- Suggested Core Idea.
- Suggested Custom Tags when no standard tag fits well.

### Drill Review

Before saving, users can edit:

- Title
- Summary
- Steps
- Notes
- Training Method
- Tags
- Core Idea
- Custom Tags

### Knowledge Graph

The Network View should show how drills connect to broader categories.

The Network View can support multiple graph modes:

- Skill Graph: Training Methods -> Drills.
- Workout Graph: Workout Types -> Exercises / Movements.
- Bridge Graph: Exercises / Movements -> Muay Thai relevance, Tags, or Core Ideas.

Workout groupings such as circuits, strength sets, warmups, finishers, or training blocks should be saved pathways through exercise nodes, not standalone graph nodes.

The default Network View should be method-first:

```txt
Training Methods -> Drill
```

Training Method nodes should be visually prominent. Drills should connect directly to their training methods.

Tags, Core Ideas, Custom Tags, and Status should be available as optional layers or filters, not always-on graph nodes. This prevents the graph from becoming too dense.

Optional graph layers:

- Show Tags.
- Show Core Ideas.
- Show Custom Tags.
- Show Status.
- Hide Tags.
- Hide Core Ideas.
- Hide Custom Tags.
- Hide Status.

Status should usually affect views, filters, and visual treatment rather than appearing as normal graph nodes by default.

Clicking a node in the Network View should open the relevant information:

- Drill node: opens the drill detail page or panel.
- Training Method node: opens a filtered view of drills in that method.
- Tag node, when visible: opens a filtered view of drills using that tag.
- Core Idea node, when visible: opens a filtered view of drills using that idea.
- Custom Tag node, when visible: opens a filtered view of drills using that custom tag.

### Drill States

The app should support two Saved Lists for drills the user cares about:

- Favourite
- Drill Back In

These remain separate from custom tags because they power persistent collection views.

### Training Plans

Users should be able to group drills into a future training plan or practice set.

This is not a general fitness workout system. It is a way to turn saved Muay Thai knowledge into something the user can practice.

### Organized View

The app also needs a conventional organized view for managing the knowledge base.

This view should support:

- Searching drills.
- Filtering by Training Method.
- Filtering by Tags.
- Filtering by Custom Tags.
- Filtering by Status.
- Opening and editing drill details.
- Creating and managing Training Plans.

The Network View is for spatial memory, discovery, and seeing relationships. The Organized View is for clarity, management, and fast retrieval.

## Success Criteria

- A user can capture a drill from voice in under one minute.
- AI categorization is useful enough that the user mostly edits, rather than starts from scratch.
- The graph helps the user see focus areas and neglected areas.
- The app helps users convert saved drills into future training.
