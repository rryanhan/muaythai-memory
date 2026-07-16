# Authentication

Muay Thai Memory uses one authentication flow: passwordless email magic links
through Supabase Auth. A user enters an email, opens the link that Supabase
sends, and `/auth/confirm` exchanges the PKCE code for a cookie-backed session.

## Supabase configuration

1. Keep the Email provider enabled.
2. Open **Authentication > Email Templates > Magic link or OTP**.
3. Keep `{{ .ConfirmationURL }}` in the template. Do not replace it with
   `{{ .Token }}`, because the app does not ask users to enter a code.
4. Add each app origin's `/auth/confirm` URL to the project's redirect allow
   list. This includes the local development URL, current HTTPS tunnel URL,
   and eventual production URL.

The app passes `/auth/confirm` as `emailRedirectTo` and preserves the protected
page the user originally requested in a sanitized `next` query parameter.
Expired or reused links return to sign in with a recoverable error.

Supabase's default SMTP is development-only and heavily rate limited. Stop
requesting links after a rate-limit error and wait for its window to reset.
Configure custom SMTP before inviting users outside the Supabase project team.

## Ownership testing

Sign in with two separate email addresses when checking per-user isolation.
Existing development data can be assigned to an authenticated account with:

```bash
npm run db:claim-dev-user -- --email fighter@example.com --display-name "Fighter Name"
```

## Verification

```bash
npm run auth:verify
npm run auth:verify-api
npm run typecheck
npm run build
```

`auth:verify` checks per-user drill, graph, and custom-tag isolation.
`auth:verify-api` checks that protected APIs return `401` without a session.
