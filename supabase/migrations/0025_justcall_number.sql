-- JustCall sending number (the FROM line) per account, required by the SMS API.
alter table justcall_accounts add column if not exists justcall_number text;
