-- ClaimReach — 0020: file lock. A locked file is read-only until unlocked.
alter table leads add column if not exists is_locked boolean not null default false;
alter table leads add column if not exists locked_by uuid references app_users(id);
alter table leads add column if not exists locked_at timestamptz;
