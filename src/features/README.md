## Feature Folders

Feature folders hold user-facing product surfaces and their UI-specific helpers.

- `auth/`: sign-in, password recovery, and sign-out surfaces.
- `capture/`: recorded or typed capture, transcription state, and editable AI drafts.
- `connections/`: discovery, follows, blocks, reports, invites, fighter profiles, and Drill sharing UI.
- `drills/`: reusable Drill forms and detail content used by pages and sheets.
- `journal/`: private video upload, cover selection, playback, editing, and Drill previews.
- `library/`: Training Log browsing, search, staged filters, and drill rows.
- `media/`: shared client-side media preparation, focus, and discard helpers.
- `network/`: graph loading, graph controls, custom physics, and graph rendering.
- `onboarding/`: profile setup and guided first-Drill capture.
- `profile/`: profile overview/editing, avatars, Saved List collections, training totals, and Progress Journal composition.
- `shared/`: UI state and components shared across product features.

Keep backend/domain query code in `src/modules/*` and API DTO/fetch contracts in `src/data/*`.
