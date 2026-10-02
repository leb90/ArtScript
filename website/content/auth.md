# Accounts and access

Accounts are one declaration: a model with `email` and `password`, an api for it, and `auth`.

```art
model User {
  id: ID
  email: Email unique
  password: String min=8
  name: String?
}

api users: User

auth users
```

Passwords are hashed with scrypt and never returned by the api. Sessions are random tokens in `HttpOnly; SameSite=Lax` cookies that last 30 days. Each user can only change or delete their own account.

## Signing up and in

The `auth` client works from any component:

```art
await auth.signup({ email, password, name: null })
await auth.login(email, password)
await auth.logout()
await auth.logoutAll()
```

`auth.me()` is the signed-in user, or `null`; as `data`, it updates after login and logout:

```art
layout Main {
  data me = auth.me()

  row justify=between pad=4 {
    link "Home" to="/"
    if me {
      button "Sign out" small -> auth.logout()
    } else {
      link "Sign in" to="/login"
    }
  }
  slot
}
```

Failed logins throw an error whose `message` you can show. After 10 failed attempts for an email from one address in 15 minutes, logins are refused for a while.

## Protecting data

The api decides who can read and write. Add one word to the `api` line:

| Access | Who reads | Who writes |
|---|---|---|
| (nothing) | anyone | anyone |
| `login` | signed-in users | signed-in users |
| `private` | each user, their own rows | each user, their own rows |
| `admin` | anyone | admins |

```art
model Note {
  id: ID
  owner: ID
  text: String
}

api notes: Note private
```

A `private` model needs `owner: ID`: the server fills it in on create, and every query only sees the user's own rows.

## Roles

Give the accounts model a `role: String`. The first account becomes `"admin"` and every later one `"user"`; nobody can give themselves a role.

```art
model User {
  id: ID
  email: Email unique
  password: String min=8
  role: String
}
```

Then `api products: Product admin` lets anyone read and only admins write, and `page Admin "/admin" requires admin` shows the page only to them. In a `server fn`, check `me?.role == "admin"`.

## Pages for signed-in users

```art
page Dashboard "/dashboard" requires login {
  title "Dashboard"
}
```

Visitors without a session are sent to `/login` if the app has that page, or to `/`. See [Pages and routing](/learn/routing).

## Google and GitHub

```art
auth users with google, github
```

```art
button "Continue with Google" -> auth.loginWith("google")
```

Set `ART_GOOGLE_ID` and `ART_GOOGLE_SECRET` (or `ART_GITHUB_ID` and `ART_GITHUB_SECRET`). Only emails the provider has verified are accepted; a first sign-in creates the account.

## Password reset

`auth.requestReset(email)` emails a single-use link to `/reset-password?token=...`, valid for an hour. That page calls `auth.resetPassword`:

```art
page ResetPassword "/reset-password" {
  state password = ""
  state done = false

  if done {
    text "Password changed. You can sign in now." success
  } else {
    input password type=password placeholder="New password"
    button "Save" primary -> { await auth.resetPassword(query.token ?? "", password); done = true }
  }
}
```

A reset ends every other session of the account.

## Email verification

Add `verified: Bool` to the accounts model. Sign-up then emails a link to `/verify-email?token=...`; the page calls `auth.verifyEmail(query.token)`. New accounts always start unverified.

## Sending email

In development, emails are printed to the console and saved to `outbox.jsonl`. In production, set `ART_RESEND_KEY` and `ART_EMAIL_FROM` to send through Resend, or `ART_EMAIL_WEBHOOK` to POST each email as JSON to your own service. Server functions send their own with `await email(to, subject, text)`.

More defaults (rate limits, CSRF, headers) are listed in [Security](SECURITY.md).
