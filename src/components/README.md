## Shared Components

This folder is for app-wide components that are not owned by one product surface.

- `app/`: root app shell layout.
- `navigation/`: bottom navigation used by the app shell and standalone routes.
- `providers/`: client providers such as TanStack Query.
- `shared/`: tiny shared maps/utilities used by multiple features.

If a component only exists for Network, Library, Profile, or Drill Details, put it under `src/features/*`.
