-- ============================================================================
-- MPL Cambodia Prediction Hub — Supabase setup (run once)
-- How to run: Supabase Dashboard → your project → SQL Editor → paste this
-- whole file → Run.
--
-- After running, do the ONE manual step in section 7 to mark yourself admin.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Tables
-- Shared tournament data is stored as jsonb rows so the website's existing
-- JSON structures (teams.json / matches.json / ...) map 1:1 to the database.
-- ----------------------------------------------------------------------------
create table if not exists public.teams (
  id text primary key,
  data jsonb not null default '{}'::jsonb
);

create table if not exists public.matches (
  id text primary key,
  data jsonb not null default '{}'::jsonb
);

create table if not exists public.playoff_matches (
  id text primary key,
  data jsonb not null default '{}'::jsonb
);

create table if not exists public.news (
  id text primary key,
  data jsonb not null default '{}'::jsonb
);

-- One row, key 'config' — holds config.json (live stream, weeks, rules)
create table if not exists public.settings (
  key text primary key,
  value jsonb
);

-- Public profile per user: used for the leaderboard and the admin flag.
create table if not exists public.profiles (
  username text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  is_admin boolean not null default false,
  points_total integer not null default 0,
  correct integer not null default 0,
  finished integer not null default 0,
  updated_at timestamptz not null default now()
);

-- One row per user: their predictions (match picks, top 6, champion).
create table if not exists public.predictions (
  username text primary key references public.profiles(username) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2) Admin helper function
-- ----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and is_admin = true
  );
$$;

-- ----------------------------------------------------------------------------
-- 3) Row Level Security
-- Anyone may READ tournament data (teams / matches / news / live config).
-- Only admins may WRITE tournament data. Users read/write their own profile
-- and predictions. The leaderboard is public (profiles are public).
-- ----------------------------------------------------------------------------
alter table public.teams enable row level security;
alter table public.matches enable row level security;
alter table public.playoff_matches enable row level security;
alter table public.news enable row level security;
alter table public.settings enable row level security;
alter table public.profiles enable row level security;
alter table public.predictions enable row level security;

-- teams: public read, admin write
drop policy if exists "teams_public_read" on public.teams;
create policy "teams_public_read" on public.teams for select using (true);
drop policy if exists "teams_admin_write" on public.teams;
create policy "teams_admin_write" on public.teams for all using (public.is_admin()) with check (public.is_admin());

-- matches: public read, admin write
drop policy if exists "matches_public_read" on public.matches;
create policy "matches_public_read" on public.matches for select using (true);
drop policy if exists "matches_admin_write" on public.matches;
create policy "matches_admin_write" on public.matches for all using (public.is_admin()) with check (public.is_admin());

-- playoff_matches: public read, admin write
drop policy if exists "playoff_public_read" on public.playoff_matches;
create policy "playoff_public_read" on public.playoff_matches for select using (true);
drop policy if exists "playoff_admin_write" on public.playoff_matches;
create policy "playoff_admin_write" on public.playoff_matches for all using (public.is_admin()) with check (public.is_admin());

-- news: public read, admin write
drop policy if exists "news_public_read" on public.news;
create policy "news_public_read" on public.news for select using (true);
drop policy if exists "news_admin_write" on public.news;
create policy "news_admin_write" on public.news for all using (public.is_admin()) with check (public.is_admin());

-- settings: public read, admin write
drop policy if exists "settings_public_read" on public.settings;
create policy "settings_public_read" on public.settings for select using (true);
drop policy if exists "settings_admin_write" on public.settings;
create policy "settings_admin_write" on public.settings for all using (public.is_admin()) with check (public.is_admin());

-- profiles: public read (leaderboard), users manage their own row
drop policy if exists "profiles_public_read" on public.profiles;
create policy "profiles_public_read" on public.profiles for select using (true);
drop policy if exists "profiles_own_insert" on public.profiles;
create policy "profiles_own_insert" on public.profiles for insert with check (auth.uid() = user_id);
drop policy if exists "profiles_own_update" on public.profiles;
create policy "profiles_own_update" on public.profiles for update using (auth.uid() = user_id or public.is_admin());
drop policy if exists "profiles_own_delete" on public.profiles;
create policy "profiles_own_delete" on public.profiles for delete using (auth.uid() = user_id or public.is_admin());

-- predictions: users manage their own row; admins may view all
drop policy if exists "predictions_own_select" on public.predictions;
create policy "predictions_own_select" on public.predictions for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists "predictions_own_insert" on public.predictions;
create policy "predictions_own_insert" on public.predictions for insert with check (auth.uid() = user_id);
drop policy if exists "predictions_own_update" on public.predictions;
create policy "predictions_own_update" on public.predictions for update using (auth.uid() = user_id or public.is_admin());
drop policy if exists "predictions_own_delete" on public.predictions;
create policy "predictions_own_delete" on public.predictions for delete using (auth.uid() = user_id or public.is_admin());

-- ----------------------------------------------------------------------------
-- 4) Seed the live-stream setting
-- ----------------------------------------------------------------------------
insert into public.settings (key, value)
values ('config', '{"tournament":{"name":"MPL Cambodia","season":"Season 2026","currentWeek":3,"weeks":[{"num":1,"label":"Week 1","dates":"Jul 17 - 19"},{"num":2,"label":"Week 2","dates":"Jul 24 - 26"},{"num":3,"label":"Week 3","dates":"Aug 7 - 9"},{"num":4,"label":"Playoffs","dates":"Sep 4 - 6"}]},"live":{"url":"","isLive":false,"title":"MPL Cambodia Official Stream","channel":"MPL Cambodia"}}')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 5) Seed the initial tournament data from the website's JSON files
-- (Optional — skip if you prefer the website to re-upload its current data
--  automatically on the first admin save. Run these only once:)
-- ----------------------------------------------------------------------------
-- insert into public.teams (id, data) values
--   ('cfu','{"id":"cfu","name":"CFU Gaming","shortName":"CFU","tag":"CFU","logo":"assets/logos/cfu.svg","color":"#F5B301"}'),
--   ('flash','{"id":"flash","name":"Team Flash KH","shortName":"Flash KH","tag":"TF","logo":"assets/logos/flash.svg","color":"#17C3B2"}');
-- ... (repeat for all teams / matches / news — or let the website push them)

-- ----------------------------------------------------------------------------
-- 6) IMPORTANT — mark yourself as admin
-- Replace your_email@example.com with the email address you will log in with,
-- then run ONLY this line:
-- ----------------------------------------------------------------------------
-- insert into public.profiles (username, user_id, is_admin)
-- select split_part(email, '@', 1), id, true
-- from auth.users
-- where email = 'your_email@example.com'
-- on conflict (username) do update set is_admin = true;

-- ----------------------------------------------------------------------------
-- 7) Optional — turn off email confirmation
-- Supabase Dashboard → Authentication → Providers → Email →
--   "Confirm email" = OFF
-- This lets new users sign up and get straight in without clicking a
-- confirmation link (fine for a fan demo).
-- ----------------------------------------------------------------------------
