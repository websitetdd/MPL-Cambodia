# MPL Cambodia Prediction Hub

A modern esports prediction website for **MPL Cambodia** — live stream, standings, playoff bracket, and a points-based fan prediction game.

Built with **pure HTML5, CSS3, Vanilla JavaScript and JSON** — no frameworks, no build step, no dependencies. Host it anywhere static files are served (GitHub Pages, Netlify, Vercel, nginx…).

> **Important:** this is a fan prediction game. Points are gamification only — no real money is involved.

---

## Features

| Page | What's on it |
|---|---|
| **Home** | YouTube live embed (+ LIVE badge), upcoming match cards with live countdowns, search / week / team filters, top-5 mini standings, news |
| **Standings** | Full 10-team table with BO3 rules (win = 1 point), ranking priority (Points → Head-to-Head → Game Difference), playoff qualification badges (1–2 Upper Semifinal, 3–6 Playoffs, 7–10 Eliminated), full double-elimination bracket to the Grand Final |
| **Predictions** | Match winner + correct-score picks (+100 / +200, both = 300), auto-save, Top-6 drag-and-drop season pick (+100 exact / +50 in Top 6), champion pick (+500), statistics dashboard with accuracy donut + weekly bars, leaderboard, prediction history, export/import JSON |
| **Profile** | Avatar, total points, rank, predictions made, correct count, accuracy %, champion pick, Top 6 pick, upcoming predicted matches, recent history |
| **Admin** | Team CRUD (with logo upload), match CRUD, result entry (auto-updates standings, game difference, points and every prediction score), YouTube live link, news CRUD, tournament weeks & admin credentials |

**Extras:** dark loading animation, toast notifications, smooth page transitions, glassmorphism cards, dark esports theme (gold + violet on `#0F1117`), fully responsive with hamburger navigation, well-commented code, `prefers-reduced-motion` support.

---

## Run it locally

The site reads JSON seed files over HTTP, so serve the folder (GitHub Pages does this automatically). From inside the project folder:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

Or with Node:

```bash
npx serve .
```

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository.
2. Repo → **Settings → Pages** → Source: **Deploy from a branch** → branch `main`, folder `/ (root)`.
3. Save. Your site is live at `https://<username>.github.io/<repo>/`.

No build step is required — the files are ready to serve as-is.

---

## How the data works

- **Seed data** lives in `data/*.json` (`teams.json`, `matches.json`, `standings.json`, `playoff.json`, `news.json`, `config.json`).
- **Admin changes** are saved to **LocalStorage** as overrides on top of the seed (your edits survive refreshes; the JSON files stay pristine as the source of truth).
- **Accounts, sessions, predictions and scores** are all stored in LocalStorage.

### Why LocalStorage (and its limits)

GitHub Pages is a static host — there is no backend server. LocalStorage only exists in **one browser on one device**:

- accounts and predictions are **not** shared across users or devices;
- admin updates are **not** visible to other visitors;
- clearing browser data erases everything.

For a real online system with shared accounts, a global leaderboard and admin edits visible to everyone, you need a backend such as **Firebase**, **Supabase** or **PocketBase** (all have free tiers). The prediction logic in `js/scoring.js` and `js/store.js` is written so the data layer can be swapped for a backend client without touching the UI.

### Supabase (cloud mode) — 5-minute setup included

The project ships with a ready-made Supabase integration (login, predictions and admin data shared across all devices):

1. Open **`supabase/schema.sql`** → run it in your Supabase project's SQL Editor.
2. Run the one-line SQL in section 6 of that file with **your email** to mark yourself admin.
3. (Recommended) Turn **Confirm email OFF** in Authentication → Providers → Email.
4. Paste your **Project URL** + **anon key** into **`js/supabase-config.js`**.
5. Push and reload — the site runs in cloud mode automatically; empty keys keep the pure LocalStorage mode.

Full walkthrough: **`supabase/setup-guide.md`**.

---

## Prediction rules

| Prediction | Points |
|---|---|
| Correct match winner | +100 |
| Correct exact score (2-0 / 2-1 / 1-2 / 0-2) | +200 |
| Winner + exact score both right | 300 total |
| Top 6 — exact position | +100 each |
| Top 6 — inside Top 6, wrong position | +50 each |
| Champion | +500 |

**Standings rules (regular season, Best of 3):** any win (2-0 or 2-1) = 1 point, any loss = 0. Ranking priority: **1. Total Points, 2. Head-to-Head, 3. Game Difference.**

---

## Admin panel

Open `admin.html` (link appears in the navbar after login).

- Default credentials: **admin** / **admin123** (demo only — change them in *Weeks & settings → Security*).
- Enter match results under *Matches → Finished*: pick winner + score and press *Apply result* — standings, game difference, points and every user's prediction score update automatically.

---

## Folder structure

```
mpl-cambodia-predict/
├── index.html            Home
├── standings.html        Standings + playoff bracket
├── predictions.html      Prediction game
├── profile.html          User profile
├── admin.html            Admin panel
├── css/
│   └── style.css         Design system (tokens, components, responsive)
├── js/
│   ├── app.js            Boot / page dispatch
│   ├── utils.js          DOM & formatting helpers, countdown, YouTube embed
│   ├── store.js          Data layer: JSON seed + LocalStorage overrides, standings engine
│   ├── auth.js           Accounts, sessions, admin auth
│   ├── scoring.js        Prediction scoring engine (match/Top6/champion, leaderboard)
│   ├── ui.js             Loader, navbar, auth modal, toasts, shared renderers
│   └── pages/            home.js · standings.js · predictions.js · profile.js · admin.js
├── data/                 teams.json · matches.json · standings.json · playoff.json · news.json · config.json
└── assets/
    ├── logos/            10 team logo SVGs
    ├── img/              Hero + news banners
    ├── fonts/            Self-hosted Orbitron + Rajdhani (woff2)
    └── favicon.svg
```
