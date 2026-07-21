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
5. Configure custom SMTP before external testing.

For Google sign-in:

1. Create a Google OAuth web client and consent screen.
2. Add `https://<project-ref>.supabase.co/auth/v1/callback` as an authorized
   Google redirect URI.
3. Enable Google in the matching Supabase project with that client ID/secret.
4. Configure staging and production independently.

The app preserves the originally requested internal route in a sanitized
`next` parameter. Confirmation and recovery links are single-use; invalid links
return to sign-in with recoverable copy.

## Onboarding

Authenticated users must finish `/onboarding/profile` and either complete or
skip `/onboarding/first-drill` before normal product pages and APIs are
available. Username is required and future-public. First name, last name, and
location are optional and private.

The first-drill guide creates a normal owned drill through the same taxonomy
and validation rules as Add Drill. Skipped users can replay it from Training
Log.

## Existing passwordless users

Accounts created under the previous magic-link flow can select **Forgot
password** to establish a password. Their Supabase identity and owned data do
not change.

## Verification

```bash
npm run auth:verify
npm run auth:verify-api
npm run onboarding:verify
npm run typecheck
npm run build
```

Use two accounts to confirm drill, graph, journal, and custom-tag isolation.
