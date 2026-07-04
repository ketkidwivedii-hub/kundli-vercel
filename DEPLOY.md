# Deploying this to Vercel

This folder is a standard Next.js project at the top level — Vercel needs
no extra settings, just point it here.

## What works with Vercel alone vs. what needs the backend too

Works right now, Vercel-only:
- Paste or upload (PDF) biodata → AI field extraction → review/correct screen
- Location eligibility check (Kanpur/Lucknow/UP/Bihar rejected, Noida allowed)
  — this resolves the real state via free geocoding, not just text matching

Needs the `/backend` folder deployed separately (see root README.md,
Render is the suggested free host) for:
- The actual kundli/Ashtakoota score — this requires the Python astronomy
  library (Swiss Ephemeris) that can't run inside a Vercel Node function.
  Without it, the report screen shows an honest "not connected yet" message
  instead of a fabricated score — it never guesses.

## Environment variables to set in Vercel

Project Settings → Environment Variables:

| Name | Value | Required for |
|---|---|---|
| `GEMINI_API_KEY` | your key from aistudio.google.com/apikey | AI field extraction |
| `BACKEND_URL` | your deployed Render backend URL, e.g. `https://kundli-app-backend.onrender.com` | Kundli scoring |

You can deploy without `BACKEND_URL` — extraction and location checks work
immediately; the kundli step will just say it isn't connected yet until
you add it.

## Steps

### Option 1 — through GitHub (recommended, makes future updates easy)

1. Create a free GitHub account if you don't have one → github.com
2. New repository → name it anything (e.g. `kundli-frontend`) → Create.
3. On the empty repo page, click "uploading an existing file" and drag
   in everything from inside this folder (its contents — `components`,
   `lib`, `pages`, `package.json`, `.gitignore` — not the folder itself).
4. Go to vercel.com → sign up/log in with your GitHub account.
5. "Add New" → "Project" → select this repo. Vercel auto-detects Next.js.
6. Before clicking Deploy, expand "Environment Variables" and add
   `GEMINI_API_KEY` (and `BACKEND_URL` once the backend is deployed).
7. Click Deploy. In under a minute you'll get your live URL.

From now on, any file you change/upload on GitHub redeploys automatically.

### Option 2 — drag-and-drop, no GitHub (fastest, manual to update later)

1. vercel.com → sign in → vercel.com/new → deploy without Git / drag and
   drop this folder.
2. Add the environment variables the same way, under Project Settings.

## After it's live

1. Test extraction: paste some biodata text, click "Extract fields."
2. Test PDF upload: use the "Upload biodata PDF" button instead.
3. Confirm all fields, click through to the report screen — location
   check will show a real pass/fail; the kundli step will show either a
   real score (if `BACKEND_URL` is set) or an honest "not connected" message.
