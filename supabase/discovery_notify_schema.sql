-- =============================================================
-- 通知（将来実装）用 設計スキーマ  discovery_notify_schema.sql
-- ※ 実送信（メール/LINE/Slack/カレンダー）は後日。現時点では未使用。
--   重複通知を防ぐための送信ログだけ先に定義しておく（任意・冪等）。
--   今すぐ実行する必要はありません。通知機能を実装する段階で適用してください。
-- =============================================================

create table if not exists notification_log (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references extracted_grant_candidates(id) on delete cascade,
  channel text,                 -- email / line / slack / calendar
  triggers text[] default '{}', -- high_affinity / deadline_soon / pre_application_ng / professional_check / new
  best_score int,
  status text default 'pending',-- pending / sent / failed / skipped
  error_message text,
  sent_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists idx_notiflog_candidate on notification_log (candidate_id);
create index if not exists idx_notiflog_status on notification_log (status);

alter table notification_log enable row level security;
do $$
begin
  execute 'drop policy if exists "allow_all_notification_log" on notification_log';
  execute 'create policy "allow_all_notification_log" on notification_log for all using (true) with check (true)';
end $$;
