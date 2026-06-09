// すべての選択肢・区分の共通定義。ここを編集すれば全画面に反映されます。

export const GRANT_TYPES = ["補助金", "助成金", "給付金", "支援金", "その他"] as const;

export const ORG_TYPES = ["国", "自治体", "厚労省系", "財団系", "その他"] as const;

export const RECRUITMENT_STATUSES = [
  "募集中",
  "募集予定",
  "締切間近",
  "終了",
  "不明",
] as const;

export const REGIONS = [
  "全国",
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県",
  "岐阜県", "岐阜市", "静岡県", "愛知県", "名古屋市", "三重県",
  "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
  "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県",
  "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
] as const;

// 市区町村 → 都道府県 の簡易マッピング（地域照合の包含判定に使用）
export const CITY_TO_PREF: Record<string, string> = {
  名古屋市: "愛知県",
  岐阜市: "岐阜県",
};

export const INDUSTRIES = [
  "全業種",
  "小売", "EC", "卸売", "飲食", "宿泊", "サービス業",
  "美容", "イベント", "トレーディングカード",
  "製造業", "建設業", "情報通信", "IT", "AI", "DX", "システム開発",
  "食品", "地域産品", "運輸", "医療・福祉", "農林水産", "不動産",
  "教育・学習支援", "その他",
] as const;

export const ENTITY_TYPES = [
  "個人事業主", "株式会社", "合同会社", "合資会社", "合名会社",
  "有限会社", "一般社団法人", "公益社団法人", "NPO法人", "協同組合", "その他",
] as const;

// 目的カテゴリ（実務では最重要のフィルター）
export const PURPOSES = [
  "店舗改装", "空調設備", "省エネ", "防犯カメラ", "POS導入", "在庫管理",
  "EC強化", "ホームページ制作", "予約システム", "AI導入", "DX",
  "広告宣伝", "イベント開催", "スタッフ採用", "社員教育", "事業承継",
  "M&A", "創業", "新店舗出店", "地域活動", "健康支援", "食品EC", "販路開拓",
  "設備導入", "内装工事", "商品開発", "輸出", "業務自動化", "研究開発", "省力化",
] as const;

// 対象経費カテゴリ
export const EXPENSE_CATEGORIES = [
  "設備費", "内装工事費", "機械装置費", "システム導入費", "ソフトウェア費",
  "広告宣伝費", "委託費", "外注費", "人件費", "研修費",
  "専門家経費", "旅費", "通信費", "開発費", "その他経費",
] as const;

export const RECOMMENDATIONS = ["A", "B", "C", "D"] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];

export const MATCH_STATUSES = [
  "high_match",
  "possible",
  "needs_review",
  "low_match",
  "not_applicable",
] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const MATCH_STATUS_LABEL: Record<MatchStatus, string> = {
  high_match: "高相性",
  possible: "確認候補",
  needs_review: "要確認",
  low_match: "参考",
  not_applicable: "対象外候補",
};

// 申請進捗ステータス（補助金 × 事業 単位）
export const APPLICATION_STATUSES = [
  "未確認", "要確認", "士業確認中", "見積取得中", "申請予定",
  "見送り", "申請済み", "採択", "不採択", "入金待ち", "完了",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APP_STATUS_COLORS: Record<string, string> = {
  未確認: "bg-gray-100 text-gray-700",
  要確認: "bg-yellow-100 text-yellow-800",
  士業確認中: "bg-amber-100 text-amber-800",
  見積取得中: "bg-cyan-100 text-cyan-800",
  申請予定: "bg-blue-100 text-blue-800",
  見送り: "bg-gray-200 text-gray-500 line-through",
  申請済み: "bg-indigo-100 text-indigo-800",
  採択: "bg-green-100 text-green-800",
  不採択: "bg-red-100 text-red-700",
  入金待ち: "bg-teal-100 text-teal-800",
  完了: "bg-emerald-100 text-emerald-800",
};

export const ALERT_TYPES = ["新着", "高相性", "締切間近", "要確認", "対象外候補"] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

export const ALERT_COLORS: Record<string, string> = {
  新着: "bg-sky-100 text-sky-800 border-sky-200",
  高相性: "bg-green-100 text-green-800 border-green-200",
  締切間近: "bg-red-100 text-red-700 border-red-200",
  要確認: "bg-yellow-100 text-yellow-800 border-yellow-200",
  対象外候補: "bg-gray-100 text-gray-500 border-gray-200",
};

export const DIFFICULTIES = ["低", "中", "高", "不明"] as const;
export const SELECTION_TYPES = ["採択制", "条件達成型", "不明"] as const;

// 申請前着手NGの標準注意文
export const PRE_APPLICATION_WARNING_TEXT =
  "この制度は、申請前または交付決定前の契約・発注・支払いが補助対象外になる可能性があります。見積取得は可能でも、契約・発注前に必ず公募要領または専門家へ確認してください。";

// 法務・士業に関する全体注意文
export const LEGAL_DISCLAIMER_TEXT =
  "本サービスは補助金・助成金情報の検索・整理・一次判定を目的としたツールです。申請可否や受給を保証するものではありません。実際の申請前には、必ず公式情報・公募要領を確認し、必要に応じて行政書士、社会保険労務士、認定支援機関などの専門家へご相談ください。";
