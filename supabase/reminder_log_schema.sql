-- =============================================================
-- 案件リマインドの送信ログ  reminder_log_schema.sql
--   案件ベースの通知（締切14日前・発注前未確認 等）を実送信したとき、
--   同じ通知を何度も送らないための重複防止ログ。
--   ※ 冪等：何度実行しても安全。Supabase の SQL エディタで実行してください。
--   ※ 実送信は NOTIFICATION_ENABLED と送信先（LINE_USER_ID 等）の設定が必要。
-- =============================================================

create table if not exists reminder_log (
  id uuid primary key default gen_random_uuid(),
  project_id text,
  alert_key text not null,        -- projectId:kind（通知の識別子）
  kind text,                      -- pre_order / deadline_soon / gbizid ...
  channel text,                   -- line / slack / none
  status text default 'sent',     -- sent / failed
  sent_at timestamptz default now()
);
create index if not exists idx_reminder_log_key on reminder_log (alert_key, sent_at desc);

alter table reminder_log enable row level security;
do $$
begin
  execute 'drop policy if exists "allow_all_reminder_log" on reminder_log';
  execute 'create policy "allow_all_reminder_log" on reminder_log for all using (true) with check (true)';
end $$;
