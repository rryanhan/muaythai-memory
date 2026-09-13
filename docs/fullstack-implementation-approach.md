# Fullstack Implementation Approach

## Purpose

This document records the current fullstack architecture and the remaining
directions carried forward from the original wireframe plan.

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

## Current Product Scope

Implemented now:

- Authentication, profile onboarding, and first-drill guidance.
- Drill creation, editing, detail, and Saved Lists.
- Training Methods, standard Tags, and owner-scoped Custom Tags.
- Training Log search and filtering.
- Network graph data and optional Tag, Custom Tag, and Saved List layers.
- Request-scoped voice transcription and editable AI cleanup drafts.
- Profile editing, public avatars, and private Progress Journal video uploads.
- Directed Connections and explicit read-only Drill sharing with reciprocal
  accepted follows.

Deferred:

- Workout/exercise backend and production Workout or Bridge graphs.
- Training Plans.
- Durable capture audio, background capture jobs, and AI workers.
- Shared Journal entries, a generic social feed, and shared knowledge graphs.

Capture v1 keeps audio and transcripts ephemeral. Local development can use a
private Whisper server while hosted environments use OpenAI transcription.

Workouts already have a model, but they should not slow down the first backend pass.

## System Shape

```txt
Mobile Web App / PWA
  |-- Supabase Auth
  |-- direct TUS journal-video upload --> Supabase Storage
  |
  `-- Next.js pages and typed HTTP API
        |-- Postgres
        |-- Supabase Storage administration and signed reads
        `-- request-scoped local Whisper, Ollama, or OpenAI providers
```

There is no capture job queue or AI worker in the current runtime. Those remain
options only if durable capture processing becomes necessary.

Start as a modular monolith.

That means:

- One backend app.
- One database.
- Clear internal modules.
- No microservices yet.

Microservices would add operational complexity before the product needs them.

## Backend Modules

Current backend module boundaries:

```txt
auth
capture
connections
drills
graph
journal
media
onboarding
profile
sharing
taxonomy
```

`src/modules/README.md` is the concise source of truth for these boundaries.

### auth

Owns:

- Google OAuth and confirmed email/password sign in through Supabase Auth.
- Cookie-backed server sessions through `@supabase/ssr`.
- Verified current-user lookup and public app-user synchronization.
- Per-user authorization at every server query and mutation boundary.

The browser uses Supabase directly for authentication and signed TUS Journal
video uploads. Drill, graph, taxonomy, capture, Journal metadata, and signed-read
authorization continue to flow through typed Next API routes and Drizzle.

Current authorization is enforced in those server modules by passing the
verified user id into every read and write. Domain tables remain server-only:
the `anon` and `authenticated` database roles have no privileges on public
tables, sequences, functions, or procedures, including through recursive role
membership and the `postgres` role's default privileges. Row Level Security is
also enabled on every public domain table with no browser-facing policies.
Server-side Drizzle queries continue through the database owner; any future
public table migration must explicitly enable RLS. Run
`npm run db:verify-access-control -- --expect=staging` after staging migrations
to verify both boundaries. Explicit ownership policies must be designed before
any domain table is queried directly from a browser or third-party client.

Supabase dashboard setup for authentication:

- Keep the Email provider and email confirmation enabled.
- Set the password minimum to at least eight characters.
- Keep `{{ .ConfirmationURL }}` in signup-confirmation and password-recovery
  templates.
- Configure Google OAuth independently for staging and production.
- Add the local, HTTPS tunnel, and production `/auth/confirm` URLs to the Auth
  redirect allow list.
- Use custom SMTP before inviting users outside the Supabase project team.
- Configure a unique server-only `AUTH_FLOW_SECRET` in every deployment
  environment for signed recovery intents, grants, and keyed password
  fingerprints.
- Apply the `auth_recovery_grants` migration before deploying recovery
  hardening, then run `npm run auth:verify-recovery-grants` against the target
  database.

See `docs/authentication.md` for the callback and verification workflow.

Existing development data can be transferred after the target account signs in:

```bash
npm run db:claim-dev-user -- --email fighter@example.com --display-name "Fighter Name"
```

The command validates the Auth user with the service-role client and moves the
`Dev Fighter` drills and custom tags in one transaction.

### User data (shared ownership)

User data spans auth, onboarding, profile, and connections rather than a
standalone `users` module. Together they own:

- Profile.
- Avatar.
- Basic account info.
- Username and private name/location fields.
- Profile and first-drill onboarding state.

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

- Request-only voice transcription.
- AI cleanup drafts.
- Database-backed capture quotas.

Capture produces an ephemeral draft. The drills module saves it only after the
user reviews and submits the normal Drill form.

### profile

Owns:

- Favourite drills.
- Drill Back In queue.
- Display name and profile avatar.
- Profile and Training Method totals.

Profile avatars use the public Supabase Storage bucket `profile-avatars`.
Uploads pass through the authenticated Next API so the service-role key never
reaches the browser. The API verifies JPEG, PNG, and WebP signatures, enforces a
5 MB limit, and stores versioned objects under the authenticated user id. The
Profile editor crops the selected image to a square 1024px WebP before upload.
The public URL is stored in `users.avatar_url`; replacing or removing an avatar
cleans up superseded objects on a best-effort basis.

### journal

Owns private Progress Journal entries, signed media reads, resumable video
upload intents, poster images, and abandoned-upload cleanup.

Journal video uses a private `journal-media` bucket with one-hour signed reads
and direct TUS resumable uploads. Upload intents are created by the authenticated
Next API, but video bytes travel directly from the browser to Supabase Storage.
The browser generates a versioned poster image before completion; ready entries
created by the current upload flow always have a poster. Legacy ready entries
without one can be repaired with `npm run journal:backfill-posters` on a machine
with `ffmpeg` installed.
Supabase Storage is the object store for both avatars and journal media; an AWS
S3 bucket is not required.

### connections

Owns:

- Exact-username discovery plus copied profile links and QR invites.
- Directed follow requests with independent approval and sender cancellation.
- Cursor-paginated follower, following, request, and block lists.
- Unfollow, directional blocking, and a basic report path.
- Database-backed search, follow, and report limits plus an outgoing-request cap.
- Public follower/following counts and reciprocal-follow training totals.

Public identity fields are limited to username and avatar. Discovery responses
also include viewer-relative relationship state, and fighter profiles include
public follower/following counts. Email, private names, location, Journal
metadata, and graph data remain inaccessible. Accepted reciprocal follows
additionally receive aggregate Drill and Training Method counts.
Individual Drills stay private unless their owner creates a `drill_shares`
grant; those responses omit Saved Lists and Journal media and are revoked on
unfollow or block. A future connections-only Journal option must separately
authorize every metadata and signed-media request.

### sharing

Owns explicit, read-only sharing of individual Drills with reciprocal accepted
follows. Sharing never exposes Saved Lists, Journal media, or the owner's full
Training Log.

## Database Approach

Use Postgres as the source of truth.

Core Muay Thai tables:

```txt
users
auth_recovery_grants
follows
user_blocks
friend_reports
friend_rate_limits
capture_rate_limits
training_methods
tag_categories
tags
status_tags
drills
drill_creation_keys
drill_steps
drill_training_methods
drill_tags
drill_status_tags
drill_shares
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

### Keep Saved Lists separate from tags

Saved Lists (`status_tags` in the schema) should not be normal training tags.

Examples:

- Favourite (`starred` backend slug).
- Drill Back In.

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

Use product-domain modules, not tiny abstract component folders. The current
high-level structure is:

```txt
src/
  app/         Next App Router pages, layouts, and API route handlers
  components/  cross-feature app, navigation, provider, and shared UI
  config/      runtime configuration and product limits
  data/        typed browser API clients and DTO exports
  db/          Drizzle schema, client, seeds, and database verifiers
  features/    user-facing UI grouped by product surface
  lib/         framework and Supabase integration helpers
  modules/     server-side domain contracts, queries, and mutations
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

Owns voice memo and typed-note AI capture flows.

Capture produces a draft. The drills module saves confirmed drills.

### profile

Composes user info, Saved List collections, and Progress Journal.

Profile should reuse drill components instead of creating separate drill displays.

## Reuse Rules

Reuse components when they represent the same product concept.

Good reuse:

- `DrillDetailContent` across owned and shared routes and the Network detail
  sheet.
- `SavedListActions` across the owned Drill route and Network detail sheet.
- `badgeByIconKey` across forms, Training Log, Network, Profile, and fighter
  profiles.
- `SheetLoadingFallback` for lazily loaded Training Log and Network sheets.

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

The app uses typed Next route handlers. Current-user loading for the main app is
server-side rather than a `GET /api/me` request. Representative active
endpoints are:

```text
GET    /api/taxonomy

GET    /api/drills
POST   /api/drills
GET    /api/drills/:id
PATCH  /api/drills/:id
DELETE /api/drills/:id
PATCH  /api/drills/:id/saved-lists

GET    /api/graph
GET    /api/graph?method=pad-work
GET    /api/graph?tag=uppercut

GET    /api/profile/overview
PATCH  /api/profile
```

Active capture endpoints:

```text
POST   /api/capture/transcribe
POST   /api/capture/draft
```

Possible later capture-job endpoints, only if durable processing is introduced:

```text
POST   /api/capture/audio
GET    /api/capture/jobs/:id
POST   /api/capture/jobs/:id/confirm
```

Active journal endpoints:

```text
GET    /api/journal
POST   /api/journal/uploads
GET    /api/journal/:id
PATCH  /api/journal/:id
POST   /api/journal/:id/upload-token
POST   /api/journal/:id/poster
POST   /api/journal/:id/complete
DELETE /api/journal/:id
GET    /api/drills/:id/journal-preview
```

Connections and sharing use the handlers under `/api/connections`,
`/api/follows`, `/api/follow-requests`, `/api/fighters`,
`/api/drills/:id/shares`, and `/api/shared-drills`. The route files under
`src/app/api` are the authoritative inventory.

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

### Frontend state and cache

TanStack Query currently caches:

- Taxonomy.
- Training Log Drill-list responses.

Training Method badges are static, preloaded assets. Network graph payloads and
opened Drill details currently use surface-local state and fetch on demand.

Use stale-while-revalidate:

```txt
Show cached data immediately
Fetch latest data in background
Update if changed
```

This matters because users may open the app at the gym, after training, or with weak signal.

### Backend cache

Start without Redis unless needed.

Consider Redis later only if scale requires it, for:

- Expensive graph payloads.
- Future durable-job status lookup.
- High-volume rate limiting if the current Postgres counters become a
  bottleneck.
- Session acceleration.

## AI Capture Flow

```txt
User records voice memo
  -> request-only audio is sent to the configured local Whisper or hosted OpenAI provider
  -> ephemeral transcript returns
  -> AI generates text and selects active taxonomy values in one structured response
  -> user taxonomy edits remain protected while AI runs
  -> user reviews and edits
  -> user saves a normal drill
```

Capture v1 stores:

- Final user-confirmed drill.

Capture v1 does not persist original audio, raw transcripts, or intermediate AI drafts. Durable capture artifacts and worker jobs are a later production decision.

AI should assist capture, not secretly mutate the user's knowledge base.

## Performance Rules

### Route loading

Load only the current route's required data and shared user shell. Keep
off-route surfaces, Drill details, media, and future Workout graph data lazy.

The exact query mix differs by route; avoid turning this guidance into one
global preload list.

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

- Favourite.
- Drill Back In.
- Tag add/remove.
- Saved List add/remove.

If a save fails, revert and show a clear message.

## Implementation Phases

Phases 1 through 5 describe implemented product slices. Phase 6 remains
deferred; the static wireframe is not a production workout backend.

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
- Add request-only transcription through configurable local or hosted providers.
- Add schema-constrained AI taxonomy selection.
- Add edit-safe AI cleanup.
- Add draft review and normal drill save.
- Defer durable audio uploads and capture jobs.

### Phase 4: Profile And Journal

- Build Profile overview and profile editing.
- Persist the public profile avatar in Supabase Storage.
- Show Favourite and Drill Back In collections and Training Method totals.
- Add progress journal entries.
- Add optional linked drill.
- Add private, signed, resumable video uploads.

### Phase 5: Connections

- Add exact-username discovery, profile links, and QR invites.
- Add directed follow requests, sender cancellation, acceptance, unfollowing, blocking, reports,
  and unblock management.
- Add cursor pagination, rate limits, and an outgoing-request cap.
- Expose compact training totals only to reciprocal accepted follows.
- Add explicit, read-only sharing for individual Drills.
- Keep Journal entries and graph data private; do not add a generic feed.

### Phase 6: Workouts

- Add workout schema.
- Add exercise graph.
- Add saved pathways.
- Add bridge view later if useful.

## Current Product Decisions To Preserve

- Training Methods are graph anchors.
- Tags are concrete and visual where possible.
- Core Idea is parked, not active MVP UI.
- Saved Lists (`status_tags` in the schema) are separate from normal Tags.
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
