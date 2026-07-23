# Authentication And Onboarding

Muay Thai Memory supports Google OAuth and email/password authentication through
Supabase Auth. Email users confirm their address once at registration, then use
their password for normal sign-in. `/auth/confirm` exchanges PKCE codes for
cookie-backed sessions used by the server-rendered app.

## Supabase configuration

1. Keep the Email provider enabled with **Confirm email** enabled.
2. Configure the **Confirm signup** template with `{{ .ConfirmationURL }}`.
3. Configure the **Reset password** template with `{{ .ConfirmationURL }}`.
4. Add each app origin's `/auth/confirm` URL to the redirect allow list.
5. Set the Auth password minimum to at least eight characters.
6. Configure custom SMTP before external testing.

For Google sign-in:

1. Create a Google OAuth web client and consent screen.
2. Add `https://<project-ref>.supabase.co/auth/v1/callback` as an authorized
   Google redirect URI.
3. Enable Google in the matching Supabase project with that client ID/secret.
4. Configure staging and production independently.

The app preserves the originally requested internal route in a sanitized
`next` parameter. Invalid confirmation links return to sign-in. Invalid,
expired, or used recovery links return to the recovery request screen.

## Recovery security

Set a different `AUTH_FLOW_SECRET` containing at least 32 random bytes in every
hosted environment. It is a server-only HMAC key and must never use a
`NEXT_PUBLIC_` prefix.

Recovery email initiation and password updates pass through Next route
handlers. The initiation handler records a signed, HttpOnly recovery intent.
`/auth/confirm` issues a ten-minute recovery grant only when Supabase reports
that the successful PKCE exchange has the `recovery` redirect type and the
intent matches the recovered email.

The signed browser grant contains a random jti and is bound to the recovered
user and Supabase session. The server stores only keyed hashes in
`auth_recovery_grants`. Transactions and row locks move each grant through
`issued`, `pending`, and `consumed` states across serverless instances. A keyed
password fingerprint makes a response-lost or ambiguous provider retry
idempotent for the same password while rejecting a different password. A
short attempt lease prevents concurrent duplicate provider calls while still
allowing a stale serverless request to recover. A conclusive provider rejection
safely releases the password binding. Plaintext passwords are never stored.

Expired ledger rows remain available for a 24-hour audit window. New recovery
grant issuance opportunistically removes at most 100 older rows at a time using
the expiry index and row locks. Cleanup also checks the terminal or last-update
timestamp, so active grants and recently consumed, failed, or expired grants are
never removed.

The reset form posts its rendered jti as well as the HttpOnly cookie, so a
parallel callback that rotates the cookie invalidates the older tab. After a
successful update, the recovery session is signed out, its local cookies are
cleared, and the user returns to sign-in with a success message. An ordinary
authenticated session has neither a matching recovery grant nor its bound
session and cannot use the reset form.

Because the flow uses PKCE plus an HttpOnly intent cookie, open the recovery
email in the same browser that requested it.

## Onboarding

Authenticated users must finish `/onboarding/profile` and either complete or
skip `/onboarding/first-drill` before normal product pages and APIs are
available. Username is required and future-public. First name, last name, and
location are optional and private.

The first-drill guide opens the production Capture Drill recorder and teaches
voice capture, typed AI capture, and manual Add Drill in that order. Every path
ends in the normal editable drill form and creates a normal owned drill through
the same taxonomy and validation rules. Skipped users can replay it from
Training Log.

## Existing passwordless users

Accounts created under the previous magic-link flow can select **Forgot
password** to establish a password. Their Supabase identity and owned data do
not change.

## Verification

```bash
npm test
npm run auth:verify
npm run auth:verify-api
npm run auth:verify-recovery-grants
npm run onboarding:verify
npm run typecheck
npm run build
```

Run `auth:verify-recovery-grants` only after migration `0008` is applied to the
target environment. It exercises concurrent grant claims against real
Postgres and removes its temporary app user afterward.

Use two accounts to confirm drill, graph, journal, and custom-tag isolation.
