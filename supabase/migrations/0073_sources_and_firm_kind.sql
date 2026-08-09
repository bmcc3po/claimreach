-- ============================================================================
-- 0073 CLIENTS, SOURCES, AND ONE SLUG CONVENTION
--
-- Three things this fixes.
--
-- 1. Innovative Intake is not a client. It is the intake center, and it does
--    some marketing, so it belongs in sources. It cannot simply be deleted:
--    firms is referenced by app_users, campaigns, leads, claims, retainers,
--    bulletins and the template intake_forms, and the Innovative row owns
--    internal staff and the form templates. So it is marked internal and gains
--    a matching source row. Internal firms never reach the console picker or
--    client-facing reporting.
--
-- 2. The marketer that brought a client is its own fact, not part of the
--    client's name. Encoding it in the slug (123-abc) puts two facts in one
--    string, so "everything 123 brought us" stops being a query and ending the
--    relationship changes the client's identifier. 0069 added firms.source as
--    free text; this promotes it to a real reference.
--
-- 3. Slugs are the identifier shown on files, exports and the portal, so they
--    read as the firm is actually called. 'west-loop-law' becomes 'wll',
--    matching TMP, TMT and ROTH.
--
-- Idempotent.
-- ============================================================================

-- ---------------------------------------------------------------- sources
create table if not exists sources (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  kind        text not null default 'marketer',   -- marketer | internal | referral | other
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table sources is
  'Where clients come from. A marketer that brings a law firm is a source, never a client row.';

insert into sources (slug, name, kind)
values ('innovative-intake', 'Innovative Intake LLC', 'internal')
on conflict (slug) do update set name = excluded.name, kind = excluded.kind;

-- ---------------------------------------------------------------- firm kind
alter table firms add column if not exists kind text not null default 'client';
alter table firms add column if not exists source_id uuid references sources(id);

comment on column firms.kind is
  'client = a law firm we take intake for. internal = us. Only clients reach the console picker.';
comment on column firms.source_id is
  'The source that brought this client. Separate from the slug on purpose.';

update firms set kind = 'internal' where slug in ('innovative-intake', 'innovative intake');

-- Carry any free-text source written by 0069 onto the real reference, then the
-- text column stops being the place anyone reads from.
update firms f set source_id = s.id
  from sources s
 where f.source is not null and lower(f.source) = lower(s.name) and f.source_id is null;

-- ---------------------------------------------------------------- slugs
-- Rename before anything references these. Cheap now, painful once files,
-- exports and portal logins carry the old value.
update firms set slug = 'wll'  where slug = 'west-loop-law';
update firms set slug = 'inno' where slug = 'innovative-intake';

-- Names follow the slug, so the rename does not leave stale campaign names.
update campaigns c
   set name = upper(f.slug) || ' ' ||
              coalesce(
                (select r.label from case_type_registry r where r.key = c.case_type),
                initcap(replace(c.case_type, '_', ' '))
              )
  from firms f
 where f.id = c.firm_id;

-- ---------------------------------------------------------------- verify
select upper(slug) as slug, name, kind, venue_states,
       (select count(*) from campaigns c where c.firm_id = f.id and c.active) as active_campaigns
  from firms f
 order by kind, slug;

select slug, name, kind from sources order by slug;
