# Application Environments

The application uses isolated staging and production stacks. They share code
and migrations, but never users, drills, journal media, Auth sessions, or
Storage objects.

| Environment | Vercel project | Supabase project | Purpose |
| --- | --- | --- | --- |
| Staging | `muaythai-memory-staging` | `seiroxntlvyudgvseyss` | Development and acceptance testing |
| Production | `muaythai-memory` | `pbzqwvowkpfhxptvmrny` | Real users and durable data |

## Local Environment Files

Hosted environment credentials stay in ignored files:

- `.env.staging.local`
- `.env.production-maintenance.local`

Never copy staging credentials into the production file. Each file must set
`DEPLOYMENT_ENVIRONMENT` and contain public Supabase values, the server-only
service key, a port `6543` runtime pooler URL, and a port `5432` direct migration
URL for the same Supabase project.

Verify the files without printing secrets:

```bash
npm run env:verify:staging
npm run env:verify:production
```

The verifier rejects mixed Supabase project references and non-HTTPS hosted
origins.

## Database Releases

Apply every migration to staging first:

```bash
npm run db:migrate:staging
APP_ENV_FILE=.env.staging.local npm run db:verify-taxonomy
```

After the staging application passes smoke testing, apply the same committed
migrations to production. Production requires a second explicit flag:

```bash
npm run db:migrate:production -- --confirm-production
APP_ENV_FILE=.env.production-maintenance.local npm run db:verify-taxonomy
```

Run `npm run db:seed` once when provisioning a blank hosted project to create
the shared Training Methods, Tags, and Saved Lists. Never run
`npm run db:seed-drills` against production.

## Storage And Authentication

Run the idempotent Storage setup once per Supabase project:

```bash
APP_ENV_FILE=.env.staging.local npm run storage:setup
APP_ENV_FILE=.env.production-maintenance.local npm run storage:setup
```

Configure Auth independently in both Supabase projects. Staging callbacks must
use the staging host and production callbacks must use the production host.
SMTP credentials also belong to each Supabase project and are not copied by
database migrations.

Google OAuth client credentials are also environment-specific. Enable and test
Google on staging before copying the approved provider setup to production.

Production uses:

- Site URL: `https://muaythai-memory.vercel.app`
- Redirect URL: `https://muaythai-memory.vercel.app/auth/confirm`

Custom SMTP still requires its provider password to be entered separately in
the production Supabase project; Supabase does not reveal a saved staging SMTP
password for copying.

## Release Boundary

Staging is disposable and may contain seed data. Production starts empty except
for shared taxonomy. Schema changes are committed as Drizzle migrations, tested
on staging, and then applied unchanged to production before the corresponding
application deployment.
