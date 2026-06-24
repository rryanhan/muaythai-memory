# Graph And Training Plans

## Graph Purpose

The Network View should help users see their personal Muay Thai knowledge base as a connected map.

It should answer:

- What have I been training?
- What areas am I focusing on?
- Which drills connect to which skills?
- Which drills could be grouped into a future training plan?
- What have I neglected?

The product should also have a more conventional Organized View for searching, filtering, opening, and editing saved drills. The Network View is not the only way to use the app.

## Graph Structure

The default graph should be based on:

```txt
Training Methods -> Drill
```

A single drill can connect directly to multiple Training Methods.

Example:

```txt
Partner Drill ----------------\
Pad Work ---------------------- Slip Right Step-Through Uppercut
```

This keeps the first view readable and gives users clear anchor nodes.

Tags, Core Ideas, Custom Tags, and Status should be optional graph layers. They are useful, but they should not all appear by default.

Optional expanded graph:

```txt
Partner Drill ----------------\
Pad Work ----------------------\
Counter Rotation --------------\
Uppercut ----------------------- Slip Right Step-Through Uppercut
Slip --------------------------/
southpaw-transition ----------/
Focus ------------------------/
```

This avoids forcing every tag and status marker into the graph at once.

## Visual Rules

First-pass visual ideas:

- Largest nodes: Training Methods.
- Drill nodes: saved drill entries, connected directly to relevant training methods by default.
- Tag nodes: optional layer.
- Core Idea nodes: optional layer.
- Custom Tag nodes: optional layer.
- Status nodes: optional layer, hidden by default.
- Brightness: frequency or recency of use.
- Line thickness: uniform for now.
- Special colored lines: drills grouped into a Training Plan.
- Status: affects filters and drill-node styling by default.

The graph should feel alive but not arbitrary. Avoid visual rules that imply data the app does not actually have.

## Node Interaction

Clicking a node should open the information behind that node.

- Drill node: opens the full drill details, including summary, steps, notes, primary training method badge, core idea, tags, status, and related plans.
- Training Method node: focuses the graph on drills connected to that method. Connected nodes and edges stay bright while unrelated nodes dim. Tapping the same method, tapping the background, or clearing the focus chip returns to the full graph.
- Tag node, when visible: opens a filtered view of drills connected to that tag.
- Core Idea node, when visible: opens a filtered view of drills connected to that idea.
- Custom Tag node, when visible: opens a filtered view of drills connected to that custom tag.
- Status node, when visible: opens a filtered view of drills with that status.

The graph should not be purely decorative. Every visible node should be usable as a navigation point.

## Views

Potential Network View modes:

- Method View: emphasizes Pad Work, Bag Work, Partner Drill, Clinch, and Technical Work.
- Tag View: emphasizes concrete Tags such as Jab, Teep, Slip, Pivot, Frame, and Balance. Broad labels such as Boxing or Footwork are browse groups, not stored tags.
- Core Idea View: emphasizes the main patterns drills teach, such as Feint To Draw, Counter Rotation, Exit After Scoring, and Catch To Sweep.
- Focus View: emphasizes starred, active, frequently accessed, or recently practiced drills.
- Plan View: shows drills grouped into a Training Plan.

Current graph-mode direction:

- Skill Graph: the default Muay Thai memory map. Shows Training Methods connected to Drill nodes.
- Workout Graph: a parallel physical-prep map. Shows Workout Type anchors connected to Exercise / Movement nodes.
- Bridge Graph: shows how Exercise / Movement nodes support Muay Thai Tags, Core Ideas, or fight-relevant categories. This is where overlap belongs, rather than making workout material normal drill nodes.

Workout Graph should stay Muay Thai-oriented. It can include lifting, but the emphasis should be plyometrics, rotational power, full-body explosiveness, conditioning, durability, grip, and other fight-relevant physical qualities.

Grouped workouts, circuits, strength sets, and training blocks should not appear as normal graph nodes. They are saved pathways through exercise nodes.

Example workout pathway:

```txt
Uppercut Power Circuit

Med Ball Rotational Throw -> Landmine Punch Press -> Plyo Push-Up -> Hollow Hold
```

Selecting a saved pathway should dim unrelated nodes, brighten the included Exercise / Movement nodes, and draw a unique colored route between them.

The default Skill Graph and the Workout Graph should remain separate unless the user intentionally chooses Bridge Graph.

## Graph Filters

The Network View should have clear toggles for graph layers.

The exact filter set needs a later pass. For now, filters should stay intentionally limited.

Suggested toggles:

- Training Methods
- Drills
- Tags
- Core Ideas
- Custom Tags
- Status
- Training Plans

Default state:

- Training Methods: on
- Drills: on
- Tags: off
- Core Ideas: off
- Custom Tags: off
- Status: off
- Training Plans: off unless viewing a plan

This lets the graph move between a clean context map and a denser relationship map.

## Network View Controls

The Network View should use a graph-first layout with a vertical action rail on the bottom right.

Action rail:

- Top: Network Controls.
- Middle: Search.
- Bottom: Capture.

Network Controls opens layer and filter settings for the graph.

Search searches by keyword across drill title, summary, context, tags, and core idea. Tapping the search icon opens an inline curved search input extending from the icon. Typing previews matching nodes live. Tapping the search icon again with text in the input commits that keyword as an active search filter and retracts the input. Tapping it again with an empty input creates no filter and retracts the input. Multiple search keywords can be active at once, and the search icon should change color while the inline input is open or committed search filters exist. Search results should show matching nodes plus enough connected nodes to preserve context.

Capture opens the voice memo flow by default. Holding the capture icon should reveal a manual-input option, and swiping up to that icon should open manual entry.

When search, focus, or filters are active, the graph should show dismissible active-state chips such as `Search: uppercut`, `Tags on`, or `Focus: Pad Work`.

Training Methods should have distinctive icons. They are the core graph anchors and filter logic, so they should feel more memorable than plain text labels. The first pass can use Phosphor icons, with custom logo marks explored later.

## Organized View

The Organized View should present the same knowledge base in a more conventional structure.

Possible layouts:

- Drill list.
- Expandable index spine for Training Methods.
- Tag filter for standard Tags and Custom Tags.

This view is important because the graph will be useful for discovery and pattern recognition, but users also need a fast way to find, edit, and manage specific drills.

## Training Plans

A Training Plan is a user-created group of drills to practice in a session.

This is not the same as a general workout. It is Muay Thai-specific.

Example plan:

1. Technical work: shadowbox the slip right step-through uppercut.
2. Bag work: jab-cross-slip-counter sequence.
3. Partner drill: feeder throws jab-cross, defender slips and counters.
4. Technical work: slow reps of the step-through and exit path.
5. Partner drill focus: look for the slip-right entry once per round.

Possible names:

- Training Plan
- Session Plan
- Practice Set
- Drill Set

Current preference: Training Plan or Session Plan.

Training Plans and drill chaining should come later. The first version should focus on capture, organization, search, drill detail, and Network View exploration.
