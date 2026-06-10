-- =============================================================
-- Phase2: 公式ページ確認チェックリスト＋通知候補  discovery_phase2_schema.sql
-- 既存SQLは編集していません。実行済みDBに追加実行してください（冪等）。
-- MVP用に RLS は既存と同じ「全許可」。
-- =============================================================

-- ---------------- application_checklists（申請前の公式確認チェックリスト） ----------------
-- status: 未確認 / 確認中 / 申請候補 / 申請準備中 / 見送り
create table if not exists application_checklists (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid references grants(id) on delete cascade,
  discovered_item_id uuid references discovered_items(id) on delete cascade,
  profile_id uuid references business_profiles(id) on delete set null,
  checked_official_page boolean default false,
  checked_guideline boolean default false,
  checked_deadline boolean default false,
  checked_target_area boolean default false,
  checked_target_business boolean default false,
  checked_entity_type boolean default false,
  checked_eligible_expenses boolean default false,
  checked_subsidy_rate boolean default false,
  checked_subsidy_amount boolean default false,
  checked_pre_application_rule boolean default false,
  checked_required_documents boolean default false,
  checked_gbizid boolean default false,
  checked_estimates boolean default false,
  checked_application_method boolean default false,
  checked_budget_limit boolean default false,
  checked_contact boolean default false,
  memo text,
  status text default '未確認',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
-- 候補（discovered_item）1件につき1チェックリストにするための一意インデックス（NULLは重複可）
create unique index if not exists idx_checklist_discovered on application_checklists (discovered_item_id);
create index if not exists idx_checklist_grant on application_checklists (grant_id);

drop trigger if exists trg_checklist_updated on application_checklists;
create trigger trg_checklist_updated before update on application_checklists for each row execute function set_updated_at();

-- ---------------- notification_candidates（通知候補） ----------------
-- notification_type: new / high_match / deadline_30 / deadline_14 / deadline_7 / review_waiting
-- status: pending / sent / dismissed / failed
create table if not exists notification_candidates (
  id uuid primary key default gen_random_uuid(),
  discovered_item_id uuid references discovered_items(id) on delete cascade,
  grant_id uuid references grants(id) on delete cascade,
  profile_name text,
  notification_type text,
  title text,
  source text,
  source_url text,
  official_url text,
  match_score int,
  deadline date,
  message text,
  status text default 'pending',
  created_at timestamptz default now(),
  sent_at timestamptz
);
-- 同一候補×同一種別の重複生成を防ぐ
create unique index if not exists idx_notif_dedup on notification_candidates (discovered_item_id, notification_type);
create index if not exists idx_notif_status on notification_candidates (status);
create index if not exists idx_notif_created on notification_candidates (created_at desc);

-- ---------------- RLS（MVP：全許可） ----------------
alter table application_checklists enable row level security;
alter table notification_candidates enable row level security;
do $$
begin
  execute 'drop policy if exists "allow_all_application_checklists" on application_checklists';
  execute 'create policy "allow_all_application_checklists" on application_checklists for all using (true) with check (true)';
  execute 'drop policy if exists "allow_all_notification_candidates" on notification_candidates';
  execute 'create policy "allow_all_notification_candidates" on notification_candidates for all using (true) with check (true)';
end $$;
