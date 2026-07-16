# Fullstack Implementation Approach

## Purpose

This document defines how we should turn the current wireframe into a scalable fullstack app without locking ourselves into brittle data decisions.

The product should feel:

- Fast on mobile.
- Smooth in the graph view.
- Easy to evolve as the taxonomy changes.
- Trustworthy when AI is involved.
- Modular enough to grow, but not over-engineered.

## Core Architecture Principle

```txt
Relational source of truth
Flexible taxonomy
Graph-specific read endpoints
Async AI
```

In plain language:

- Store real app data in a structured relational database.
- Keep tags and taxonomy as editable data, not hardcoded columns.
- Give the graph lightweight node/edge payloads instead of full drill records.
- Keep transcription and AI cleanup asynchronous from form editing so the app does not freeze.

## First Product Scope

Build the Muay Thai drill system first.

Do now:

- Users.
- Drill creation and editing.
- Training Methods.
- Standard Tags.
- Custom Tags.
- Status Tags.
- Library search/filter.
- Network graph data.
- Drill detail.

Do later:

- Workout/exercise backend.
- Training plans.
- Progress journal video uploads.
- Social/shared knowledge webs.

Active capture v1 uses ephemeral local Whisper transcription and editable AI cleanup drafts. Durable upload/job infrastructure remains deferred until production needs it.

Workouts already have a model, but they should not slow down the first backend pass.

## System Shape

```txt
Mobile Web App / PWA
  |
  | HTTP API
  |
Backend App
  |
  |-- Postgres
  |-- Object Storage
  |-- Job Queue
  |-- AI Worker
```

Start as a modular monolith.

That means:

- One backend app.
- One database.
- Clear internal modules.
- No microservices yet.

Microservices would add operational complexity before the product needs them.

## Backend Modules

Suggested backend module boundaries:

```txt
auth
users
taxonomy
drills
graph
capture
profile
```

### auth

Owns:

- Passwordless email magic-link sign in through Supabase Auth.
- Cookie-backed server sessions through `@supabase/ssr`.
- Verified current-user lookup and public app-user synchronization.
- Per-user authorization at every server query and mutation boundary.

The browser uses Supabase only for authentication. Drill, graph, taxonomy, and
capture data continue to flow through typed Next API routes and Drizzle.

Current authorization is enforced in those server modules by passing the
verified user id into every read and write. Row Level Security is deferred while
domain tables remain server-only, but must be added before any domain table is
queried directly from a browser or third-party client.

Supabase dashboard setup for magic links:

- Keep the Email provider enabled.
- Keep `{{ .ConfirmationURL }}` in the passwordless email template. The app
  intentionally does not ask users to enter an OTP code.
- Add the local, HTTPS tunnel, and production `/auth/confirm` URLs to the Auth
  redirect allow list.
- Use custom SMTP before inviting users outside the Supabase project team.

See `docs/authentication.md` for the callback and verification workflow.

Existing development data can be transferred after the target account signs in:

```bash
npm run db:claim-dev-user -- --email fighter@example.com --display-name "Fighter Name"
```

The command validates the Auth user with the service-role client and moves the
`Dev Fighter` drills and custom tags in one transaction.

### users

Owns:

- Profile.
- Avatar.
- Basic account info.

### taxonomy

Owns:

- Training Methods.
- Tag Categories.
- Standard Tags.
- Custom Tags.
- Status Tags.

Taxonomy must be data-driven. Changing tags should usually mean updating database rows, not changing schema.

### drills

Owns:

- Drill CRUD.
- Drill steps.
- Drill training methods.
- Drill tags.
- Drill status.

Drills are the core saved knowledge object.

### graph

Owns:

- Graph-ready node/edge payloads.
- Focused graph responses.
- Filtered graph responses.

The graph module should not own drill data. It reads from drills and taxonomy, then returns a lightweight graph representation.

### capture

Owns:

- Voice memo upload.
- Transcription jobs.
- AI cleanup drafts.
- Draft confirmation.

Capture should produce a draft. It should not silently create a saved drill until the user confirms it.

### profile

Owns:

- Starred drills.
- Drill Back In queue.
- Display name and profile avatar.
- Progress journal entries.
- Private training clip uploads.

Profile avatars use the public Supabase Storage bucket `profile-avatars`.
Uploads pass through the authenticated Next API so the service-role key never
reaches the browser. The API verifies JPEG, PNG, and WebP signatures, enforces a
5 MB limit, and stores versioned objects under the authenticated user id. The
public URL is stored in `users.avatar_url`; replacing or removing an avatar
cleans up superseded objects on a best-effort basis.

Journal video uses a private `journal-media` bucket with one-hour signed reads
and direct TUS resumable uploads. Upload intents are created by the authenticated
Next API, but video bytes travel directly from the browser to Supabase Storage.
Supabase Storage is the object store for both avatars and journal media; an AWS
S3 bucket is not required.

## Database Approach

Use Postgres as the source of truth.

Core Muay Thai tables:

```txt
users
drills
drill_steps
training_methods
drill_training_methods
tag_categories
tags
drill_tags
status_tags
drill_status_tags
journal_entries
journal_media
```

Later tables, only if durable capture history or background processing is introduced:

```txt
voice_memos
capture_jobs
ai_drafts
exercises
workout_types
exercise_tags
saved_pathways
```

## Schema Rules

### Avoid hardcoded tag columns

Do not model tags like this:

```txt
drills
- has_jab
- has_cross
- has_teep
- has_sweep
```

Model them like this:

```txt
tags
- id
- name
- category_id
- kind

drill_tags
- drill_id
- tag_id
```

This lets us rename, merge, hide, or add tags without schema churn.

### Keep status separate from tags

Status Tags should not be normal training tags.

Examples:

- Starred.
- Drill Back In.
- Needs Cleanup.
- Archived.

They control app states and profile sections, so they deserve their own table and join table.

### Keep Training Methods separate from tags

Training Methods answer where or how the drill is practiced.

Examples:

- Pad Work.
- Bag Work.
- Partner Drill.
- Clinch.
- Technical Work.

Tags answer what appears inside the drill.

Examples:

- Jab.
- Teep.
- Slip.
- Sweep.
- Feint.

## Frontend Architecture

Use product-domain modules, not tiny abstract component folders.

Suggested structure:

```txt
src/
  app/
    AppShell.tsx
    routes.tsx

  modules/
    network/
    library/
    capture/
    profile/
    taxonomy/
    drills/

  components/
    BottomNav.tsx
    BottomSheet.tsx
    IconButton.tsx
    SearchInput.tsx
    Chip.tsx
    SegmentedControl.tsx

  data/
    api.ts
    queries.ts
    cache.ts

  styles/
    tokens.css
    globals.css
```

## Frontend Module Rules

### drills

Reusable drill display and edit logic.

Use this from:

- Library.
- Network detail sheet.
- Profile.
- Search results.

### taxonomy

Reusable tag and method logic.

Use this from:

- Network filters.
- Library filters.
- Drill editor.
- Capture draft review.

### network

Owns graph rendering and graph interactions.

Keep graph physics/rendering separate from normal app state so performance problems stay isolated.

### capture

Owns voice memo and manual input flows.

Capture produces a draft. The drills module saves confirmed drills.

### profile

Composes user info, status drill collections, and progress journal.

Profile should reuse drill components instead of creating separate drill displays.

## Reuse Rules

Reuse components when they represent the same product concept.

Good reuse:

- `DrillDetail` from graph, library, profile, and search.
- `TagPicker` from network filters and library filters.
- `TrainingMethodBadge` wherever Training Methods appear.
- `DrillTagLine` in list rows and compact profile sections.
- `BottomSheet` for filters, drill detail, capture, and upload.

Avoid bad reuse:

- One monster `Card` component for every layout.
- One huge `FilterSheet` that handles every product area.
- Making workout exercises pretend to be drills just to reuse code.
- Mixing graph rendering into normal list components.

Rule:

```txt
Reuse domain pieces.
Keep workflows separate.
```

## API Strategy

Use simple HTTP endpoints first.

Suggested first endpoints:

```txt
GET    /api/me
GET    /api/taxonomy

GET    /api/drills
POST   /api/drills
GET    /api/drills/:id
PATCH  /api/drills/:id
DELETE /api/drills/:id

POST   /api/drills/:id/status
DELETE /api/drills/:id/status/:statusId

GET    /api/graph/muay-thai
GET    /api/graph/muay-thai?method=pad-work
GET    /api/graph/muay-thai?tag=uppercut
```

Active capture endpoints:

```txt
POST   /api/capture/transcribe
POST   /api/capture/draft
```

Later production job endpoints:

```txt
POST   /api/capture/audio
GET    /api/capture/jobs/:id
POST   /api/capture/jobs/:id/confirm

GET    /api/profile/status/starred
GET    /api/profile/status/drill-back-in
```

Active journal endpoints:

```txt
GET    /api/journal
POST   /api/journal/uploads
GET    /api/journal/:id
PATCH  /api/journal/:id
POST   /api/journal/:id/complete
DELETE /api/journal/:id
GET    /api/drills/:id/journal-preview
```

`GET /api/journal` accepts an optional owned `drillId` filter. Journal upload
state lives in a root client provider so one TUS upload can continue through
in-app navigation. Refresh-resumable files and concurrent upload queues remain
deferred. Full Drill pages load related media lazily to protect the primary Drill
and graph read paths.

## Graph Read Model

The graph should not fetch full drill records.

Return lightweight graph data:

```json
{
  "nodes": [
    {
      "id": "method:pad-work",
      "type": "trainingMethod",
      "label": "Pad Work",
      "iconKey": "pad-work"
    },
    {
      "id": "drill:123",
      "type": "drill",
      "label": "Slip Right Uppercut"
    }
  ],
  "edges": [
    {
      "from": "method:pad-work",
      "to": "drill:123",
      "type": "method"
    }
  ]
}
```

Open the full drill only when the user taps a drill node.

This keeps the graph fast and avoids overloading the client.

## Caching Strategy

Cache reads, not truth.

The database decides what is real. The cache makes the app feel instant.

### Frontend cache

Cache:

- Taxonomy.
- Training Method badges.
- Drill list summary.
- Graph payload.
- Recently opened drill details.
- AI capture drafts.

Use stale-while-revalidate:

```txt
Show cached data immediately
Fetch latest data in background
Update if changed
```

This matters because users may open the app at the gym, after training, or with weak signal.

### Backend cache

Start without Redis unless needed.

Add Redis later for:

- Expensive graph payloads.
- Job status lookup.
- Rate limiting.
- Session acceleration.

## AI Capture Flow

```txt
User records voice memo
  -> request-only audio is sent to local Whisper
  -> ephemeral transcript returns
  -> deterministic taxonomy is detected
  -> AI cleanup runs without blocking taxonomy editing
  -> user reviews and edits
  -> user saves a normal drill
```

Capture v1 stores:

- Final user-confirmed drill.

Capture v1 does not persist original audio, raw transcripts, or intermediate AI drafts. Durable capture artifacts and worker jobs are a later production decision.

AI should assist capture, not secretly mutate the user's knowledge base.

## Performance Rules

### App open

Load only:

- Current user.
- Taxonomy.
- Recent or cached drill summary.
- Cached graph summary.

Lazy-load:

- Full library.
- Full graph details.
- Drill detail records.
- Audio/video.
- Workout graph.

### Graph

For MVP, SVG or DOM-based rendering is acceptable.

As the graph grows, move toward canvas/WebGL rendering or a graph library that can handle many nodes smoothly.

Graph performance rules:

- Keep graph payloads lightweight.
- Do not render every optional layer by default.
- Do not load full drill details into every node.
- Compute expensive graph layouts carefully.
- Preserve enough context when filtering so the graph remains understandable.

### Mobile UI

Mobile interaction should stay immediate.

Use optimistic updates for:

- Starred.
- Drill Back In.
- Tag add/remove.
- Status add/remove.

If a save fails, revert and show a clear message.

## Implementation Phases

### Phase 1: Muay Thai Backend Foundation

- Pick stack.
- Create database schema.
- Seed taxonomy.
- Seed sample drills.
- Add drill CRUD.
- Add tag/status relationships.
- Add graph endpoint.

### Phase 2: Frontend Integration

- Replace local JSON with API calls.
- Add loading and error states.
- Add frontend caching.
- Preserve current wireframe behavior.
- Keep graph, library, and profile using shared drill/taxonomy components.

### Phase 3: Capture

- Add browser recording.
- Add request-only local transcription.
- Add deterministic taxonomy detection.
- Add editable AI cleanup.
- Add draft review and normal drill save.
- Defer durable audio uploads and capture jobs.

### Phase 4: Profile And Journal

- Build Profile overview and profile editing.
- Persist the public profile avatar in Supabase Storage.
- Show Starred and Drill Back In collections and Training Method totals.
- Add progress journal entries.
- Add optional linked drill.
- Add private, signed, resumable video uploads.

### Phase 5: Workouts

- Add workout schema.
- Add exercise graph.
- Add saved pathways.
- Add bridge view later if useful.

## Current Product Decisions To Preserve

- Training Methods are graph anchors.
- Tags are concrete and visual where possible.
- Core Idea is parked, not active MVP UI.
- Status Tags are separate from normal Tags.
- Custom Tags are hidden from graph by default.
- Shadowboxing is a Tag, not a Training Method.
- Clinch is a Training Method, not a Tag.
- Sweeps currently only need the `Sweep` tag.
- Workouts are parallel to drills.
- Workout circuits/groupings are saved pathways, not graph nodes.

## Product Design Rule

Before adding a UI element, answer:

1. What user problem does it solve?
2. What action or state does it control?
3. Would a normal mobile user understand it without explanation?
4. If it does not clearly help, remove it.

This app should stay useful after training, when the user is tired and trying not to forget what they learned.
