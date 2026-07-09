## Feature Folders

Feature folders hold user-facing product surfaces and their UI-specific helpers.

- `library/`: Training Log browsing, search, staged filters, and drill rows.
- `network/`: graph loading, graph controls, custom physics, and graph rendering.
- `drills/`: reusable drill detail content used by both pages and sheets.
- `profile/`: profile placeholder until profile data and journal uploads are real.

Keep backend/domain query code in `src/modules/*` and API DTO/fetch contracts in `src/data/*`.
