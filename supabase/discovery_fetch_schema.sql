-- =============================================================
-- 外部fetcher（J-Net21 / ミラサポplus 等）取得メタ 追加  discovery_fetch_schema.sql
-- 既存SQLは編集していません。実行済みDBに追加実行してください（冪等）。
--
-- 目的：実HTTP取得した候補ごとに「取得日時」と「抽出の確からしさ」を保存する。
--   - fetched_at: 実際に外部サイトを取得した日時
--   - extraction_confidence: 抽出できた項目数などから算出した確信度(0-100)
-- =============================================================

alter table discovered_items add column if not exists fetched_at timestamptz;
alter table discovered_items add column if not exists extraction_confidence int;
