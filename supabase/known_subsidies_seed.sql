-- =============================================================
-- 実在の地域補助金「キュレーション・シード」 known_subsidies_seed.sql
--   サンプル（デモ）ではなく、実在する公的制度を確実に表示するための初期データです。
--   external_source = 'jnet21'、公式URLは実在ページ。自動収集（固定URL巡回）が動けば
--   同じ external_id で更新されます（重複しません）。
--   何度実行しても安全（external_id で upsert）。
--
--   ※ discovered_items に external_id の一意制約が必要です（discovery_collect_schema.sql で付与済み）。
-- =============================================================

insert into discovered_items (
  external_id, external_source, title, url,
  raw_text, detection_type, status,
  source_category, trust_level,
  original_source_url, official_url, official_source_confirmed,
  verification_status, normalized_key, audience_type,
  fetched_at, extraction_confidence
) values (
  'jnet21:https://j-net21.smrj.go.jp/snavi2/articles/179830',
  'jnet21',
  '中心市街地活性化空き店舗活用事業',
  'https://j-net21.smrj.go.jp/snavi2/articles/179830',
  E'中心市街地活性化空き店舗活用事業\n種類: 補助金・助成金\n地域: 岐阜県 / 岐阜市\n実施機関: 岐阜市\n対象者: 岐阜市の中心市街地の空き店舗を活用して出店・開業する事業者\n対象経費: 店舗改装費・内装工事費・賃借料 など\n概要: 岐阜市の中心市街地の空き店舗を活用した新規出店・店舗改装を支援する制度です。中心市街地の活性化を目的としています。\n出典: J-Net21（中小機構）',
  'new',
  'unreviewed',
  'semi_official',
  'B',
  'https://j-net21.smrj.go.jp/snavi2/articles/179830',
  'https://j-net21.smrj.go.jp/snavi2/articles/179830',
  false,
  'needs_review',
  '中心市街地活性化空き店舗活用事業',
  'business',
  now(),
  70
)
on conflict (external_id) do update set
  title = excluded.title,
  raw_text = excluded.raw_text,
  url = excluded.url,
  official_url = excluded.official_url,
  normalized_key = excluded.normalized_key,
  updated_at = now();

-- 確認SQL：
-- select title, external_source, official_url from discovered_items
--   where external_id = 'jnet21:https://j-net21.smrj.go.jp/snavi2/articles/179830';
