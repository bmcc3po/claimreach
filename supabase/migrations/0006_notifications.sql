-- ============================================================================
-- ClaimReach — 0006: Internal staff notifications
-- Notify staff from the console; recipients see unread alerts.
-- ============================================================================

create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid references firms(id),
  sender      uuid references app_users(id),
  sender_name text,
  recipient   uuid references app_users(id),   -- null = broadcast to all internal
  lead_id     uuid references leads(id) on delete cascade,
  body        text not null,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists idx_notif_recipient on notifications(recipient, created_at desc);
create index if not exists idx_notif_unread on notifications(recipient) where read_at is null;

alter table notifications enable row level security;

-- Internal staff can read notifications addressed to them or broadcast (null recipient).
drop policy if exists notif_read on notifications;
create policy notif_read on notifications for select
  using ( is_internal() and (recipient = auth.uid() or recipient is null) );

-- Internal staff can send notifications.
drop policy if exists notif_insert on notifications;
create policy notif_insert on notifications for insert
  with check ( is_internal() );

-- Recipients can mark their own as read.
drop policy if exists notif_update on notifications;
create policy notif_update on notifications for update
  using ( is_internal() and (recipient = auth.uid() or recipient is null) );
