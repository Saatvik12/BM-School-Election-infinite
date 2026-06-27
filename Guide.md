# BMIS Election System — Complete Guide

This guide covers everything: setting up the app from scratch, running an election, and a full reference of every feature.

---

## Table of Contents

1. [What This App Does](#1-what-this-app-does)
2. [Tech Stack](#2-tech-stack)
3. [First Time Setup](#3-first-time-setup)
4. [Setting Up an Election](#4-setting-up-an-election)
5. [On Election Day](#5-on-election-day)
6. [Admin Dashboard — Full Reference](#6-admin-dashboard--full-reference)
7. [Voting Booth — Full Reference](#7-voting-booth--full-reference)
8. [Accounts & Passwords](#8-accounts--passwords)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. What This App Does

This is a digital voting system built for school elections. Students walk up to a laptop, vote for candidates across one or more roles (e.g. SPL, ASPL), and their vote is recorded instantly. The admin sees live results on a separate device.

Key features at a glance:
- Up to 20 voting booths, each a separate laptop
- Votes sync to the cloud in real time
- Offline mode: votes save locally if internet drops and sync later
- Admin can manage roles, candidates, and photos without touching code
- Live results with per-candidate bar charts and booth-wise breakdowns
- CSV export of all votes
- Booth heartbeat monitor so admin can see which booths are online

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js (React) |
| Database | Supabase (Postgres) |
| File Storage | Supabase Storage |
| Hosting | Vercel |

You do not need to understand these to use the app. You only need accounts on Supabase and Vercel.

---

## 3. First Time Setup

Follow these steps exactly, in order.

---

### Step 1 — Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up or log in
2. Click **New Project**
3. Fill in:
   - **Project name:** anything you like (e.g. `bmis-elections`)
   - **Database password:** choose something strong and save it — you won't need it often but don't lose it
   - **Region:** Southeast Asia (Singapore) — closest to India
4. Click **Create new project** and wait about 2 minutes

---

### Step 2 — Run the SQL Setup

This creates all the database tables the app needs.

1. In your Supabase project, click **SQL Editor** in the left sidebar
2. Click **New query**
3. Open the file `supabase-setup.sql` from the project folder
4. Copy the entire contents and paste it into the SQL Editor
5. Click **Run**
6. You should see "Success. No rows returned" — this means it worked

---

### Step 3 — Set Up Photo Storage

Candidate photos are stored in Supabase Storage.

1. In the left sidebar click **Storage**
2. Click **New bucket**
3. Name it exactly: `candidate-photos`
4. Tick **Public bucket**
5. Click **Create bucket**
6. Now go to **SQL Editor** and run these two lines:

```sql
create policy "photos_select" on storage.objects for select using (bucket_id = 'candidate-photos');
create policy "photos_insert" on storage.objects for insert with check (bucket_id = 'candidate-photos');
```

---

### Step 4 — Enable Realtime

This makes the admin dashboard update live without refreshing.

1. In the left sidebar click **Database → Publications**
2. Click on the **0 tables** at the end of the **supabase_realtime** row
3. Toggle ON all of these tables:
   - `votes`
   - `booth_status`
   - `election_settings`
   - `roles`
   - `candidates`

---

### Step 5 — Get Your API Keys

1. In the left sidebar click **Project overview** (home icon at the top left)
2. Click **copy** and copy **project url**(You wil need it in the next step)
3. In the left sidebar click **Project settings** (gear icon at the bottom left)
4. Click on **API keys** and go to **Legacy anon, service_role API keys** tab in it
3. Copy the anon public key — you will need it in the next step:
   - **anon public key** — a very long text starting with `eyJ...`

---

### Step 6 — Deploy to Vercel

1. Push the project folder to a GitHub repository
2. Go to [vercel.com](https://vercel.com) and sign up or log in (with github preferably)
3. Click **Add New → Project**
4. Find your GitHub repo and click **Import**
5. Before clicking Deploy, scroll down to **Environment Variables** and add:

| Name                            | Value                        |
|---------------------------------|------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`      | your Project URL from Step 5 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your anon key from Step 5    |

6. Click **Deploy**
7. After a minute or two, Vercel gives you a URL like `https://your-app.vercel.app`

That URL is your app. Open it on any device to use it.

---

### Step 7 — Change the Default Password

The default password for all logins is `Bmis1815`. Change it before using the app for a real election.

1. Open the app URL and log in as:
   - **Username:** `Admin`
   - **Password:** `Bmis1815`
2. Go to **Settings tab**
3. Under **Change Passwords**, update both the admin password and the booth password
4. Save each one

---

## 4. Setting Up an Election

**Do this before election day from the Admin Dashboard.**

---

### Step 1 — Add Voting Roles

A role is what you are voting for — e.g. SPL, ASPL, House Captain.

1. Log in as Admin
2. Go to the **Candidates tab**
3. Under **Voting Roles**, click **+ Add Role**
4. Type the role name and press Add
5. Repeat for each role
6. Roles appear in the order you add them — this is also the order students vote in

---

### Step 2 — Add Candidates

1. Still in the **Candidates tab**, scroll down
2. You will see a section for each role you created
3. Click **+ Add Candidate** under the relevant role
4. Type the candidate's name
5. Click **📷 Add Photo** to upload their photo (optional but recommended)
6. Click **Add Candidate**
7. Repeat for all candidates

To edit a candidate's name or photo later, click **✏️ Edit** on their card.
To remove a candidate, click **🗑** on their card.

---

### Step 3 — Set Number of Booths

1. Go to the **Booths tab**
2. Under **Number of Voting Booths**, click the number of booths you will use (1–10)
3. Click **Save**

Only that many booths will be allowed to log in. For example if you set 4, only `VotingBooth1` through `VotingBooth4` will work.

---

### Step 4 — Assign Roles to Booths (Optional)

By default every booth votes for all roles. If you want certain booths to only vote for specific roles:

1. Still in the **Booths tab**, find the booth card
2. Click **✏️ Edit Roles**
3. Check or uncheck the roles for that booth
4. Click **Save**

---

### Step 5 — Clear Test Votes

If you did any test votes during setup, clear them before the real election:

1. Go to **Settings tab**
2. Under **Reset Votes**, click **Reset All Votes**
3. Type `RESET` when prompted
4. Enter your admin password
5. All votes are deleted

---

## 5. On Election Day

---

### Opening the Election

1. Log in as Admin on the supervisor's device
2. Go to **Settings tab**
3. Click **🔓 Open Election**
4. This instantly enables voting on all booths

---

### Setting Up Each Booth

On each voting laptop:

1. Open the app URL in a browser
2. Log in with:
   - **Username:** `VotingBooth1` (replace 1 with the booth number)
   - **Password:** your booth password
3. The welcome screen appears — the booth is ready
4. Leave the browser open. The booth stays logged in all day between voters

---

### How a Student Votes

1. Student walks up to the booth
2. Supervisor clicks **Proceed to Voting**
3. Student selects their candidate for the first role — the card highlights in purple
4. Student clicks **Confirm** to move to the next role
5. Repeat for each role
6. After the last role is confirmed, the vote is submitted
7. A beep plays and the success screen appears for 3 seconds
8. The booth automatically returns to the welcome screen for the next student

Students can go back and change their selection before confirming. Once they click Confirm on the last role the vote is final.

---

### Closing the Election

1. Admin goes to **Settings tab**
2. Click **🔒 Close Election**
3. All booths immediately show "Election is currently closed"

---

### Exporting Results

1. Admin goes to **Settings tab**
2. Click **📥 Export CSV**
3. A file downloads with timestamp, booth number, and each candidate selected

---

## 6. Admin Dashboard — Full Reference

Log in with username `Admin` and your admin password.

---

### Results Tab

Shows live vote counts updating in real time.

- **Per-role results** — bar chart for each role showing votes and percentage per candidate
- **Booth-wise breakdown** — click the arrow on any role to expand a table showing how many votes each candidate got from each booth
- **Stats row at top** — total voters, total vote records, active roles, active booths

---

### Booths Tab

Monitor and configure all voting booths.

**Number of Voting Booths**
- Buttons 1–10 to select how many booths are active
- Only booths within this number can log in
- Click Save after changing

**Booth Cards**
Each booth shows:
- ❤️ Active or ⚠️ Offline status (a booth is offline if no heartbeat in the last 60 seconds)
- Last seen time
- Number of voters from that booth
- Which roles it is assigned to vote for
- **✏️ Edit Roles** button to change role assignment

---

### Candidates Tab

Manage everything about roles and candidates without touching code.

**Voting Roles section**
- **+ Add Role** — create a new voting role
- **✏️ Edit** — rename a role
- **🗑 Delete** — removes the role and all its candidates

**Candidates section (one per role)**
- **+ Add Candidate** — add a candidate with name and optional photo
- **✏️ Edit** — change name or update photo
- **🗑** — remove a candidate

Changes take effect on voting booths immediately.

---

### Settings Tab

**Election Status**
- Toggle voting open or closed
- Affects all booths instantly

**Change Passwords**
- Change the admin password (requires current admin password)
- Change the booth password (requires admin password to confirm)
- Admin and booth passwords can be different

**Export Data**
- Downloads a CSV file of all votes
- Columns: Timestamp, Booth, and one column per role

**Reset Votes**
- Deletes all votes from the database
- Requires typing RESET and then entering admin password
- Use before a real election to clear test votes

---

## 7. Voting Booth — Full Reference

Log in with `VotingBooth1` through `VotingBooth6` (or however many are active) and the booth password.

---

### Welcome Screen

- Shows the election title and booth number
- Shows how many votes have been recorded on this device today
- Shows which roles will be voted for
- **Proceed to Voting** button starts the voting flow for the next student

---

### Voting Flow

- One screen per role, with a slide animation between steps
- Progress bar at the top shows which step the student is on
- Clicking a candidate highlights their card in purple
- A **Confirm** button appears showing the selected candidate's name
- Student must click Confirm to proceed — clicking the wrong candidate by mistake is safe
- Back button available on every step to go back and change a selection
- On the final role, the Confirm button says **Submit Vote**

---

### Loading Screen

Appears while the vote is being saved. All buttons are disabled during this time to prevent double voting.

---

### Success Screen

- Shows "Vote Recorded — Thank you for voting"
- Shows a summary of what was voted for
- A beep plays so supervisors nearby know the vote went through
- Automatically returns to the welcome screen after 3 seconds

---

### Election Closed Screen

If the admin closes the election, all booths immediately show this screen. Includes a Sign Out button.

---

### ⚙ Settings (Booth Settings Panel)

Access by clicking **⚙ Settings** in the top bar. Requires the admin password.

**Stats**
- Total votes recorded locally on this device
- How many have synced to the database
- How many are waiting to sync

**Sync Control**
- 🟢 Sync Enabled — votes go to the database in real time
- 🟡 Sync Disabled (Offline Mode) — votes save locally only, queued to sync later
- **Sync Now** button manually uploads all queued votes
- When sync is off, a yellow banner appears across the top of the booth screen
- Queued votes automatically retry every 30 seconds when sync is back on

**Local Vote Tally**
- Shows vote counts recorded on this device alone, per role
- Useful as a backup count independent of the database

**Role Assignment**
- Change which roles this booth votes for without going to the admin dashboard
- Select all to vote for every role

**Reset Votes for This Booth**
- Choose to delete this booth's votes from the database, from local storage, or both
- Requires admin password

---

## 8. Accounts & Passwords

| Account | Username | Password |
|---------|----------|----------|
| Admin | `Admin` | set in Settings tab |
| Booth 1 | `VotingBooth1` | set in Settings tab |
| Booth 2 | `VotingBooth2` | set in Settings tab |
| ... | ... | ... |
| Booth N | `VotingBoothN` | set in Settings tab |

- Default password for all accounts on a fresh setup: `Bmis1815`
- Admin and booth passwords can be changed independently from Settings
- Booth sessions persist all day — supervisors log in once at the start, students don't need to log in between votes

---

## 9. Troubleshooting

**Candidates not showing on the voting screen**
→ Check that the candidates are set to active in the Candidates tab
→ Check that the booth is assigned to vote for the correct roles

**Votes not appearing in admin results**
→ Check that Realtime is enabled for the `votes` table in Supabase → Database → Publications

**Build failing on Vercel**
→ Make sure both environment variables (`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`) are set correctly in Vercel → Project Settings → Environment Variables

**Photo upload failing**
→ Make sure the `candidate-photos` bucket exists in Supabase Storage and is set to Public
→ Make sure the two storage policies were created (see Step 3 of setup)

**Booth showing as Offline in admin**
→ The booth hasn't sent a heartbeat in over 60 seconds
→ Check that the booth laptop is still on the voting screen and has internet
→ The heartbeat sends automatically every 30 seconds when the booth is active

**Password change saying current password is incorrect**
→ Make sure you ran the SQL to add `admin_password` and `booth_password` columns to `election_settings`
→ Check the current value directly in Supabase → Table Editor → election_settings

**Votes saving locally but not syncing**
→ Open booth settings (⚙) and check if Sync is disabled
→ Click Sync Now to manually upload queued votes
→ Check internet connection on the booth laptop

**Election closed screen not going away after admin opens election**
→ The booth subscribes to real-time updates — check that `election_settings` is enabled in Supabase Realtime
→ Refresh the booth browser as a fallback

---

*Built for BMIS school elections. Designed to be handed over to juniors each year with no code changes required.*
