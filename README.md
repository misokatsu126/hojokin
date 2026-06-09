# 補助金・助成金レーダー兼管理台帳（MVP）

複数事業を持つ会社・経営者向けの「補助金・助成金レーダー兼管理台帳」です。
単なる検索サイトではなく、**補助金を1件登録すると、登録済みの全事業プロフィールと自動照合し、対象可能性・おすすめ度・対象外理由・次にやることを一次判定**します。さらに新着／高相性／締切間近アラート、ステータス管理、自然文AI検索によって、使える制度を見逃さず社内で検討・管理できます。

- **Next.js 14（App Router） / TypeScript / Tailwind CSS / Supabase / OpenAI API**
- **OpenAI APIキーが未設定でも、ルールベース判定で全機能が動作します。**

---

## 1. セットアップ手順

```bash
npm install
cp .env.local.example .env.local   # 値を編集
npm run dev                          # http://localhost:3000
```

### 必要な環境変数（`.env.local`）

| 変数名 | 必須 | 説明 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase プロジェクトURL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon キー |
| `OPENAI_API_KEY` | 任意 | 設定するとAI判定・AI条件抽出が有効。未設定ならルールベース判定 |
| `OPENAI_MODEL` | 任意 | 既定 `gpt-4o-mini` |

---

## 2. Supabase のセットアップ

1. [supabase.com](https://supabase.com) でプロジェクトを作成。
2. **SQL Editor** で `supabase/schema.sql` を実行（9テーブル＋トリガ＋RLSを作成）。
3. **SQL Editor** で `supabase/discovery_schema.sql` を実行（自動探索レーダー用の5テーブルを追加）。`schema.sql` とは独立しており、後から追加実行できます。
3b. **SQL Editor** で `supabase/discovery_collect_schema.sql` → `supabase/discovery_dedup_schema.sql` の順に実行（自動収集の追加列：`audience_type`/`external_id`/`feed_url` 等、および情報源をまたいだ重複検知用の `normalized_key`）。いずれも**冪等**（何度実行しても安全）です。
4. （任意）`supabase/seed.sql` を実行するとサンプルデータが入ります。
   - ※ SQLで投入した場合、判定・アラートは未生成です。各補助金の詳細ページで「全事業を再照合」を押すか、アプリ内の「サンプル登録」ボタンを使ってください（後者は登録と同時に自動照合します）。
5. **Settings > API** の URL と anon key を `.env.local` に設定。

`supabase/schema.sql` は全テーブルのCREATE文、`updated_at` 自動更新トリガ、GINインデックス、MVP用の「全許可」RLSポリシーを含みます。`supabase/discovery_schema.sql` は自動探索レーダー用の追加テーブル（`source_sites` / `source_fetch_logs` / `discovered_items` / `extracted_grant_candidates` / `import_reviews`）を同方針で追加します。

---

## 3. OpenAI APIキーの設定とモック動作

- `.env.local` に `OPENAI_API_KEY` を設定すると、補助金 × 事業の判定と自然文検索の条件抽出にAIを使用します。
- **未設定でも動作します。** その場合は以下のルールベースで判定します。
  - 目的（最大30点）・地域（25点）・業種（20点）・法人種別（15点）・対象経費（10点）の一致度＋キーワード加点／除外キーワード減点でスコア算出。
  - 80点以上=A/高相性、60〜79=B/要確認、40〜59=C/参考、39以下=D/対象外候補。募集終了・除外キーワード一致は対象外（not_applicable）に。
- AI呼び出しが失敗した場合も自動的にルールベースにフォールバックします。判定カードに「AI判定」か「ルールベース判定」かを表示します。

---

## 4. 主要画面

| 画面 | パス | 説明 |
| --- | --- | --- |
| ダッシュボード | `/` | 高相性・未確認アラート、締切30日以内、申請予定、ステータス別件数、事業別おすすめ、自然文検索ボックス |
| 補助金一覧・検索 | `/grants` | 目的・地域・業種・法人種別・種別・募集状態・締切・上限額・着手NG・士業確認・進捗・おすすめ度・キーワードでフィルター。自然文検索にも切替可 |
| 補助金詳細 | `/grants/[id]` | 概要・注意喚起・事業プロフィール別の判定・ステータス変更・メモ・公式URL。「全事業を再照合」も可能 |
| 事業プロフィール管理 | `/profiles` | 事業の登録・編集・削除。地域/業種/目的/経費/キーワードがそのまま監視条件として照合に使われる。サンプル5件投入ボタンあり |
| 補助金登録・管理 | `/admin` | 補助金のCRUD。保存すると全事業と自動照合しアラート作成。サンプル6件投入ボタンあり |
| 自然文AI検索 | `/search` | 自然文検索専用ページ |
| 探索ダッシュボード | `/discovery` | 自動探索レーダーの状況（今日の新着・未確認・AI抽出済み・確認待ち・本登録済み・公式未確認・重複・情報源別最終巡回） |
| 情報源管理 | `/discovery/sources` | 監視対象サイト（情報源）のCRUD。`source_type`（3層）・`trust_level`（A〜E）・優先度・巡回頻度・active切替。サンプル8件投入ボタンあり |
| 自動検知候補 | `/discovery/items` | 検知候補（`discovered_items`）の一覧・手動追加・「AIで抽出→候補化」。二次情報/公式未確認の注意表示、重複・過年度の検知 |
| AI抽出候補の確認 | `/discovery/review` | AI抽出候補（`extracted_grant_candidates`）の確認・正式登録・要追加確認・却下・重複扱い。公式確認済みのみ正式登録可 |

### 最重要導線

`/admin` で補助金を登録 → 保存時に `/api/rematch` が全事業と照合し `grant_matches` と `alerts` を作成 → `/`（ダッシュボード）で高相性・締切間近を確認 → 各事業のステータスを「要確認／申請予定／見送り」などに振り分け。

---

## 5. 主要テーブル

| テーブル | 説明 |
| --- | --- |
| `grants` | 補助金・助成金情報（種別・対象・経費・締切・着手NG・難易度など） |
| `business_profiles` | 事業プロフィール（地域・業種・目的・経費・キーワード等） |
| `watch_conditions` | 事業ごとの監視条件 |
| `grant_matches` | 補助金 × 事業 の判定結果（score/recommendation/理由/用途/リスク等） |
| `alerts` | 補助金 × 事業 単位のアラート（新着/高相性/締切間近/要確認/対象外候補） |
| `application_statuses` | 補助金 × 事業 単位の申請進捗（11種） |
| `status_notes` | ステータス変更時のメモ履歴 |
| `ai_search_logs` | 自然文AI検索の履歴 |
| `admin_users` | 管理者情報（将来の認証用スタブ） |

判定・アラート・ステータスはすべて「補助金 × 事業プロフィール」単位です。同じ補助金でもカード事業部は高相性、別事業は対象外候補、といった管理ができます。

### 自動探索レーダー用テーブル（`supabase/discovery_schema.sql`）

| テーブル | 説明 |
| --- | --- |
| `source_sites` | 監視対象サイト（情報源）。`source_type`（3層カテゴリ）・`trust_level`（A〜E）・優先度・巡回頻度・active等 |
| `source_fetch_logs` | 将来の自動巡回ログ（成功/失敗/検知件数）。MVPでは未使用だが型・テーブルを用意 |
| `discovered_items` | 自動/手動で検知した補助金候補。公式確認状態・二次情報の注意・重複/過年度フラグを保持 |
| `extracted_grant_candidates` | AI/ルールで抽出・正規化した補助金候補。本登録前の中間データ。`confidence_score`・`missing_fields` を保持 |
| `import_reviews` | 人間による確認・承認履歴。承認時の `approved_grant_id` で正式登録された `grants` と紐づく |

---

## 6. 自然文AI検索の仕組み

1. 入力文から検索条件（地域・業種・法人種別・目的・対象経費・補助上限額・締切条件・募集状態・キーワード）を抽出（AI、または未設定時はルールベース）。
2. 抽出条件で登録済み `grants` を絞り込み。完全一致が0件なら条件を緩和して再検索し、`relaxed_search_suggestions` で通知。
3. 抽出条件を仮想プロフィールとみなし、判定エンジンでスコアリングして順位付け。
4. 補助金名・対象可能性・おすすめ度・該当理由・使えそうな用途・懸念点・次にやること・公式URL・詳細リンクを返却。

外部サイトをリアルタイム検索する機能ではなく、登録済みデータに対する一次判定です。

---

## 7. 補助金・助成金 自動探索レーダー（拡張機能）

このツールの最終形は、単なる検索サイトではなく、**世の中に新しく出た補助金・助成金を自動で探してきて、登録済みの全事業プロフィールに使えそうなものだけを知らせる「自動探索レーダー」**です。本リポジトリには、その**土台（テーブル・型・管理画面・安全フロー）**が実装されています。MVPでは実際の自動巡回までは行わず、「後から自動巡回を足せる設計」と「管理画面の入口」を提供します。

### 7.1 目的と設計思想

- AIがインターネットを無制限に探すのではなく、**まず信頼できる情報源を登録し、その情報源を定期巡回する**設計です。
- 地方自治体の補助金は見つけにくいため、公式サイトだけでなく**補助金紹介サイト・民間まとめサイトも「発見用の情報源」**として参照します。
- ただし情報の扱いを明確に分けます。
  - **紹介サイト・まとめサイト：発見用のレーダー（二次情報）**
  - **公式サイト・公募要領PDF：最終確認用の一次情報**
- 民間サイト由来の情報は、内容が古い・条件が省略・募集終了済み・前年制度が残っている・公式URLが誤っている等の可能性があるため、**すぐに正式登録せず必ず「未確認候補」として保存**します。公式URLまたは公募要領PDFが確認できたものだけを正式な `grants` に登録できます。

### 7.2 情報源の3層構造と信頼度

`source_sites.source_type` で情報源を分類します。

| カテゴリ（`source_type`） | 層 | 内容 | 既定 `trust_level` |
| --- | --- | --- | --- |
| `official` | 第1層：一次情報 | 国・省庁・都道府県・市区町村・商工会議所・産業支援機関・財団公式 | A |
| `semi_official` | 第2層：準公式 | Jグランツ・ミラサポplus・J-Net21・中小企業支援機関・産業振興センター | B |
| `aggregator` | 第3層：二次情報 | 補助金ポータル・スマート補助金・助成金なう・補助金クラウド系まとめ | C |
| `professional_article` | 第3層：二次情報 | 行政書士・社労士・税理士・補助金コンサル等の記事 | D |
| `news` | 第3層：二次情報 | PR TIMES・ニュース記事など | D |
| `unknown` | 不明 | 区分不明 | E |

`trust_level`（A〜E）は画面上で常に「信頼度A：公式情報／B：準公式情報／C：民間まとめサイト由来／D：記事・PR由来／E：未確認」と表示されます。

### 7.3 安全フロー（最重要）

自動探索で見つけた情報は、最初から正式な補助金として扱いません。必ず次の流れを通します。

```
source_sites に情報源を登録
  → （将来）巡回で新着・更新を検知
  → discovered_items に「未確認候補」として保存
  → /api/discovery/extract で AI/ルール抽出 → extracted_grant_candidates に保存
  → /discovery/review で人間が確認（公式URL・公募要領PDFを確認）
  → 公式確認できたものだけ grants に正式登録（createGrant）
  → /api/rematch で全事業プロフィールと自動照合（既存導線を再利用）
  → 高相性なら alerts を作成、application_statuses で進捗管理
```

この設計により、AIの誤抽出・古い情報・民間サイト由来の不確実情報の混入を防ぎます。**正式登録は既存MVPの照合・アラート導線（`/api/rematch`）をそのまま再利用**しており、既存機能には手を加えていません。

### 7.4 二次情報・公式未確認の注意表示

- 民間まとめ・士業記事・ニュース由来（`aggregator`/`professional_article`/`news`/`unknown`）の候補には、以下を表示します。
  > この情報は補助金紹介サイト・まとめサイト・記事等から検知した候補です。内容が古い、条件が省略されている、募集終了済みの可能性があります。必ず公式サイト・公募要領PDFを確認してください。
- 公式URL/公募要領PDFが未確認の候補には、以下を表示します。
  > 公式情報未確認：この補助金候補について、公式URLまたは公募要領PDFがまだ確認できていません。申請判断には使用せず、確認候補として扱ってください。
- これらの候補は「未確認候補」「公式未確認」「二次情報由来」「重複候補」「過年度候補の可能性」として画面上で明確に区別されます。

### 7.5 AI抽出機能（OpenAIキーなしでも動作）

`/discovery/items` の「AIで抽出 → 候補化」または `/api/discovery/extract` で、検知候補の本文・URLから補助金名・種別・実施主体・対象地域/業種/法人種別・対象経費・補助率・上限額・募集開始/締切・募集状態・申請方法・必要書類・公式URL・公募要領PDF・注意点・申請前着手NGの可能性・士業確認推奨・信頼度スコア・**抽出できなかった項目（`missing_fields`）**を抽出します。

- `OPENAI_API_KEY` がある場合はAI抽出、**ない場合は `src/lib/discovery.ts` のルールベース抽出**で動作します（本文の正規表現マッチ＋区分辞書）。AI失敗時もルールベースへフォールバックします。
- **URLからの本文取得**：検知候補に本文が無くURLがある場合、抽出時にサーバー側で `fetch` を試みてHTMLをテキスト化します。アクセス拒否・JS描画・タイムアウト等で取得できない場合は、その旨をUIに表示し、`/discovery/items` の各候補の「本文を貼り付け/編集」から手動でテキストを貼り付けて再抽出する**フォールバック**を用意しています（本格的なクローリング・JS描画レンダリングは将来対応）。
- 抽出結果はすぐ本登録せず、必ず `extracted_grant_candidates` に保存し、人間の確認を経て `grants` に登録します。

### 7.6 重複・過年度への対策

検知候補の登録時に、補助金名・公式URLの近さで**重複候補**を検知し（`discovered_items.duplicate_of`）、タイトルの「令和◯年度」「過年度」等の年度表記から**過年度・募集終了の可能性**を検知して記録・表示します（`source_warning`）。

### 7.7 横断 自然文検索（実装済み）

既存の自然文AI検索（`/api/search-nl`・`/search`）は `grants` のみを対象にしており、**変更していません**。これに加えて、`grants` / `discovered_items` / `extracted_grant_candidates` を**横断検索する拡張版**を新エンドポイント `/api/discovery/search` として用意し、`/discovery`（探索ダッシュボード）の検索ボックスから利用できます。

- 検索文の条件抽出は既存ロジック（AIキーありはAI、なしは `ruleExtractConditions`）を再利用。
- 結果には必ず情報の状態を表示します：**正式登録済み／未確認候補／公式未確認／AI抽出済み／AI抽出済み（公式未確認）／過年度候補／重複候補**。
- 未確認・公式未確認・過年度・重複の候補には、申請判断に使わない旨の注意を表示します。

### 7.8 自動収集（4層・合法ルートのみ／ツール内表示で完結）

対象地域は **愛知県 / 名古屋市 / 弥富市 / 岐阜県 / 岐阜市**、対象は**事業者向け＋個人向け**の両方。通知は外部に出さず、すべてダッシュボードに表示して完結します。民間まとめサイトの自動スクレイピングは行いません。

追加SQL `supabase/discovery_collect_schema.sql`（既存無編集・冪等）で、`discovered_items`/`extracted_grant_candidates` に `audience_type`（事業者/個人）、`discovered_items` に `external_id`（重複防止のupsertキー）、`source_sites` に `feed_url`/`audience_scope` を追加します。

| 層 | エンドポイント | 内容 |
| --- | --- | --- |
| ① Jグランツ公開API | `POST/GET /api/discovery/jgrants/sync` | デジタル庁 Jグランツ `GET /exp/v1/public/subsidies`（認証不要、規約 https://www.jgrants-portal.go.jp/open-api ）。**対象地域(全国＋5地域)×複数キーワード**（補助金/助成金/IT/DX/省エネ/創業/販路/設備）でループ検索（各リクエスト間に小待機）。新規分は詳細API `…/subsidies/id/{id}` で `front_subsidy_detail_page_url`・補助率・締切を補完。`discovered_items` に upsert（`external_id='jgrants:<id>'`、公的ポータルのため公式URL確認済み扱い）。 |
| ② 公式ページ巡回 | `POST/GET /api/discovery/crawl?source_id=...` | `source_sites.url` をサーバー側fetch→補助金関連リンクを抽出して保存。取得不可（robots/JS描画/到達不可）時は `source_fetch_logs` に error 記録し手動確認に委ねる。公式URL（愛知/名古屋/弥富/岐阜県/岐阜市/三重県/四日市市）は「公式情報源を登録」で投入。 |
| ③ J-Net21 | `POST/GET /api/discovery/jnet21/sync` | 中小機構 J-Net21 の公開RSS `https://j-net21.smrj.go.jp/snavi/support/support.xml` を**実HTTP取得**し、title/link/pubDate/description を抽出して `discovered_items` に upsert（`external_id='jnet21:<link>'`、出典明記）。対象地域＋全国のみ残す。 |
| ③ ミラサポplus | `POST/GET /api/discovery/mirasapo/sync` | 中小企業庁 ミラサポplus（`mirasapo-plus.go.jp`、.go.jp が正）の補助金一覧 `/subsidy/` を**実HTTP取得**し、補助金名・リンク・日付・公募要領URLを抽出して upsert（`external_id='mirasapo:<url>'`）。**「出典：中小企業庁『ミラサポplus』」** を表示。制度ナビAPIは2023/09終了のためHTML取得。SPA等で静的HTMLから一覧が取れない場合はモックを返さず理由をログ。 |
| ④ RSS/Atom | `POST/GET /api/discovery/feed?source_id=...` | `source_sites.feed_url` の公開フィードを購読して保存。メール受信取り込みは将来実装（`feed` ルートに設計コメント）。 |
| 自動実行 | `GET/POST /api/discovery/run` | ①②④をまとめて実行（J-Net21・ミラサポは手動のため自動対象外）。`vercel.json` の Cron で毎日1回（`0 21 * * *` = 06:00 JST）。Cron無しでも情報源管理の「今すぐ全収集」ボタンで手動実行可。 |

対象地域は **愛知県 / 名古屋市 / 弥富市 / 岐阜県 / 岐阜市 / 三重県 / 四日市市（および全国）**。

**外部取得の検証コマンド**：`npm run probe:sources`（4つの対象URLを実HTTP取得し status/Content-Type/本文長/RSS件数を表示）／`npm run update:external-sources`（J-Net21 RSS と ミラサポplus を実取得→抽出→`discovered_items`/`source_fetch_logs` に保存。`.env.local` の Supabase 設定を使用）。取得メタ用に `supabase/discovery_fetch_schema.sql`（`fetched_at`/`extraction_confidence`）を追加。各候補に source_url(`url`)/official_url/fetched_at/raw_text/extraction_confidence を保存。各候補カードに「**本物を見る**」ボタン（元ページを開く）を表示。

**情報源をまたいだ重複検知**：Jグランツ・ミラサポplus・J-Net21・公式ページは同一制度（IT導入補助金・ものづくり・持続化等）を別々に配信するため、`external_id`（同一源内の重複防止）に加えて **`normalized_key`（補助金名を NFKC 正規化＋空白記号除去）** を全候補に付与。取り込み時に正規化キーが一致する既存候補があれば `duplicate_of` を設定して**重複候補**として紐づけます。優先順位は **Jグランツ ＞ ミラサポplus ＝ J-Net21**（Jグランツがあればそれを本体に、他源を重複候補へ）。自動統合・自動削除はせず、`/discovery` ダッシュボードの「重複候補」枠に表示して人が確認・統合します。

**ダッシュボード表示で完結**：トップ `/` に「自動収集の新着」セクションを追加（既存表示は無変更）。**今日見つかった候補／高相性候補／締切30日以内**を表示し、**事業者向け／個人向け**フィルタで切替。高相性候補は、AI抽出候補を登録済みの事業プロフィールとルールベースで照合した最高スコア（70点以上）で抽出します（`scoreCandidateAgainstProfiles`）。正式登録済みは従来どおり `/grants` に流れます。

**毎日自動実行とログ**：`vercel.json` の Cron が毎朝6時(JST)に `/api/discovery/run` を実行。実行のたびに各ソースの結果を `source_fetch_logs` に保存し、run全体の集計も `source_site_id=null` の1行として記録（失敗時も `status='error'` で残るため、Cron成否を後から追跡可能）。J-Net21 は安定ソースとして `is_active=true`・`crawl_frequency=daily` で毎日巡回対象。

**通知（設計のみ・送信は後日）**：`src/lib/notify.ts` に通知条件（高相性/締切間近/申請前着手NG/士業確認）の選定ロジックと送信差し込み口（現状no-op）を用意。重複送信防止の `notification_log` テーブルは `supabase/discovery_notify_schema.sql`（任意・将来適用）。メール/LINE/Slack/カレンダー連携は後日この差し込み口に実装。外部取得に失敗しても各APIは 200 + `ok:false`/0件で返し、アプリは落ちません（`discovery_collect_schema.sql` 未実行時はセクションを静かに非表示）。

---

## 8. 今後の拡張ポイント

将来の自動収集に備え、`grants` に `source`（取得元）・`fetched_at`（取得日時）・`official_url`・`guideline_pdf_url` を保持しています。自動探索レーダーは `source_sites` / `discovered_items` / `extracted_grant_candidates` / `import_reviews` / `source_fetch_logs` を土台として、以下を後から追加できます。

- **自動巡回（クローラ）**：`source_sites` の `is_active` / `crawl_frequency` に従って定期巡回し、新着・更新・締切変更・PDF追加・募集開始/終了・ページ更新・類似制度の再募集・前年度版の更新などの変化を検知。結果を `discovered_items` に保存し、`source_fetch_logs` に成功/失敗/検知件数を記録（→ `/discovery` の「巡回エラー」表示に反映）。
- **地方補助金の発見**：公式サイトだけでなく `aggregator`（補助金ポータル等）・`professional_article`・`news` を**発見用レーダー**として併用。見つけた候補は必ず `discovered_items`（未確認候補）に保存し、公式に戻して確認してから正式登録。
- **公式情報確認の自動補助**：民間サイト由来候補について、実施主体の公式ページ・自治体/省庁/財団の公式URL・公募要領PDF・募集年度の最新性・締切の有効性・募集終了有無・申請前着手NG・対象経費/法人種別の明記などをAIまたは手動でチェックし `verification_status` を更新。
- **Jグランツ API 連携 / JグランツMCP 連携**：取得した制度を `discovered_items`→`extracted_grant_candidates` 経由、または `grants` に upsert し `source='jgrants'` で識別。日次バッチで差分検知→新着アラート作成（`/api/rematch` を流用）。
- **ミラサポplus・自治体ページの更新監視**：定期クロール結果を正規化。`fetched_at` で更新差分を判定。
- **PDF自動読み取り／公募要領要約**：`official_pdf_url` / `guideline_pdf_url` を取得しAI要約を `notes` に反映。
- **LINE / Slack / メール / Googleカレンダー通知**：`alerts` 作成をフックに Webhook 送信。通知条件（match_score 80点以上・締切30日以内・高相性・申請前着手NG・士業確認推奨・新着・公式確認済み・高信頼度の情報源）としきい値はユーザー設定として追加。`source_sites` の `trust_level` と連携し、低信頼度のみの候補は通知しない等の制御が可能。
- **自然文検索の対象拡張**：`discovered_items` / `extracted_grant_candidates` も検索対象に加え、状態（正式登録済み／未確認候補／公式未確認／AI抽出済み／要確認／過年度候補／重複候補）を必ず表示。
- **認証・データ分離**：`admin_users` を起点に Supabase Auth を導入し、RLSを所有者ベースに変更（現状はMVP用の全許可ポリシー）。

> ⚠️ 今回のMVPでは、本格的なWebクローリング・毎日の自動巡回・PDF自動読取・JグランツAPI連携・各種通知・外部サイトのリアルタイム検索は**未実装**です。上記はすべて、追加済みのテーブル・型・画面・安全フローの上に後から載せられる設計です。

---

## 9. 法務・士業領域への注意点

本サービスは補助金・助成金情報の検索・整理・一次判定・進捗管理を目的としたツールです。**申請代行や官公署提出書類の作成は目的としていません。** 申請可否・受給を保証するものではありません。実際の申請前には必ず公式情報・公募要領を確認し、必要に応じて行政書士・社会保険労務士・認定支援機関などの専門家へご相談ください。

また、多くの補助金は**交付決定前の契約・発注・支払いが対象外**になります。本アプリは「申請前着手NGの可能性」や締切30日／14日／7日以内、募集状態不明などを警告表示しますが、最終確認は必ず公募要領・専門家で行ってください。

---

## スクリプト

```bash
npm run dev        # 開発サーバー
npm run build      # 本番ビルド
npm run start      # 本番起動
npm run typecheck  # 型チェック
```
