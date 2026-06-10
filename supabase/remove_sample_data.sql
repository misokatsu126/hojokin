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

-- AI抽出候補（extracted_grant_candidates）。サンプル由来・example.com を削除。
delete from extracted_grant_candidates
where coalesce(name, '') like '%サンプル%'
   or coalesce(organizer, '') like '%サンプル%'
   or coalesce(official_url, '') like '%example.com%'
   or coalesce(official_pdf_url, '') like '%example.com%'
   or discovered_item_id in (
        select id from discovered_items
        where coalesce(title,'') like '%サンプル%' or external_source = 'sample'
      );

-- 情報源（source_sites）。実在の公式/Jグランツ/J-Net21/ミラサポは残ります。
delete from source_sites
where coalesce(name, '') like '%サンプル%'
   or coalesce(url, '') like '%example.com%';

-- 通知候補（notification_candidates）。サンプル由来があれば削除（テーブルが無ければスキップ）。
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'notification_candidates') then
    delete from notification_candidates
    where coalesce(title,'') like '%サンプル%'
       or coalesce(source,'') = 'sample'
       or coalesce(official_url,'') like '%example.com%';
  end if;
end $$;

-- grant_matches / alerts / application_statuses は grants の on delete cascade で連動削除されます。

-- （任意）サンプル事業プロフィールを消したい場合のみ実行：
-- delete from business_profiles where coalesce(name,'') like '%サンプル%';

-- =============================================================
-- 実行後の確認SQL（0件ならクリーン）。必要に応じて個別に実行してください。
-- =============================================================
-- select count(*) as sample_discovered from discovered_items
--   where coalesce(title,'') like '%サンプル%' or external_source = 'sample'
--      or coalesce(url,'') like '%example.com%' or coalesce(official_url,'') like '%example.com%';
-- select count(*) as sample_grants from grants
--   where coalesce(name,'') like '%サンプル%' or source = 'サンプル'
--      or coalesce(official_url,'') like '%example.com%';
-- select count(*) as sample_sources from source_sites
--   where coalesce(name,'') like '%サンプル%' or coalesce(url,'') like '%example.com%';
-- select count(*) as sample_external from discovered_items where external_source = 'sample';
