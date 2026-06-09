-- =============================================================
-- 自動収集（4層）拡張用 追加スキーマ  discovery_collect_schema.sql
-- 既存の schema.sql / discovery_schema.sql は編集していません。
-- これらを実行済みのDBに、この SQL を SQL Editor で「追加実行」してください。
-- 何度実行しても安全（冪等：add column if not exists / create ... if not exists）。
--
-- 目的：
--   - Jグランツ API・公式ページ巡回・J-Net21・RSS 等から自動収集した候補を
--     discovered_items に重複なく蓄積するための列を追加する。
--   - 「事業者向け / 個人向け」をダッシュボードで切り替え表示するための区分を追加する。
-- MVP 用に RLS は既存と同じ「全許可」のまま（新規テーブルは無いのでRLS変更不要）。
-- =============================================================

-- ---- discovered_items への追加列 ----
-- audience_type: business（事業者向け）/ individual（個人向け）/ both（両方）/ unknown（不明）
alter table discovered_items add column if not exists audience_type text default 'unknown';
-- external_id: 外部ソースの一意キー（例 'jgrants:xxxx' / 'feed:<url>'）。
--   NULL は重複可（Postgres は UNIQUE 制約下で NULL を区別する）。
--   これにより onConflict='external_id' での upsert が安全に行える。
alter table discovered_items add column if not exists external_id text;
alter table discovered_items add column if not exists external_source text;
create unique index if not exists idx_discovered_external on discovered_items (external_id);
create index if not exists idx_discovered_audience on discovered_items (audience_type);

-- ---- extracted_grant_candidates への追加列 ----
alter table extracted_grant_candidates add column if not exists audience_type text default 'unknown';

-- ---- source_sites への追加列 ----
-- feed_url: RSS/Atom フィードのURL（あれば /api/discovery/feed で購読）
alter table source_sites add column if not exists feed_url text;
-- audience_scope: その情報源が主に扱う対象（business/individual/both/unknown）
alter table source_sites add column if not exists audience_scope text default 'both';
