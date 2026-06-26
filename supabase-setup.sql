-- ============================================
-- BMIS ELECTION SYSTEM — COMPLETE SETUP
-- Run this entire block once in the Supabase
-- SQL Editor on a fresh project.
-- ============================================


-- ── 1. TABLES ────────────────────────────────

-- Voting roles (e.g. SPL, ASPL, House Captain)
create table if not exists roles (
  id            serial primary key,
  name          text not null,
  display_order integer not null default 0,
  active        boolean not null default true
);

-- Candidates linked to roles
create table if not exists candidates (
  id            serial primary key,
  role_id       integer not null references roles(id) on delete cascade,
  name          text not null,
  photo_url     text,
  display_order integer not null default 0,
  active        boolean not null default true
);

-- Votes: one row per role per voter; session_id groups all votes from one voter
create table if not exists votes (
  id             serial primary key,
  booth          integer not null check (booth between 1 and 20),
  role_id        integer not null,
  role_name      text not null,
  candidate_name text not null,
  session_id     text not null,
  created_at     timestamptz not null default now()
);

-- Global election settings (always exactly one row with id = 1)
create table if not exists election_settings (
  id             serial primary key,
  voting_open    boolean not null default false,
  booth_count    integer not null default 6,
  admin_password text not null default 'Bmis1815',
  booth_password text not null default 'Bmis1815'
);

-- Booth heartbeat: one row per booth, upserted every 30 seconds
create table if not exists booth_status (
  booth     integer primary key check (booth between 1 and 20),
  last_seen timestamptz not null default now()
);

-- Per-booth role assignment: if a booth has no rows here it votes for ALL roles
create table if not exists booth_roles (
  booth   integer not null check (booth between 1 and 20),
  role_id integer not null references roles(id) on delete cascade,
  primary key (booth, role_id)
);


-- ── 2. SEED DATA ─────────────────────────────

-- Insert the single settings row (default: election closed, 6 booths, password Bmis1815)
insert into election_settings (id, voting_open, booth_count, admin_password, booth_password)
values (1, false, 6, 'Bmis1815', 'Bmis1815')
on conflict (id) do nothing;


-- ── 3. ROW LEVEL SECURITY ────────────────────

alter table roles             enable row level security;
alter table candidates        enable row level security;
alter table votes             enable row level security;
alter table election_settings enable row level security;
alter table booth_status      enable row level security;
alter table booth_roles       enable row level security;

-- roles
create policy "roles_select" on roles for select using (true);
create policy "roles_insert" on roles for insert with check (true);
create policy "roles_update" on roles for update using (true);
create policy "roles_delete" on roles for delete using (true);

-- candidates
create policy "candidates_select" on candidates for select using (true);
create policy "candidates_insert" on candidates for insert with check (true);
create policy "candidates_update" on candidates for update using (true);
create policy "candidates_delete" on candidates for delete using (true);

-- votes
create policy "votes_select" on votes for select using (true);
create policy "votes_insert" on votes for insert with check (true);
create policy "votes_delete" on votes for delete using (true);

-- election_settings
create policy "settings_select" on election_settings for select using (true);
create policy "settings_update" on election_settings for update using (true);

-- booth_status
create policy "booth_status_select" on booth_status for select using (true);
create policy "booth_status_insert" on booth_status for insert with check (true);
create policy "booth_status_update" on booth_status for update using (true);

-- booth_roles
create policy "booth_roles_select" on booth_roles for select using (true);
create policy "booth_roles_insert" on booth_roles for insert with check (true);
create policy "booth_roles_delete" on booth_roles for delete using (true);


-- ── 4. STORAGE ───────────────────────────────
-- Do this manually in the Supabase dashboard:
-- 1. Go to Storage in the left sidebar
-- 2. Click "New bucket"
-- 3. Name it exactly: candidate-photos
-- 4. Tick "Public bucket"
-- 5. Click Create
-- Then run these two policies in SQL Editor:
--
-- create policy "photos_select" on storage.objects for select using (bucket_id = 'candidate-photos');
-- create policy "photos_insert" on storage.objects for insert with check (bucket_id = 'candidate-photos');


-- ── 5. REALTIME ──────────────────────────────
-- Enable realtime manually in the dashboard:
-- Database → Publications → supabase_realtime
-- Toggle ON: votes, booth_status, election_settings, roles, candidates