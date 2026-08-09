-- ============================================================================
-- ClaimReach — 0005: Bulletin boards (role-gated) + categorized claim notes
-- ============================================================================

-- Board definitions with who-can-post roles (data-driven, editable).
create table if not exists boards (
  id          text primary key,             -- 'general' / 'firm_msg' / 'floor_notes'
  firm_id     uuid references firms(id),    -- null = operator-global board
  title       text not null,
  description text,
  post_roles  text[] not null default '{owner,admin}',  -- roles allowed to post
  sort_order  int not null default 0
);

-- Bulletins (posts) on a board.
create table if not exists bulletins (
  id          uuid primary key default gen_random_uuid(),
  board_id    text not null references boards(id),
  firm_id     uuid references firms(id),
  author      uuid references app_users(id),
  author_name text,
  title       text,
  body        text not null,
  pinned      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_bulletins_board on bulletins(board_id, created_at desc);

-- Categorized notes on a claim/file.
create table if not exists claim_notes (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid not null references firms(id),
  lead_id     uuid references leads(id) on delete cascade,
  claim_id    uuid references claims(id) on delete cascade,
  author      uuid references app_users(id),
  author_name text,
  category    text not null default 'general',  -- claimant_request / obo_note / claim_update / general / flag
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_cnotes_lead on claim_notes(lead_id, created_at desc);

-- Seed the three boards with their posting roles.
insert into boards (id, title, description, post_roles, sort_order) values
  ('general',     'General Case Updates', 'Team-wide case updates and info.', '{owner,admin,agent,qa}', 1),
  ('firm_msg',    'Message from the Firm', 'Posts from firm staff.',           '{firm,owner}',           2),
  ('floor_notes', 'Floor Notes',           'Floor manager announcements.',     '{owner}',                3)
on conflict (id) do update set
  title = excluded.title, description = excluded.description,
  post_roles = excluded.post_roles, sort_order = excluded.sort_order;

-- RLS
alter table boards      enable row level security;
alter table bulletins   enable row level security;
alter table claim_notes enable row level security;

-- Boards: everyone authenticated can read; only internal can change definitions.
drop policy if exists boards_read on boards;
create policy boards_read on boards for select using ( auth.uid() is not null );
drop policy if exists boards_internal_write on boards;
create policy boards_internal_write on boards for all
  using ( is_internal() ) with check ( is_internal() );

-- Bulletins: internal full; firm reads firm_msg + their firm scope.
drop policy if exists bull_internal_all on bulletins;
create policy bull_internal_all on bulletins for all
  using ( is_internal() ) with check ( is_internal() );
drop policy if exists bull_read on bulletins;
create policy bull_read on bulletins for select
  using ( auth.uid() is not null );
-- Firm users may post only to boards whose post_roles include 'firm'.
drop policy if exists bull_firm_insert on bulletins;
create policy bull_firm_insert on bulletins for insert
  with check (
    role_is_firm()
    and exists (select 1 from boards b where b.id = board_id and 'firm' = any(b.post_roles))
  );

drop policy if exists cnotes_internal_all on claim_notes;
create policy cnotes_internal_all on claim_notes for all
  using ( is_internal() ) with check ( is_internal() );
drop policy if exists cnotes_firm_read on claim_notes;
create policy cnotes_firm_read on claim_notes for select using ( firm_id = my_firm_id() );
drop policy if exists cnotes_firm_insert on claim_notes;
create policy cnotes_firm_insert on claim_notes for insert with check ( firm_id = my_firm_id() );
