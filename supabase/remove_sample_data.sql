-- =============================================================
-- サンプル（デモ）データ削除  remove_sample_data.sql
-- 本番運用前に、サンプル補助金・サンプル候補・サンプル情報源を削除します。
-- 何度実行しても安全（該当が無ければ0件削除）。
-- ※ 事業プロフィール(business_profiles)は実データのことが多いため削除対象外にしています。
--   必要なら末尾のコメントを外して実行してください。
-- =============================================================

-- 自動検知候補（discovered_items）
delete from discovered_items
where coalesce(title, '') like '%サンプル%'
   or coalesce(url, '') like '%example.com%'
   or coalesce(official_url, '') like '%example.com%'
   or external_source = 'sample';

-- 補助金（grants）。関連する grant_matches / alerts / application_statuses は
--   schema.sql の外部キー(on delete cascade)で連動削除されます。
delete from grants
where coalesce(name, '') like '%サンプル%'
   or coalesce(organization, '') like '%サンプル%'
   or source = 'サンプル'
   or coalesce(official_url, '') like '%example.com%'
   or coalesce(guideline_pdf_url, '') like '%example.com%';

-- 情報源（source_sites）。実在の公式/Jグランツ/J-Net21/ミラサポは残ります。
delete from source_sites
where coalesce(name, '') like '%サンプル%'
   or coalesce(url, '') like '%example.com%';

-- （任意）サンプル事業プロフィールを消したい場合のみ実行：
-- delete from business_profiles where coalesce(name,'') like '%サンプル%';
