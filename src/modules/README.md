# Modules

The fullstack app is organized by product domain.

These folders are internal boundaries inside one modular monolith. They are not separate services.

- `auth`: sign in, sessions, current-user records, and onboarding guards.
- `capture`: voice memo, transcription, and AI-assisted drill drafts.
- `connections`: fighter discovery, follows, blocks, and reports.
- `drills`: saved drill content and drill relationships.
- `graph`: graph-ready drill read models.
- `journal`: training-video uploads and journal entries.
- `media`: signed media access and storage helpers.
- `onboarding`: profile setup and first-drill guidance.
- `profile`: public profile data and saved drill collections.
- `sharing`: mutual-connection drill sharing.
- `taxonomy`: Training Methods, Tags, Tag Categories, and Status Tags.

Reuse modules when they represent the same product concept. Keep workflows separate.
