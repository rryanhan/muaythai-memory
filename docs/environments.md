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

The verifier rejects mixed Supabase project references and non-HTTPS hosted
origins.

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
