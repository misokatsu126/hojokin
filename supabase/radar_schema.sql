-- =============================================================
-- 補助金・助成金 自動探索レーダー  追加スキーマ（拡張用・後付け）
-- 既存の schema.sql とは独立しています。schema.sql を実行済みの
-- データベースに対して、この SQL を SQL Editor で追加実行してください。
-- 何度実行しても安全（冪等）です。
--
-- 設計思想：
--   - AI が無制限にネットを探すのではなく、信頼できる情報源を登録し巡回する。
--   - 民間紹介サイト等の二次情報は「未確認候補」として保存し、
--     公式URL / 公募要領PDF を確認できたものだけを正式な grants に登録する。
--   - MVP では自動巡回は実装しないが、将来追加しやすいよう型・テーブルを用意する。
-- MVP 用に RLS は「全許可」ポリシーです。本番では認証に合わせて見直してください。
-- =============================================================

create extension if not exists "pgcrypto";

-- set_updated_at() は schema.sql で定義済み。未実行環境でも動くよう保険で再定義。
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------------- source_sites（監視対象サイト＝情報源） ----------------
-- source_type: official / semi_official / aggregator / professional_article / news / unknown
-- trust_level: A / B / C / D / E
-- priority: high / medium / low
-- crawl_frequency: daily / weekly / monthly
create table if not exists source_sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_type text default 'unknown',
  trust_level text default 'E',
  url text,
  region text,
  priority text default 'medium',
  crawl_frequency text default 'weekly',
  is_active boolean default true,
  last_checked_at timestamptz,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_source_sites_type on source_sites (source_type);
create index if not exists idx_source_sites_active on source_sites (is_active);

-- ---------------- source_fetch_logs（巡回ログ・将来の自動巡回用） ----------------
-- status: success / error / skipped
create table if not exists source_fetch_logs (
  id uuid primary key default gen_random_uuid(),
  source_site_id uuid references source_sites(id) on delete cascade,
  fetched_at timestamptz default now(),
  status text default 'success',
  http_status int,
  error_message text,
  detected_count int default 0,
  created_at timestamptz default now()
);
create index if not exists idx_fetch_logs_site on source_fetch_logs (source_site_id);
create index if not exists idx_fetch_logs_fetched on source_fetch_logs (fetched_at desc);

-- ---------------- discovered_items（自動/手動で検知した補助金候補） ----------------
-- detection_type: new / updated / deadline_changed / pdf_added / closed / unknown
-- status: unreviewed / candidate / imported / ignored / rejected
-- verification_status: unverified / official_found / needs_review / verified / rejected
create table if not exists discovered_items (
  id uuid primary key default gen_random_uuid(),
  source_site_id uuid references source_sites(id) on delete set null,
  title text,
  url text,
  detected_at timestamptz default now(),
  raw_text text,
  raw_html text,
  pdf_url text,
  detection_type text default 'new',
  status text default 'unreviewed',
  source_category text,
  trust_level text,
  original_source_url text,
  official_url text,
  official_pdf_url text,
  official_source_confirmed boolean default false,
  source_warning text,
  last_verified_at timestamptz,
  verification_status text default 'unverified',
  duplicate_of uuid references discovered_items(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_discovered_source on discovered_items (source_site_id);
create index if not exists idx_discovered_status on discovered_items (status);
create index if not exists idx_discovered_verification on discovered_items (verification_status);
create index if not exists idx_discovered_detected on discovered_items (detected_at desc);

-- ---------------- extracted_grant_candidates（AI/ルールで抽出・正規化した候補） ----------------
-- grant_type: 補助金 / 助成金 / 給付金 / 支援金 / その他
-- verification_status: unverified / official_found / needs_review / verified / rejected
create table if not exists extracted_grant_candidates (
  id uuid primary key default gen_random_uuid(),
  discovered_item_id uuid references discovered_items(id) on delete cascade,
  name text,
  grant_type text,
  organizer text,
  target_regions text[] default '{}',
  target_industries text[] default '{}',
  target_business_types text[] default '{}',
  target_people text,
  eligible_expenses text[] default '{}',
  subsidy_rate text,
  max_amount bigint,
  min_amount bigint,
  application_start_date date,
  deadline date,
  application_status text,
  application_method text,
  required_documents text,
  official_url text,
  official_pdf_url text,
  notes text,
  pre_application_ng_risk boolean default false,
  professional_check_recommended boolean default false,
  confidence_score int default 0,
  missing_fields text[] default '{}',
  source_category text,
  trust_level text,
  verification_status text default 'unverified',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_extracted_discovered on extracted_grant_candidates (discovered_item_id);
create index if not exists idx_extracted_verification on extracted_grant_candidates (verification_status);

-- ---------------- import_reviews（人間による確認・承認履歴） ----------------
-- review_status: pending / approved / rejected / needs_more_info
create table if not exists import_reviews (
  id uuid primary key default gen_random_uuid(),
  extracted_grant_candidate_id uuid references extracted_grant_candidates(id) on delete cascade,
  reviewer_name text,
  review_status text default 'pending',
  review_note text,
  approved_grant_id uuid references grants(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_reviews_candidate on import_reviews (extracted_grant_candidate_id);
create index if not exists idx_reviews_status on import_reviews (review_status);

-- ---------------- updated_at トリガ ----------------
drop trigger if exists trg_source_sites_updated on source_sites;
create trigger trg_source_sites_updated before update on source_sites for each row execute function set_updated_at();
drop trigger if exists trg_discovered_updated on discovered_items;
create trigger trg_discovered_updated before update on discovered_items for each row execute function set_updated_at();
drop trigger if exists trg_extracted_updated on extracted_grant_candidates;
create trigger trg_extracted_updated before update on extracted_grant_candidates for each row execute function set_updated_at();
drop trigger if exists trg_reviews_updated on import_reviews;
create trigger trg_reviews_updated before update on import_reviews for each row execute function set_updated_at();

-- ---------------- RLS（MVP：全許可。本番では要見直し） ----------------
alter table source_sites enable row level security;
alter table source_fetch_logs enable row level security;
alter table discovered_items enable row level security;
alter table extracted_grant_candidates enable row level security;
alter table import_reviews enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'source_sites','source_fetch_logs','discovered_items',
    'extracted_grant_candidates','import_reviews'
  ] loop
    execute format('drop policy if exists "allow_all_%1$s" on %1$s;', t);
    execute format('create policy "allow_all_%1$s" on %1$s for all using (true) with check (true);', t);
  end loop;
end $$;
