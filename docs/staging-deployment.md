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
- `DATABASE_POOLER_URL`
- `DATABASE_POOL_MAX=1`
- `NEXT_PUBLIC_APP_URL=https://muaythai-memory-staging.vercel.app`
- `CAPTURE_DRAFT_PROVIDER=openai`
- `OPENAI_API_KEY`
- `OPENAI_CAPTURE_MODEL`

Use Supabase's transaction pooler on port `6543` for
`DATABASE_POOLER_URL`. The Postgres client disables prepared statements for
compatibility with transaction pooling.

Do not add `DATABASE_DIRECT_URL` to the Vercel runtime. Keep it in `.env.local`
or protected CI secrets and use it only for Drizzle migrations. The direct
connection normally uses port `5432`; `DATABASE_URL` remains a temporary local
fallback for older environments.

Verify connection roles without printing credentials:

```bash
npm run db:verify-config
```

Run migrations before deploying application code:

```bash
npm run env:verify:staging
npm run db:migrate:staging
APP_ENV_FILE=.env.staging.local npm run db:verify-taxonomy
```

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
