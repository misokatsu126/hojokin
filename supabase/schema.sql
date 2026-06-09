-- =============================================================
-- 補助金・助成金レーダー  Supabase スキーマ
-- Supabase の SQL Editor に貼り付けて実行してください。
-- MVP 用に RLS は「全許可」ポリシーです。本番では認証に合わせて見直してください。
-- =============================================================

create extension if not exists "pgcrypto";

-- updated_at 自動更新トリガ
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------------- grants（補助金・助成金） ----------------
create table if not exists grants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  grant_type text,
  organization text,
  org_type text,
  regions text[] default '{}',
  industries text[] default '{}',
  entity_types text[] default '{}',
  target_audience text,
  expense_categories text[] default '{}',
  subsidy_rate text,
  min_amount bigint,
  max_amount bigint,
  application_start date,
  application_deadline date,
  recruitment_status text,
  application_method text,
  required_documents text,
  official_url text,
  guideline_pdf_url text,
  notes text,
  pre_application_ng boolean default false,
  requires_professional boolean default false,
  keywords text[] default '{}',
  purposes text[] default '{}',
  exclusion_conditions text,
  early_termination_risk boolean default false,
  selection_type text,
  difficulty text,
  source text,
  fetched_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_grants_deadline on grants (application_deadline);
create index if not exists idx_grants_purposes on grants using gin (purposes);
create index if not exists idx_grants_regions on grants using gin (regions);

-- ---------------- business_profiles（事業プロフィール） ----------------
create table if not exists business_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  entity_type text,
  location text,
  regions text[] default '{}',
  industries text[] default '{}',
  description text,
  purposes text[] default '{}',
  expenses text[] default '{}',
  keywords text[] default '{}',
  exclude_keywords text[] default '{}',
  desired_amount bigint,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------- watch_conditions（監視条件・プロフィールに紐づく） ----------------
create table if not exists watch_conditions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references business_profiles(id) on delete cascade,
  regions text[] default '{}',
  industries text[] default '{}',
  entity_types text[] default '{}',
  purposes text[] default '{}',
  keywords text[] default '{}',
  exclude_keywords text[] default '{}',
  expense_categories text[] default '{}',
  max_amount bigint,
  recruitment_status text,
  deadline_condition text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_watch_profile on watch_conditions (profile_id);

-- ---------------- grant_matches（補助金 × 事業 の判定結果） ----------------
create table if not exists grant_matches (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid references grants(id) on delete cascade,
  profile_id uuid references business_profiles(id) on delete cascade,
  match_score int default 0,
  recommendation text,
  status text,
  matched_reasons text[] default '{}',
  possible_uses text[] default '{}',
  eligible_expenses text[] default '{}',
  exclusion_risks text[] default '{}',
  deadline_warning text,
  pre_application_warning text,
  next_actions text[] default '{}',
  professional_consultation_needed boolean default false,
  summary text,
  engine text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (grant_id, profile_id)
);
create index if not exists idx_matches_grant on grant_matches (grant_id);
create index if not exists idx_matches_profile on grant_matches (profile_id);
create index if not exists idx_matches_score on grant_matches (match_score desc);

-- ---------------- alerts（補助金 × 事業 単位のアラート） ----------------
create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid references grants(id) on delete cascade,
  profile_id uuid references business_profiles(id) on delete cascade,
  alert_type text,
  match_score int,
  message text,
  is_read boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_alerts_grant on alerts (grant_id);
create index if not exists idx_alerts_type on alerts (alert_type);
create index if not exists idx_alerts_unread on alerts (is_read);

-- ---------------- application_statuses（申請進捗・補助金 × 事業 単位） ----------------
create table if not exists application_statuses (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid references grants(id) on delete cascade,
  profile_id uuid references business_profiles(id) on delete cascade,
  status text default '未確認',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (grant_id, profile_id)
);
create index if not exists idx_status_grant on application_statuses (grant_id);

-- ---------------- status_notes（ステータス変更メモ） ----------------
create table if not exists status_notes (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid references grants(id) on delete cascade,
  profile_id uuid references business_profiles(id) on delete cascade,
  status text,
  note text not null,
  created_at timestamptz default now()
);
create index if not exists idx_notes_grant_profile on status_notes (grant_id, profile_id);

-- ---------------- ai_search_logs（自然文AI検索の履歴） ----------------
create table if not exists ai_search_logs (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  interpreted_conditions jsonb,
  result_count int default 0,
  created_at timestamptz default now()
);

-- ---------------- admin_users（管理者・将来の認証用スタブ） ----------------
create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------- updated_at トリガ ----------------
drop trigger if exists trg_grants_updated on grants;
create trigger trg_grants_updated before update on grants for each row execute function set_updated_at();
drop trigger if exists trg_profiles_updated on business_profiles;
create trigger trg_profiles_updated before update on business_profiles for each row execute function set_updated_at();
drop trigger if exists trg_watch_updated on watch_conditions;
create trigger trg_watch_updated before update on watch_conditions for each row execute function set_updated_at();
drop trigger if exists trg_matches_updated on grant_matches;
create trigger trg_matches_updated before update on grant_matches for each row execute function set_updated_at();
drop trigger if exists trg_alerts_updated on alerts;
create trigger trg_alerts_updated before update on alerts for each row execute function set_updated_at();
drop trigger if exists trg_status_updated on application_statuses;
create trigger trg_status_updated before update on application_statuses for each row execute function set_updated_at();
drop trigger if exists trg_admin_updated on admin_users;
create trigger trg_admin_updated before update on admin_users for each row execute function set_updated_at();

-- ---------------- RLS（MVP：全許可。本番では要見直し） ----------------
alter table grants enable row level security;
alter table business_profiles enable row level security;
alter table watch_conditions enable row level security;
alter table grant_matches enable row level security;
alter table alerts enable row level security;
alter table application_statuses enable row level security;
alter table status_notes enable row level security;
alter table ai_search_logs enable row level security;
alter table admin_users enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'grants','business_profiles','watch_conditions','grant_matches',
    'alerts','application_statuses','status_notes','ai_search_logs','admin_users'
  ] loop
    execute format('drop policy if exists "allow_all_%1$s" on %1$s;', t);
    execute format('create policy "allow_all_%1$s" on %1$s for all using (true) with check (true);', t);
  end loop;
end $$;
