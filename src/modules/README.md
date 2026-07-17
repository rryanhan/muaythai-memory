# Modules

The fullstack app is organized by product domain.

These folders are internal boundaries inside one modular monolith. They are not separate services.

- `auth`: sign in, sessions, current user.
- `users`: profile and account records.
- `taxonomy`: Training Methods, Tags, Tag Categories, Status Tags.
- `drills`: saved drill content and drill relationships.
- `graph`: graph-ready read models.
- `profile`: Favourite, Drill Back In, and profile collections.
- `capture`: voice memo and AI draft flow later.

Reuse modules when they represent the same product concept. Keep workflows separate.
