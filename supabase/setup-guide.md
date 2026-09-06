# Make the site global with Supabase — 5-minute setup

This connects the site to your **"mpl prediction"** Supabase project so that:

- **Logins are global** — sign up once, log in from any laptop.
- **Predictions are global** — your picks, points and accuracy follow you.
- **Admin data is global** — results, teams, news and the live link are visible to every visitor.

The website keeps working as before (local mode) until the keys are added — so nothing breaks mid-setup.

---

## Step 1 — Run the database setup

1. Open your Supabase dashboard: `https://supabase.com/dashboard` → open the **mpl prediction** project.
2. Left sidebar → **SQL Editor** → **New query**.
3. Open the file **`supabase/schema.sql`** from this project and copy its entire contents into the editor.
4. Press **Run** (or Ctrl+Enter). You should see "Success".

## Step 2 — Mark yourself as admin

1. In the SQL Editor, paste this **one line** (replace `your_email@example.com` with the email you'll log in with):

```sql
insert into public.profiles (username, user_id, is_admin)
select split_part(email, '@', 1), id, true
from auth.users
where email = 'your_email@example.com'
on conflict (username) do update set is_admin = true;
```

2. Run it.

## Step 3 — (Recommended) turn off email confirmation

Supabase Dashboard → **Authentication** → **Providers** → **Email** → turn **Confirm email** **OFF** → Save. This lets fans sign up and log in instantly.

## Step 4 — Copy your project keys

1. Supabase Dashboard → **Settings** (gear icon) → **API**.
2. Copy two values:
   - **Project URL** (looks like `https://abcdefghijklm.supabase.co`)
   - **anon public** key (a long `eyJ...` string).
3. Open the file **`js/supabase-config.js`** from this project and paste them in:

```js
window.SUPABASE_CONFIG = {
  url: "https://YOUR-PROJECT.supabase.co",
  anonKey: "eyJ..."
};
```

4. Upload the updated `js/supabase-config.js` to your repo (same path) and commit.

## Step 5 — Done

Reload your site. It now runs in **cloud mode**:

- The login form becomes **email + password** (sign up on any device, log in anywhere).
- Admin login uses the same email + password — you'll get the Admin link automatically.
- Every admin save (results, teams, news, live link) writes to the database and is seen by all visitors on their next page load.
- The leaderboard shows every user's points from the cloud.

---

## Notes & troubleshooting

- **"Auth session missing" / user can't sign in** — make sure Step 3 is done (Confirm email OFF), or check the confirmation email.
- **Admin panel not opening after login** — you didn't complete Step 2 (or logged in with a different email). Re-run the Step 2 SQL with the exact email.
- **Old local data still showing** — the site merges cloud data over local data on load. To start clean, use *Weeks & settings → Reset to seed data* in admin, or clear the browser site data once.
- **Local mode fallback** — if `js/supabase-config.js` is left empty, the site runs exactly as before (localStorage only). This is intentional.
- **Free tier limits** — Supabase free plan is fine for a fan site (50k monthly active users, 500 MB database).
- **Security note** — the anon key is meant to be public in the browser. Real protection comes from the Row Level Security policies in `schema.sql` (visitors can read matches but only admins can change them; users only see their own predictions; the leaderboard exposes usernames + points only).

## File checklist after this setup

| File | What to push |
|---|---|
| `js/supabase-config.js` | ← paste your URL + anon key, push |
| `js/cloud.js`, `js/utils.js`, `js/store.js`, `js/auth.js`, `js/scoring.js`, `js/ui.js`, `js/app.js`, `js/pages/*` | updated code, push |
| `assets/vendor/supabase.min.js` | the Supabase client (local, no CDN), push |
| All 5 `.html` files | updated includes, push |
