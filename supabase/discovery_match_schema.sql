-- =============================================================
-- 収集候補×事業プロフィールの自動照合 追加  discovery_match_schema.sql
-- 既存SQLは編集していません。実行済みDBに追加実行してください（冪等）。
--
-- 目的：Cronで収集した discovered_items を、登録済みの事業プロフィールと自動照合し、
--   相性スコア等を保存する。これにより人手の「AI抽出」前でも、ダッシュボードで
--   高相性・締切間近を出せる。
--   - match_score: 全事業プロフィールに対する最高相性スコア(0-100)
--   - match_profile: 最も相性が良かった事業名
--   - match_recommendation: A/B/C/D
--   - extracted_deadline: 本文から推定した締切（締切間近判定用）
-- =============================================================

alter table discovered_items add column if not exists match_score int;
alter table discovered_items add column if not exists match_profile text;
alter table discovered_items add column if not exists match_recommendation text;
alter table discovered_items add column if not exists extracted_deadline date;
create index if not exists idx_discovered_match_score on discovered_items (match_score desc);
create index if not exists idx_discovered_extracted_deadline on discovered_items (extracted_deadline);
