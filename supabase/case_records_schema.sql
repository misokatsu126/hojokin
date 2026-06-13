-- =============================================================
-- 案件の実務記録（証憑・期限・公式確認ログ・AIタスク）保存テーブル  case_records_schema.sql
--   1案件＝1行に JSONB でまとめて保存（別PC・社内共有・端末を消しても残る）。
--   ※ 社内利用（匿名キー直）。RLS は allow_all。冪等。Supabase の SQL エディタで実行してください。
-- =============================================================

create table if not exists case_records (
  project_id text primary key,             -- spending_projects.id に対応
  owner text default '',                   -- 利用者ID（個人スペース分け）
  data jsonb default '{}'::jsonb,          -- { docs, deadlines, checkLogs, aiTasks }
  updated_at timestamptz default now()
);
create index if not exists idx_case_records_owner on case_records (owner);

alter table case_records enable row level security;
do $$
begin
  execute 'drop policy if exists "allow_all_case_records" on case_records';
  execute 'create policy "allow_all_case_records" on case_records for all using (true) with check (true)';
end $$;
