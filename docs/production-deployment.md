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
4. Choose the production order from the migration's compatibility:
   - For an additive, backward-compatible migration, migrate and verify before
     deploying its application consumer.
   - For a destructive contract migration, first deploy and smoke-test the
     compatible application commit, confirm that no older deployment is still
     receiving traffic, and only then migrate with separate explicit approval.
5. At the migration step, apply the same committed migration with:

   ```bash
   npm run db:migrate:production -- --confirm-production
   ```

6. Verify production taxonomy and database access control:

   ```bash
   APP_ENV_FILE=.env.production-maintenance.local npm run db:verify-taxonomy
   npm run db:verify-access-control -- --expect=production
   ```

7. Deploy the verified commit to the `muaythai-memory` Vercel project if the
   compatibility order did not require deploying it before step 5.
8. Smoke-test sign-in, Library, Network, Profile, Capture, and journal uploads.

For the directed-follows contract, run the phase verifier immediately before
and after its production migration:

```bash
APP_ENV_FILE=.env.production-maintenance.local npm run follows:contract:verify -- --expect=expand
npm run db:migrate:production -- --confirm-production
APP_ENV_FILE=.env.production-maintenance.local npm run follows:contract:verify -- --expect=contract
```

## Runtime Variables

Production Vercel stores only runtime values, including the Supabase public and
service keys, transaction-pooler URL, OpenAI configuration, and canonical app
origin. It does not store `DATABASE_DIRECT_URL`; that credential is reserved for
explicit migration commands.

The production database starts with schema and shared taxonomy only. Never run
the development drill seed or copy staging Auth users, drills, or journal media
into production.
