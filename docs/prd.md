# Product Requirements

> **Current-state note:** This document combines implemented requirements with
> longer-term product direction. The production app currently includes Network,
> Training Log, Profile, request-scoped voice or typed capture, private Progress
> Journal video, Connections, and explicit reciprocal-follow Drill sharing.
> Training Plans and production Workout or Bridge graphs remain deferred; the
> workout modes exist only in the static wireframe prototype.

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

1. User records a voice memo after training or enters a typed note. Audio-file
   upload is not part of Capture v1.
2. For voice capture, the configured transcription provider converts the memo
   to text. Typed notes skip transcription.
3. AI cleans the typed note or transcript into a readable drill entry.
4. AI suggests categorization:
   - Training Method
   - Active standard Tags
5. User reviews and edits the generated drill.
6. User saves the drill.
7. Drill appears in both the Network View and the Training Log.
8. User can browse, search, save to lists, tag, open, and edit drills. Training
   Plan grouping remains deferred.

## Core Features

### Voice Capture

Users can record a voice memo describing a drill, training detail, coach cue, or sequence they learned.

The app should support messy, natural speech. Users should not need to speak in a formal template.

Capture should be a persistent action, not a main navigation view.

The main navigation should have three primary views:

- Network
- Training Log
- Profile

The capture control should be accessible from Network and Training Log.

Preferred interaction:

- Tap the mic button to open Capture, then tap Record to start a voice memo.
- Choose Type Instead for typed capture.

Hold-and-swipe entry remains a deferred gesture enhancement.

### AI Cleanup

AI should extract:

- A clear drill title.
- A cleaned summary.
- Step-by-step instructions.
- Suggested Training Methods.
- Suggested active standard Tags.

### Drill Review

Before saving, users can edit:

- Title
- Summary
- Steps
- Notes
- Training Method
- Tags
- Existing owner-scoped Custom Tags
- Saved Lists

### Knowledge Graph

The Network View should show how drills connect to broader categories.

The static wireframe explores multiple graph modes:

- Skill Graph: Training Methods -> Drills.
- Workout Graph: Workout Types -> Exercises / Movements.
- Bridge Graph: Exercises / Movements -> Muay Thai relevance, Tags, or Core Ideas.

Workout groupings such as circuits, strength sets, warmups, finishers, or training blocks should be saved pathways through exercise nodes, not standalone graph nodes.

Only the Skill Graph is implemented in the production app. Workout and Bridge
graphs currently use static prototype data and have no production schema or API.

The default Network View should be method-first:

```txt
Training Methods -> Drill
```

Training Method nodes should be visually prominent. Drills should connect directly to their training methods.

Tags, Custom Tags, and Saved Lists are available as optional layers or filters,
not always-on graph nodes. This prevents the graph from becoming too dense.

Optional graph layers:

- Show Tags.
- Show Custom Tags.
- Show Saved Lists.
- Hide Tags.
- Hide Custom Tags.
- Hide Saved Lists.

Saved Lists usually affect views, filters, and visual treatment and remain
hidden as graph nodes by default.

Clicking a node in the Network View should open the relevant information:

- Drill node: opens the drill detail page or panel.
- Training Method node: opens a filtered view of drills in that method.

Tag, Custom Tag, and Saved List nodes are currently visual context only.
Activating them as filter shortcuts remains a deferred interaction.

### Drill States

The app should support two Saved Lists for drills the user cares about:

- Favourite
- Drill Back In

These remain separate from custom tags because they power persistent collection views.

### Training Plans

Training Plans are a deferred direction for grouping drills into a practice
session; there is no current Training Plan schema or UI.

This is not a general fitness workout system. It is a way to turn saved Muay Thai knowledge into something the user can practice.

### Training Log

The Training Log is the conventional organized view for managing the knowledge base.

This view should support:

- Searching drills.
- Filtering by Training Method.
- Filtering by Tags.
- Filtering by Custom Tags.
- Filtering by Saved Lists.
- Opening and editing drill details.

The Network View is for spatial memory, discovery, and seeing relationships. The Training Log is for clarity, management, and fast retrieval.

## Success Criteria

- A user can capture a drill from voice in under one minute.
- AI categorization is useful enough that the user mostly edits, rather than starts from scratch.
- The graph helps the user see focus areas and neglected areas.
- The app helps users convert saved drills into future training.
