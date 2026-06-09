-- =============================================================
-- 情報源をまたいだ重複検知 拡張  discovery_dedup_schema.sql
-- 既存の schema.sql / discovery_schema.sql / discovery_collect_schema.sql は編集していません。
-- これらを実行済みのDBに、この SQL を SQL Editor で「追加実行」してください。
-- 何度実行しても安全（冪等：add column if not exists / create index if not exists）。
--
-- 目的：
--   Jグランツ / ミラサポplus / J-Net21 / 公式ページ は同一制度（IT導入補助金・
--   ものづくり・持続化等）を別々に配信するため、external_id だけでは情報源をまたいだ
--   重複を排除できない。そこで「正規化キー」を持たせ、横断して重複候補を検知する。
--   正規化キーは（補助金名＋実施主体）を空白・記号除去で連結したもの。
--   ※ 公式URLドメインや締切年月はあえてキーから除外している。
--     Jグランツとミラサポplusでドメインが異なる同一制度を取りこぼさないため、
--     名称＋実施主体を主キーに据え、最終判断は人（duplicate_of は自動統合しない）。
-- =============================================================

-- discovered_items に正規化キー列を追加
alter table discovered_items add column if not exists normalized_key text;
create index if not exists idx_discovered_normalized on discovered_items (normalized_key);
