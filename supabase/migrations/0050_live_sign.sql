-- ============================================================================
-- 0050 LIVE SIGNING FROM THE INTAKE CONSOLE
-- send_packet normally refuses until Grievous has approved the file. That gate is
-- right for mass-tort files that go through QA before a retainer goes out, and
-- wrong for a live inbound call where the whole point is to sign while the client
-- is still on the phone.
--
-- Rather than fake a Grievous approval, campaigns opt in explicitly. Only a
-- campaign with allow_live_sign = true can have its retainer sent straight from
-- the console, and the audit trail records that it went out live on the call with
-- no prior QA.
-- Idempotent.
-- ============================================================================
alter table campaigns add column if not exists allow_live_sign boolean not null default false;

-- Where the file came from, so a console-originated sign is distinguishable from
-- a file that walked the normal QA path.
alter table leads add column if not exists origin text;
