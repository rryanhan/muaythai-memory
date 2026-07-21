# Production Deployment

The production application is hosted at:

`https://muaythai-memory.vercel.app`

It uses the `muaythai-memory` Vercel project and the isolated Supabase project
`pbzqwvowkpfhxptvmrny`. It must never use staging Supabase credentials.

## Release Checklist

1. Apply and verify migrations on staging.
2. Smoke-test the staging application.
3. Verify `.env.production-maintenance.local` with
   `npm run env:verify:production`. This name intentionally prevents Next.js
   from loading production credentials during ordinary local builds.
4. Apply the same committed migrations with:

   ```bash
   npm run db:migrate:production -- --confirm-production
   ```

5. Verify production taxonomy:

   ```bash
   APP_ENV_FILE=.env.production-maintenance.local npm run db:verify-taxonomy
   ```

6. Deploy the verified commit to the `muaythai-memory` Vercel project.
7. Smoke-test sign-in, Library, Network, Profile, Capture, and journal uploads.

## Runtime Variables

Production Vercel stores only runtime values, including the Supabase public and
service keys, transaction-pooler URL, OpenAI configuration, and canonical app
origin. It does not store `DATABASE_DIRECT_URL`; that credential is reserved for
explicit migration commands.

The production database starts with schema and shared taxonomy only. Never run
the development drill seed or copy staging Auth users, drills, or journal media
into production.
