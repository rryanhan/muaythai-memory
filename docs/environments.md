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
service key, a unique server-only `AUTH_FLOW_SECRET`, a port `6543` runtime
pooler URL, and a port `5432` direct or session-pooler migration URL for the
same Supabase project. Use the session pooler when the maintenance machine
cannot reach Supabase's IPv6 direct database host.

Verify the files without printing secrets:

```bash
npm run env:verify:staging
npm run env:verify:production
```

The verifier rejects mixed or unexpected Supabase project references and
non-HTTPS hosted origins; staging and production must match the fixed projects
listed above.

## Local PostgreSQL Integration Tests

The real PostgreSQL suites require a disposable local database named
`muaythai_pr6_test` (an underscore suffix such as `_ci` is also allowed). They
reject non-PostgreSQL URLs, non-loopback hosts, and unrelated database names
before modifying fixtures. Export its URL under the generic variable and run
the full suite:

```bash
export POSTGRES_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/muaythai_pr6_test
npm run test:postgres
```

`JOURNAL_TEST_DATABASE_URL` remains supported as a legacy fallback so existing
local setups continue to work, but new configuration should use
`POSTGRES_TEST_DATABASE_URL`. The test setup also pins `DATABASE_POOLER_URL` to
the same validated URL before application modules load, so an unrelated
`.env.local` database cannot receive integration-test fixture traffic.

## Database Releases

Apply every migration to staging first. Additive, backward-compatible
migrations run before their application consumer. Destructive contract
migrations run only after compatible application code is live, smoke-tested,
and all older deployments have been removed from traffic. Run these commands at
the migration point required by that release order:

```bash
npm run db:migrate:staging
APP_ENV_FILE=.env.staging.local npm run db:verify-taxonomy
```

The environment-aware migration commands use Supabase session mode on port
`5432`, derived in memory from the matching transaction-pooler URL. No derived
credential is written to disk or sent to Vercel.

Canonical Supabase database connections require encrypted transport. The
runtime and migration configuration add `sslmode=require` when the URL omits it
and reject plaintext-capable SSL modes. Local and non-Supabase PostgreSQL URLs
are left unchanged.

After the staging application and schema pass smoke testing, release the same
commit to production with the same compatibility order. Production requires a
second explicit flag at its migration step:

```bash
npm run db:migrate:production -- --confirm-production
APP_ENV_FILE=.env.production-maintenance.local npm run db:verify-taxonomy
```

Verify the server-only database boundary after migrating either environment:

```bash
npm run db:verify-access-control -- --expect=staging
npm run db:verify-access-control -- --expect=production
```

The verifier connects through `DATABASE_POOLER_URL`, confirms that every
expected public domain table exists, requires RLS on every public table,
rejects effective table, column, sequence, function, or procedure access for
Supabase's `anon` and `authenticated` roles, checks inherited role privileges
and the `postgres` migration role's future-object defaults, and performs
harmless reads through the application database connection. `--expect` selects
the matching ignored environment file and validates its deployment marker,
Supabase project, and database hosts before connecting. File values override
conflicting ambient variables inside an isolated configuration object, and
missing file credentials never fall back to ambient secrets; credentials are
neither exported nor printed. Use
`--env-file=<path>` only when intentionally verifying a non-default file.

Run `npm run db:seed` once when provisioning a blank hosted project to create
the shared Training Methods, Tags, and Saved Lists. Never run
`npm run db:seed-drills` against production.

## Journal Media Maintenance

The abandoned-upload cleanup and legacy-poster backfill validate their database
and Storage targets before loading either client. The default development
profile reads `.env.local` and accepts only a fully loopback stack or the fixed
staging project; because this repository's local file may point to staging,
always read the redacted preflight line before maintenance begins. Prefer
explicit staging profiles for operator-run maintenance:

```bash
npm run journal:cleanup -- --profile=staging
npm run journal:backfill-posters -- --profile=staging
```

Production uses its separate maintenance file and requires the exact project
reference as a second confirmation:

```bash
npm run journal:cleanup -- --profile=production \
  --confirm-production=pbzqwvowkpfhxptvmrny
npm run journal:backfill-posters -- --profile=production \
  --confirm-production=pbzqwvowkpfhxptvmrny
```

Cleanup processes one bounded batch of up to 25 candidates; run it again if
more may remain. Poster backfill instead scans every current candidate in
deterministic pages of 25, so a permanently malformed early video does not
prevent later entries from being repaired. It requires `ffmpeg`, caps each
child process at two minutes, and exposes no application credentials to that
child. Any failed candidate makes either command exit nonzero after closing its
database client.

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
for shared taxonomy. Schema changes are committed as Drizzle migrations and
tested on staging before production. Use an expand/contract release when
compatibility spans versions: apply the expand migration before its application
consumer, then deploy code that no longer needs the legacy contract, and apply
the destructive contract migration only after that code is the sole live
version.
