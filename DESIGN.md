# DESIGN.md — MPL Cambodia Prediction Hub

Canvas Design Contract for the MPL Cambodia prediction website (static build: HTML5 + CSS3 + vanilla JS + JSON, hosted on GitHub Pages).

## 1. Product goal & audience

- **Goal:** a fan-facing esports hub where MPL Cambodia viewers watch the official stream, check the standings, follow the playoff bracket, and play a points-based prediction game (winner / correct score / Top-6 / champion).
- **Audience:** MPL Cambodia fans on desktop and mobile; tournament admins updating data.
- **Constraint:** no backend. GitHub Pages + LocalStorage. Prediction points are gamified fan engagement (no real money).

## 2. Visual direction

"Cyber-Royal Esports" — high-contrast dark arena atmosphere, gold + violet accents, glass cards, angular esports geometry. Inspired by official tournament broadcast overlays: readable at a glance, energetic but not noisy. Dark-only theme by design (like broadcast HUD).

## 3. Reference Sources (vendor grounding)

- `vendor/open-design/adapter/STATIC_POLICY.md` — static policy; tokens.css used as token source, not wholesale copy.
- `vendor/open-design/upstream/design-systems/hud/DESIGN.md` + `tokens.css` — baseline: near-black canvas, elevated panels, border-separated surfaces, status dots, uppercase labels, glow-over-shadow depth, data density without clutter. (Phosphor green replaced with brand gold/violet per user brief.)
- `vendor/open-design/upstream/craft/animation-discipline.md` — motion budget: 100–150 ms micro-feedback, 200–300 ms modals, 300–500 ms page transitions; `prefers-reduced-motion` honored; countdown ticks animate digits, not layouts.
- `vendor/open-design/upstream/craft/anti-ai-slop.md` — checks: no Tailwind-indigo accents (violet chosen avoids the banned hexes), no purple→blue trust gradient hero (hero uses a dark arena photograph with a gold/violet gradient *overlay*, not a mesh), no emoji icons (inline SVG monoline), no lorem ipsum (real MPL team names, real-feeling copy), no placeholder-image CDNs (all images local or generated).

## 4. Color tokens (dark-only)

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#0F1117` | Page canvas |
| `--bg-2` | `#13161F` | Alt section band |
| `--card` | `#1B1E27` | Cards, panels |
| `--card-glass` | `rgba(27,30,39,.72)` + `backdrop-filter: blur(12px)` | Glass cards |
| `--border` | `rgba(255,255,255,.08)` | Hairline borders |
| `--gold` | `#F5B301` | Primary accent, winners, rank 1 |
| `--gold-2` | `#D9A404` | Gold gradient partner |
| `--violet` | `#8E44D6` | Secondary accent, playoffs, buttons |
| `--violet-2` | `#5B2A96` | Violet gradient partner |
| `--text` | `#F2F4F8` | Primary text |
| `--text-2` | `#A7B0C3` | Secondary text |
| `--muted` | `#6B7385` | Captions |
| `--live` | `#FF3B4E` | LIVE badge |
| `--win` | `#31C48D` | Wins / correct |
| `--loss` | `#E5484D` | Losses / wrong |
| `--warn` | `#FFB020` | Pending |

Buttons: gradient `135deg` gold→deep-gold for primary CTAs; violet gradient for secondary CTAs; hover lifts + glow border. Shadows are soft black with a faint violet/gold glow — no neon blowout.

## 5. Typography

- Display (page titles, hero, big numbers): **Orbitron** (self-hosted woff2, 600/700/800), uppercase, wide tracking.
- Headings / buttons / labels / nav / countdown digits: **Rajdhani** (self-hosted woff2, 500/600/700), uppercase for labels.
- Body: system-ui stack (`system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`).
- Scale: h1 2.25rem / h2 1.5rem / h3 1.125rem / body .9375–1rem / caption .75rem uppercase. No external font CDNs (self-hosted under `assets/fonts/`).

## 6. Spacing / radii / shadows

- Spacing scale: 4/8/12/16/24/32/48.
- Radii: cards 14px, buttons 8px, pills 999px, badges 6px.
- Shadows: `0 12px 40px rgba(0,0,0,.55)` + optional `0 0 24px rgba(142,68,214,.14)` glow on hover/active states only.
- Glass recipe: `background: var(--card-glass); border: 1px solid var(--border); backdrop-filter: blur(12px); border-radius: 14px;`

## 7. Component inventory

- `nav-main` — sticky glass navbar; logo mark + links Home/Standings/Predictions/Profile; right side auth button or user chip; mobile hamburger → slide-down panel.
- `match-card` — week chip, two team blocks (logo, name), "VS" divider, date/time line, countdown strip (DD:HH:MM:SS), Predict CTA (gold gradient). State variants: scheduled / live (pulse) / finished (result shown).
- `standing-table` — dense table: rank, team (logo+name), M, W, L, GD, Pts; qualification badge per row (gold "Upper Semifinal", violet "Playoff", gray "Eliminated"); rank 1-2 rows gold-tinted, 3-6 violet-tinted.
- `bracket` — double-elimination bracket with angular nodes and connector lines (CSS + inline SVG connectors); seed/result labels; Grand Final + reset slot.
- `badge-live` — red dot pulse + "LIVE".
- `form-controls` — dark inputs, gold focus ring, custom radio pills, select dropdowns.
- `toast` — bottom-right slide-in; success/error/info variants.
- `loader` — full-screen dark boot loader with gold spinner + brand wordmark; skeleton shimmer for data sections.
- `stat-card` — label + big number (Orbitron) + delta; used in profile/dashboard.
- `leaderboard` — ranked rows with medals for top 3.
- `chart` — hand-rolled SVG donut (accuracy) + bar rows (weekly points), no chart lib.

## 8. Page structure & responsive

- **Home:** hero band (arena image + gradient overlay) → LIVE stream panel (iframe or offline placeholder + LIVE badge) → Upcoming Matches (grid, filters: search / week / team) → Top-5 mini standings → news strip.
- **Standings:** full 10-team table + qualification legend + playoff bracket.
- **Predictions:** match cards (winner radio pills, score dropdown, auto-save, Save button) → Season Top-6 drag-and-drop + Champion dropdown → stats (points, accuracy donut, weekly bars) → leaderboard → history table → export/import JSON.
- **Profile:** avatar (initials), username, total points, rank, stats grid, champion/Top-6 picks, upcoming predicted matches, recent history.
- **Admin:** separate login gate; tabs: Teams / Matches / Live / News / Weeks.
- **Auth:** modal (login / register tabs) on all pages; session persists.
- Breakpoints: desktop >1024 (3-col match grid, full tables), tablet 768–1024 (2-col), mobile <768 (1-col, hamburger nav, horizontal-scroll tables wrapped in `overflow-x:auto`).

## 9. Interaction & motion

- 150 ms hover states; buttons lift 1px on hover, press 1px down.
- Cards hover: translateY(-3px) + violet glow border.
- Page transitions: content fade/slide 300 ms on load; cross-page via normal navigation.
- Countdown updates once per second, digits static (no flip animation — reduced motion friendly).
- Toasts auto-dismiss 2.6 s, slide-in 220 ms.
- All transforms/scale respect `prefers-reduced-motion`.

## 10. Image Manifest (all local)

| Local Path | Source | Usage |
|---|---|---|
| assets/img/hero-arena.jpg | imageGenerate: dark esports arena, gold/violet lighting | Home hero + page-header backgrounds |
| assets/img/news-1.jpg | imageGenerate: esports trophy stage | News card 1 |
| assets/img/news-2.jpg | imageGenerate: team lineup silhouettes arena | News card 2 |
| assets/img/news-3.jpg | imageGenerate: playoff bracket neon display | News card 3 |
| assets/logos/*.svg (10) | hand-authored SVG badges | Team logos everywhere |
| assets/favicon.svg | hand-authored SVG | Site icon |
| assets/fonts/*.woff2 (6) | fontsource via jsdelivr, self-hosted | Orbitron + Rajdhani |
| Avatar | initials-based inline SVG (data-visualization exception) | User avatars |

## 11. Anti-slop checklist (applied)

No banned indigo hexes; no purple→blue mesh hero (photo + overlay); no emoji icons (SVG monoline set); no lorem ipsum (real MPL teams + realistic copy); no external image CDNs; token-driven color (`:root` only); `--gold`/`--violet` used deliberately, not as decorative paint; section density alternates (tight tables vs. breathing hero).
