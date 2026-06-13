-- =============================================================
-- 支出案件（Spending Project）保存テーブル  spending_projects_schema.sql
--   これまで案件はブラウザの localStorage に保存していたが、
--   別PC・社内共有・管理者確認・履歴のため Supabase に保存できるようにする。
--   ※ このツールは社内利用（匿名キー直）。RLS は allow_all（ログイン不要）。
--   ※ 冪等：何度実行しても安全（create if not exists / drop policy if exists）。
--   Supabase の SQL エディタに貼り付けて実行してください。
-- =============================================================

create table if not exists spending_projects (
  id text primary key,                       -- アプリ側で発行した案件ID（uuid 文字列等）
  name text default '',
  purpose text default '',
  uses jsonb default '[]'::jsonb,            -- 用途タグ
  store text default '',
  location text default '',
  entity text default '',
  industry text default '',
  employees int,                             -- 従業員数（未入力は null）
  budget bigint,                             -- 予算（円。未入力は null）
  schedule text default '',
  order_status text default 'none',          -- none/estimate/contract/ordered/paid
  app_status text default 'considering',     -- considering/preparing/applied/approved/implementing/reported/received
  owner text default '',                     -- 利用者ID（社内で個人スペースを分ける簡易方式）
  urgency text default 'mid',                -- low/mid/high
  memo text default '',
  checklist jsonb default '{}'::jsonb,       -- 申請準備チェック
  template_key text default '',
  answers jsonb default '{}'::jsonb,         -- テンプレ固有の回答
  core_checks jsonb default '{}'::jsonb,     -- 定番制度の確認済み／対象外
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 一覧の並び（新しい更新順）用
create index if not exists idx_spending_projects_updated on spending_projects (updated_at desc);

-- 既存テーブルに後から列を足しても壊れないよう、念のため補完（冪等）
alter table spending_projects add column if not exists uses jsonb default '[]'::jsonb;
alter table spending_projects add column if not exists checklist jsonb default '{}'::jsonb;
alter table spending_projects add column if not exists answers jsonb default '{}'::jsonb;
alter table spending_projects add column if not exists core_checks jsonb default '{}'::jsonb;
alter table spending_projects add column if not exists template_key text default '';
alter table spending_projects add column if not exists app_status text default 'considering';
alter table spending_projects add column if not exists owner text default '';
create index if not exists idx_spending_projects_owner on spending_projects (owner);

alter table spending_projects enable row level security;
do $$
begin
  execute 'drop policy if exists "allow_all_spending_projects" on spending_projects';
  execute 'create policy "allow_all_spending_projects" on spending_projects for all using (true) with check (true)';
end $$;
