Obfuscation & security notes (SoundSphere)

This file explains how to obfuscate the client JS and recommended security steps.

Prerequisites (Windows PowerShell)
- Install Node.js (includes npm). Recommended: https://nodejs.org/en/download/ or run:
  # Requires Windows 10/11 and winget
  winget install OpenJS.NodeJS

Quick steps (run in PowerShell, in the `sound-sphere-main` folder):

# 1) Install dependencies
npm install

# 2) Obfuscate the account bundle
npm run obfuscate

This will generate `assets/js/account.obf.js`. The HTML is already wired to prefer the obfuscated bundle and fall back to `assets/js/account.js`.

Important security notes
- Never store Supabase "service_role" keys or other secrets in client code or in `env.js`.
- Use `env.js` only to set the public (anon) key if you must; consider generating it at deploy time and keep it out of source control.
- Stronger protection: move privileged operations (writes, admin or file access) to a server-side API that uses a server-only key and enforces authentication/authorization.
- Enable Row Level Security (RLS) in Supabase and write strict policies for client access when using anon keys.
- Use HTTPS and Content-Security-Policy (CSP) meta tag to reduce XSS risk.

Why obfuscation? It increases the work required to read client JS but does NOT prevent a determined attacker from reverse-engineering. Do not rely on obfuscation for securing secrets.

If you want, I can:
- Add a server proxy example that performs sensitive Supabase writes.
- Add a CSP meta tag to `account.html` and scan other pages for inline scripts/styles to minimize CSP exceptions.

---

## Supabase MFA (TOTP) integration

This project includes client-side helpers and UI to enroll TOTP (authenticator app) MFA and handle the verification flow. Summary:

- Sign-in flow (client) performs signInWithPassword() using the anon key so Supabase enforces MFA. If an MFA challenge is required the client will prompt for the OTP and verify it via the Supabase JS SDK (`supabase.auth.mfa.challenge` / `mfa.verify` or `mfa.challengeAndVerify`).
- After a successful sign-in (and MFA), the client calls server endpoint `/auth/handshake` to hand session tokens to the server. Server sets HttpOnly cookies so your existing cookie-based session handling continues.
- Account page has UI to enroll and verify a TOTP factor. This uses `supabase.auth.mfa.enroll({ factorType: 'totp' })` and then `challengeAndVerify` to finalize enrollment.

Quick test steps (local):

1. Enable TOTP in your Supabase project's Authentication -> Multi-factor Authentication settings.
2. Start your server (`node server/index.js`) and host the frontend files (open `SignIn.html`).
3. On Sign In, use an account that has MFA enabled. After entering email/password you'll be prompted for the OTP.
4. After entering OTP, the app will POST tokens to `/auth/handshake` and redirect to `Home.html` on success.

Note: If you want SMS-based MFA, configure Twilio in Supabase dashboard and use `factorType: 'phone'` enroll flows.
