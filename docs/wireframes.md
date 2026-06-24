# Wireframes

## Main Navigation

The app has three main views:

- Network
- Organized View
- Profile

Capture is not a main navigation item. It is a persistent action available from the main working views.

## Design Direction

Wireframes should use the first-pass visual direction from `docs/visual-direction.md`:

- Light training-lab theme.
- IBM Plex Sans.
- Warm off-white and graphite base.
- Red-orange primary accent.
- Muted teal secondary accent.
- Restrained, utilitarian UI.

TasteSkill may be used as a design-quality rubric when generating the local HTML/CSS/React wireframe, but the wireframe should remain focused on interaction and layout rather than final polish.

## Network View

The Network View is the main graph page.

Low-fidelity layout:

```txt
┌──────────────────────────────────────┐
│                                      │
│  Active chips, if any:               │
│  [Search: uppercut x] [Tags on x]    │
│                                      │
│                                      │
│           full-screen graph          │
│                                      │
│                                      │
│                             ┌──────┐ │
│                             │ ⚙    │ │
│                             │ 🔍   │ │
│                             │ 🎙   │ │
│                             └──────┘ │
└──────────────────────────────────────┘
```

### Action Rail

The Network View has a vertical three-icon action rail on the bottom right.

Top icon: Network Controls

- Opens graph settings and filters.
- Controls graph layers such as Tags, Core Ideas, Custom Tags, Status, and Training Plans.
- Controls filters such as Focus-only or Starred-only.

Middle icon: Search

- Opens an inline curved search input extending left from the search button.
- Searches by keyword across drill title, summary, context, tags, and core idea.
- While typing, the graph previews matching nodes live.
- Tapping the search button with text in the inline input commits that keyword as an active search filter and retracts the input.
- Tapping the search button with an empty input should retract the input without creating a filter.
- Multiple search keywords can be active at the same time.
- When the inline search is open or search filters are active, the search icon changes color.
- Live preview should not use orange relationship lines unless the relationship belongs to an active focus or committed filter state.
- Search results should show matching nodes plus enough connected context to remain meaningful.

Bottom icon: Capture

- Tap mic to record a voice memo.
- Hold mic to reveal manual input.
- Hold and swipe up to manual-input icon to open manual entry.

### Active State

When search, focus, or filters are active, the page should show visible state.

Examples:

- `Focus: Bag Work (3)`
- `Search: uppercut`
- `Tags on`
- `Focus only`
- `Custom Tags on`

These can appear as small dismissible chips near the top-left of the graph.

### Node Behavior

Clicking a node opens useful information.

- Drill node: opens drill detail.
- Training Method node: focuses the graph on that method. Connected drills and edges stay bright while unrelated nodes dim. Tapping the same method, the background, or the focus chip clears focus.
- Tag node, when visible: opens drills with that tag.
- Custom Tag node, when visible: opens drills with that custom tag.
- Status node, when visible: opens drills with that status.

### Drill Detail Sheet

The detail sheet should keep context visually separate from tags.

- Show the drill's primary Training Method as a small training method badge icon to the left of the drill title.
- Do not repeat Training Methods as tag chips.
- If `coreIdea` is present, show it as the first chip in the tag area with stronger weight and accent color.
- Then show standard Tags and Custom Tags as regular chips.

## Network Controls Panel

Low-fidelity panel:

```txt
┌─────────────────────────┐
│ Network Controls        │
│                         │
│ Layers                  │
│ [x] Training Methods    │
│ [x] Drills              │
│ [ ] Tags                │
│ [ ] Core Ideas          │
│ [ ] Custom Tags         │
│ [ ] Status              │
│ [ ] Training Plans      │
│                         │
│ Filters                 │
│ [ ] Starred only        │
│ [ ] Focus only          │
│ [ ] Try in sparring     │
│ [ ] Needs cleanup       │
│                         │
│ [Reset view]            │
└─────────────────────────┘
```

Exact filters still need refinement.

Filters are an intentional revisit item. The first version should include only the controls needed to test the Network View without overbuilding the filtering system.

## Organized View

The Organized View is the conventional library for finding and opening drills.

Low-fidelity layout:

```txt
┌──────────────────────────────────────┐
│ Search drills...                     │
│                                      │
│ All | Pad Work | Bag Work | Partner  │
│ Clinch | Technical                   │
│                                      │
│ [Filter by tags]                     │
│                                      │
│ Slip Right Step-Through Uppercut     │
│ Partner Drill · Pad Work             │
│ Slip · Uppercut · Step Through       │
│                                      │
│ Jab Cross Rear Kick Pad Return       │
│ Pad Work                             │
│ Cross · Round Kick · Balance         │
└──────────────────────────────────────┘
```

### Context Index

Training Methods are shown through an expandable index spine from the left edge of the Organized View. When collapsed, it should be a discreet vertical orange handle. When expanded, it should reveal training method badge icons, method names, and an Add Drill action.

Segments:

- All
- Pad Work
- Bag Work
- Partner Drill
- Clinch
- Technical Work

The user can tap or swipe from the left edge to reveal the index. Selecting a context filters the drill list and closes the index.

Each Training Method should have a distinctive icon. These icons appear in the index, the Organized View header, and graph method nodes.

### Tag Filter

For now, the Organized View should support searching by keyword and filtering by tags.

Tag filtering can include:

- Standard Tags
- Custom Tags

Status filters and more advanced filters can come later.

### Drill List

Each drill row should show:

- Title
- Training Methods
- A few visible tags

Tapping a drill opens the drill detail.

## Drill Chaining

Chaining drills into a Training Plan should come later.

The first version should focus on:

- Capture
- Organize
- Browse/search
- Open drill details
- Explore the Network View

The data model should remain flexible enough to support Training Plans later, but the first UI does not need a full plan builder.

## Search Interaction

Low-fidelity flow:

```txt
Tap search icon
↓
Curved inline search input extends from search icon
↓
Type query
↓
Graph previews matching keyword results live
↓
Tap search icon with text in input
↓
Graph filters to matching nodes plus immediate connected nodes
↓
Search icon changes color
↓
Active search chip appears
```

Tapping the active search chip `x` clears the search.

If the search input is empty and the user taps the search icon again, no search filter is created.

## Capture Interaction

Low-fidelity flow:

```txt
Tap mic
↓
Record voice memo
↓
AI capture creates draft drill
↓
Review title, summary, steps, trainingMethods, trainingTags, coreIdea, customTags
↓
Save drill
```

Manual input flow:

```txt
Hold mic
↓
Manual input icon appears above mic
↓
Swipe up while holding
↓
Manual entry opens
↓
User fills same fields as AI capture draft
```
