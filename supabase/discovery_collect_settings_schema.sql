-- =============================================================
-- 収集設定（キーワード・対象地域）  discovery_collect_settings_schema.sql
-- 既存SQLは編集していません。実行済みDBに追加実行してください（冪等）。
--
-- 目的：Jグランツ等の収集で使うキーワード・対象地域を画面から調整できるようにする。
--   1行だけ使う想定（先頭行を設定として読む）。未設定ならコード既定値を使用。
-- =============================================================

create table if not exists collect_settings (
  id uuid primary key default gen_random_uuid(),
  keywords text[] default '{}',
  regions text[] default '{}',
  updated_at timestamptz default now()
);

alter table collect_settings enable row level security;
do $$
begin
  execute 'drop policy if exists "allow_all_collect_settings" on collect_settings';
  execute 'create policy "allow_all_collect_settings" on collect_settings for all using (true) with check (true)';
end $$;
