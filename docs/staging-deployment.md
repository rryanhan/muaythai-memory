# Staging Deployment

The stable staging app is deployed to:

`https://muaythai-memory-staging.vercel.app`

## Vercel

The local repository is linked to the `muaythai-memory-staging` Vercel project.
Production environment variables are configured in Vercel; secret values stay
out of the repository.

This Vercel project's `Production` target is the stable staging environment. It
must only use the staging Supabase project documented in
[`environments.md`](./environments.md). The separate `muaythai-memory` Vercel
project is reserved for real production traffic.

Deploy the current checkout with:

```bash
npx vercel@latest --prod --yes
```

Required production variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AUTH_FLOW_SECRET`
- `DATABASE_POOLER_URL`
- `DATABASE_POOL_MAX=1`
- `NEXT_PUBLIC_APP_URL=https://muaythai-memory-staging.vercel.app`
- `CAPTURE_DRAFT_PROVIDER=openai`
- `OPENAI_API_KEY`
- `OPENAI_CAPTURE_MODEL`

Set `AUTH_FLOW_SECRET` independently in both the Preview and Production scopes
of the staging Vercel project. Do not copy the staging value into the separate
production Vercel project.

Use Supabase's transaction pooler on port `6543` for
`DATABASE_POOLER_URL`. The Postgres client disables prepared statements for
compatibility with transaction pooling.

Do not add `DATABASE_DIRECT_URL` to the Vercel runtime. Keep it in the ignored
maintenance environment file or protected CI secrets and use it only for
Drizzle migrations. It may use either the direct database host or Supabase's
session pooler; both use port `5432`. Prefer the session pooler when the local
network cannot reach Supabase's IPv6 direct host. `DATABASE_URL` remains a
temporary local fallback for older environments.

Verify the target and connection roles before every release without printing
credentials:

```bash
npm run env:verify:staging
npm run db:verify-config
```

Additive, backward-compatible migrations may run before the application deploy.
Contract migrations that remove an old table, column, trigger, or accepted
value reverse that order: first deploy and smoke-test application code that no
longer uses the legacy contract, then verify that no older deployment is still
receiving traffic, and only then run the migration with explicit approval.

For the directed-follows contract migration, the staging sequence after the
compatible application is live is:

```bash
APP_ENV_FILE=.env.staging.local npm run follows:contract:verify -- --expect=expand
npm run db:migrate:staging
APP_ENV_FILE=.env.staging.local npm run follows:contract:verify -- --expect=contract
APP_ENV_FILE=.env.staging.local npm run db:verify-taxonomy
npm run db:verify-access-control -- --expect=staging
```

The environment-aware migration command derives a port `5432` session-pooler
connection from `DATABASE_POOLER_URL`. This keeps migrations reachable on
networks without direct-host IPv6 while leaving the port `6543` application
connection unchanged.

## Supabase Auth

Add this exact URL to the Supabase Auth redirect allow list:

`https://muaythai-memory-staging.vercel.app/auth/confirm`

The staging root can be used as the Supabase Site URL while staging is the main
host. Keep the local callback URL in the allow list for local development.

## Capture

Hosted text cleanup and voice transcription use OpenAI. Local Ollama and
whisper.cpp addresses are not reachable from Vercel. Configure staging with
`CAPTURE_TRANSCRIPTION_PROVIDER=openai` and
`OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe`; both capture operations use
the server-only `OPENAI_API_KEY`.
