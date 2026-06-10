-- =============================================================
-- 実務UI向け 追加  discovery_ui_schema.sql
-- 既存SQLは編集していません。実行済みDBに追加実行してください（冪等）。
--
-- 目的：
--   - review_state: 候補の「人による確認状態」。AI自動判定と人間確認済みを区別する。
--       ai_judged（AI自動判定）/ unconfirmed（未確認）/ human_ok（人間確認済み）/
--       applicant（申請候補）/ not_needed（不要）
--   - match_reason: 事業プロフィールと照合した際の「相性の理由」（1〜2行表示用）
-- =============================================================

alter table discovered_items add column if not exists review_state text default 'ai_judged';
alter table discovered_items add column if not exists match_reason text;
create index if not exists idx_discovered_review_state on discovered_items (review_state);
