-- ============================================
-- BMIS ELECTION SYSTEM — COMPLETE SETUP v2
-- Run this entire block once in SQL Editor
-- ============================================

-- 1. ROLES TABLE (replaces hardcoded SPL/ASPL)
create table if not exists roles (
  id serial primary key,
  name text not null,
  display_order integer not null default 0,
  active boolean not null default true
);

-- 2. CANDIDATES TABLE (linked to roles)
create table if not exists candidates (
  id serial primary key,
  role_id integer not null references roles(id) on delete cascade,
  name text not null,
  photo_url text,
  display_order integer not null default 0,
  active boolean not null default true
);

-- 3. VOTES TABLE (one row per role per voter)
create table if not exists votes (
  id serial primary key,
  booth integer not null check (booth between 1 and 6),
  role_id integer not null,
  role_name text not null,
  candidate_name text not null,
  session_id text not null,
  created_at timestamptz not null default now()
);

-- 4. ELECTION SETTINGS
create table if not exists election_settings (
  id serial primary key,
  voting_open boolean not null default false,
  booth_count integer not null default 6
);

-- 5. BOOTH STATUS
create table if not exists booth_status (
  booth integer primary key check (booth between 1 and 6),
  last_seen timestamptz not null default now()
);

-- ── SEED DATA ────────────────────────────────

insert into election_settings (id, voting_open)
values (1, false)
on conflict (id) do nothing;

-- ── ROW LEVEL SECURITY ───────────────────────

alter table roles enable row level security;
alter table candidates enable row level security;
alter table votes enable row level security;
alter table election_settings enable row level security;
alter table booth_status enable row level security;

create policy "Read roles" on roles for select using (true);
create policy "Insert roles" on roles for insert with check (true);
create policy "Update roles" on roles for update using (true);
create policy "Delete roles" on roles for delete using (true);

create policy "Read candidates" on candidates for select using (true);
create policy "Insert candidates" on candidates for insert with check (true);
create policy "Update candidates" on candidates for update using (true);
create policy "Delete candidates" on candidates for delete using (true);

create policy "Read votes" on votes for select using (true);
create policy "Insert votes" on votes for insert with check (true);
create policy "Delete votes" on votes for delete using (true);

create policy "Read election settings" on election_settings for select using (true);
create policy "Update election settings" on election_settings for update using (true);

create policy "Read booth status" on booth_status for select using (true);
create policy "Insert booth status" on booth_status for insert with check (true);
create policy "Update booth status" on booth_status for update using (true);

-- ── STORAGE ──────────────────────────────────
-- Run this separately after the above:
-- 1. Go to Storage in the left sidebar
-- 2. Click "New bucket"
-- 3. Name it: candidate-photos
-- 4. Check "Public bucket"
-- 5. Click Create
