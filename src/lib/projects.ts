// 支出案件（Spending Project）：このツールの新しい主語。
//   ユーザーは「補助金名」ではなく「この支出に使える補助金があるか」を知りたい。
//   案件を登録し、案件 × 補助金 で候補を判定する。
//   保存はブラウザの localStorage（即時・オフライン）をキャッシュにしつつ、
//   Supabase を設定していれば共有の保存先（別PC・社内共有・管理者確認）に同期する。

import type { BusinessProfile, DiscoveredItem } from "./types";
import { expandQuery, expandRegions } from "./synonyms";
import { triageDiscovered, TRIAGE_ORDER, type TriageKey, type TriageResult } from "./triage";
import { verifyItem, type VerifyResult } from "./verify";
import { getCoreProgramChecks } from "./coreMaster";
import { isSampleDiscovered } from "./sampleFilter";
import {
  supabaseConfigured, fetchSpendingProjectRows, upsertSpendingProjectRow, deleteSpendingProjectRow,
  type SpendingProjectRow,
} from "./supabase";

export type OrderStatus = "none" | "estimate" | "contract" | "ordered" | "paid";
export type Urgency = "low" | "mid" | "high";

export type SpendingProject = {
  id: string;
  name: string; // 案件名（例：岐阜店 空調入替）
  purpose: string; // 何にお金を使いたいか（自由記述）
  uses: string[]; // 用途タグ
  store: string; // 対象店舗・事業
  location: string; // 所在地
  entity: string; // 法人種別
  industry: string; // 業種
  employees: number | null; // 従業員数
  budget: number | null; // 予算（円）
  schedule: string; // 実施予定時期
  orderStatus: OrderStatus; // 見積/契約/発注/支払い
  urgency: Urgency;
  memo: string;
  checklist: Record<string, boolean>; // 申請準備チェック
  templateKey?: string; // どのテンプレートから作ったか（注意点表示等に使用）
  answers?: Record<string, string>; // テンプレ固有の質問への回答
  coreChecks?: Record<string, "done" | "skip">; // 定番制度の「確認済み／今回は対象外」
  created_at: string;
  updated_at: string;
};

// 支出案件テンプレート（＝「補助金チェックしたい支出テーマ」。今日やること＝申請準備タスクとは別物）。
//   label = 支出テーマ表示名 / uses = 支出用途タグ / nextActions = 申請準備タスク
export type TemplateQuestion = { id: string; q: string; options: string[] };
export type ProjectTemplate = {
  key: string;
  label: string; // 支出テーマ表示名（例：空調を入れ替えたい）。※これは「やること」ではない
  description: string; // 説明文
  name: string; // 案件名の雛形
  uses: string[]; // 用途タグ（synonyms 辞書が反応）
  categories: string[]; // 支出カテゴリ
  tags: string[]; // 関連タグ
  genres: string[]; // 関係しそうな補助金ジャンル
  requiredFields: string[]; // 必須確認項目（表示用）
  caution: string; // 発注前注意文
  expenses: string[]; // よくある対象経費
  killers: string[]; // ダメになりやすい条件
  nextActions: string[]; // 次にやること
  questions: TemplateQuestion[]; // テンプレ固有の質問
};

const PRE_ORDER_CAUTION = "補助金を使う場合、契約・発注・支払い前に公式の公募要領を確認してください。";

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    key: "aircon", label: "空調を入れ替えたい", description: "業務用エアコンなど空調設備の入替・新設。省エネ系の補助金が狙えます。",
    name: "店舗 空調入替", uses: ["空調を入れ替えたい"], categories: ["設備導入", "省エネ", "空調"],
    tags: ["空調", "省エネ", "設備更新", "店舗", "エアコン"],
    genres: ["省エネ設備補助金", "自治体の設備補助", "空き店舗・店舗改装"],
    requiredFields: ["所在地", "予算", "発注状況", "見積状況", "省エネ性能・型番"],
    caution: PRE_ORDER_CAUTION + " 省エネ性能・型番・見積が必要になる可能性があります。",
    expenses: ["機械装置費", "設備費"], killers: ["発注・契約後だと対象外の可能性", "型番・省エネ性能が要件に合わない可能性"],
    nextActions: ["発注前か確認する", "公式の公募要領を確認する", "見積を取得する", "対象経費を確認する"],
    questions: [
      { id: "type", q: "業務用エアコンですか？", options: ["業務用", "家庭用", "わからない"] },
      { id: "work", q: "入替ですか？新設ですか？", options: ["入替", "新設", "わからない"] },
      { id: "spec", q: "省エネ性能・型番は分かりますか？", options: ["分かる", "これから確認"] },
    ],
  },
  {
    key: "renovation", label: "店舗を改装したい", description: "内装・外装の改装。自治体の店舗改装・空き店舗補助や持続化補助金が狙えます。",
    name: "店舗改装", uses: ["店舗を改装したい"], categories: ["店舗改装", "内装工事", "設備導入"],
    tags: ["店舗改装", "改装", "内装", "店舗"],
    genres: ["自治体の店舗改装補助", "空き店舗活用", "持続化補助金"],
    requiredFields: ["所在地", "予算", "発注状況", "見積状況"],
    caution: PRE_ORDER_CAUTION + " 図面・見積・商工会議所の確認が必要になる場合があります。",
    expenses: ["内装工事費", "設備費"], killers: ["発注・契約後だと対象外の可能性", "建物所有形態・用途で対象外の可能性"],
    nextActions: ["発注前か確認する", "公式の公募要領を確認する", "見積を取得する", "商工会議所に相談する"],
    questions: [
      { id: "scope", q: "どこを直しますか？", options: ["内装", "外装", "両方", "わからない"] },
      { id: "vacant", q: "空き店舗の活用ですか？", options: ["はい", "いいえ"] },
    ],
  },
  {
    key: "signboard", label: "看板を作りたい", description: "店舗看板・サイン。販路開拓・広告として持続化補助金などが狙えます。",
    name: "看板制作", uses: ["看板を作りたい", "広告を出したい"], categories: ["広告宣伝", "販路開拓"],
    tags: ["看板", "広告", "販路"],
    genres: ["小規模事業者持続化補助金", "自治体の販路開拓補助"],
    requiredFields: ["所在地", "予算", "発注状況", "従業員数"],
    caution: PRE_ORDER_CAUTION + " 持続化補助金は商工会議所・商工会の確認が必要な場合があります。",
    expenses: ["広告宣伝費", "外注費"], killers: ["発注・契約後だと対象外の可能性", "従業員数の要件を超える可能性"],
    nextActions: ["発注前か確認する", "従業員数を確認する", "商工会議所に相談する", "見積を取得する"],
    questions: [{ id: "goal", q: "目的は販路開拓・集客ですか？", options: ["はい", "いいえ"] }],
  },
  {
    key: "website", label: "ホームページ・LPを作りたい", description: "HP・ランディングページ制作。IT導入・持続化補助金が狙えます。",
    name: "ホームページ制作", uses: ["ホームページを作りたい"], categories: ["ホームページ制作", "広告宣伝", "販路開拓"],
    tags: ["ホームページ", "LP", "Web", "販路"],
    genres: ["IT導入補助金", "小規模事業者持続化補助金"],
    requiredFields: ["所在地", "予算", "発注状況", "制作委託先"],
    caution: PRE_ORDER_CAUTION + " 制作費・委託先・見積が必要になる可能性があります。",
    expenses: ["委託費", "外注費", "広告宣伝費"], killers: ["発注・契約後だと対象外の可能性", "対象ツール・委託先が要件外の可能性"],
    nextActions: ["発注前か確認する", "公式の公募要領を確認する", "見積を取得する"],
    questions: [{ id: "kind", q: "種類は？", options: ["コーポレートサイト", "LP", "EC", "わからない"] }],
  },
  {
    key: "ec", label: "ECを強化したい", description: "ネットショップ・通販の構築・強化。IT導入・持続化補助金が狙えます。",
    name: "EC強化", uses: ["ECを強化したい"], categories: ["EC強化", "システム導入", "販路開拓"],
    tags: ["EC", "ネットショップ", "通販", "販路"],
    genres: ["IT導入補助金", "持続化補助金", "販路開拓系"],
    requiredFields: ["所在地", "予算", "発注状況", "利用ツール"],
    caution: PRE_ORDER_CAUTION + " 対象ツール・委託費・見積の確認が必要になる可能性があります。",
    expenses: ["システム導入費", "ソフトウェア費", "委託費"], killers: ["発注・契約後だと対象外の可能性", "対象ツール登録が無い可能性"],
    nextActions: ["発注前か確認する", "対象ツールか確認する", "GビズIDを確認する", "見積を取得する"],
    questions: [{ id: "tool", q: "使うツールは決まっていますか？", options: ["決まっている", "これから"] }],
  },
  {
    key: "ai_pos", label: "AI・在庫管理・POSを入れたい", description: "業務システム・POS・在庫・AIの導入。IT導入・省力化投資補助金が狙えます。",
    name: "AI・在庫管理・POS導入", uses: ["AI・在庫管理・POSを入れたい"], categories: ["IT導入", "DX", "省力化"],
    tags: ["AI", "POS", "在庫", "システム", "DX", "省力"],
    genres: ["IT導入補助金", "中小企業省力化投資補助金"],
    requiredFields: ["所在地", "予算", "発注状況", "GビズID", "ベンダー"],
    caution: PRE_ORDER_CAUTION + " 対象ツール登録の有無・GビズIDが必要になる可能性があります。",
    expenses: ["システム導入費", "ソフトウェア費", "委託費"], killers: ["発注・契約後だと対象外の可能性", "自社開発・クラウド利用料は対象外のことがある"],
    nextActions: ["発注前か確認する", "GビズIDを確認する", "対象ツールか確認する", "見積を取得する"],
    questions: [
      { id: "kind", q: "ソフトですか？自社開発ですか？", options: ["市販ソフト", "自社開発", "クラウド利用", "わからない"] },
      { id: "vendor", q: "ベンダーは決まっていますか？", options: ["決まっている", "これから"] },
      { id: "gbiz", q: "GビズIDはありますか？", options: ["ある", "ない・わからない"] },
    ],
  },
  {
    key: "ad", label: "広告を出したい", description: "広告・宣伝・集客。販路開拓系の持続化補助金などが狙えます。",
    name: "広告宣伝", uses: ["広告を出したい"], categories: ["広告宣伝", "販路開拓"],
    tags: ["広告", "宣伝", "販路", "集客", "チラシ"],
    genres: ["小規模事業者持続化補助金", "自治体の販路開拓補助"],
    requiredFields: ["所在地", "予算", "発注状況", "従業員数", "広告媒体"],
    caution: PRE_ORDER_CAUTION + " 従業員数の要件・商工会議所の確認が必要な場合があります。",
    expenses: ["広告宣伝費", "委託費", "外注費"], killers: ["発注・契約後だと対象外の可能性", "従業員数の要件を超える可能性"],
    nextActions: ["発注前か確認する", "従業員数を確認する", "商工会議所に相談する", "見積を取得する"],
    questions: [
      { id: "media", q: "広告媒体は？", options: ["LP", "チラシ", "SNS広告", "看板", "イベント告知"] },
      { id: "goal", q: "販路開拓が目的ですか？", options: ["はい", "いいえ"] },
    ],
  },
  {
    key: "event", label: "イベントを開催したい", description: "イベント・展示会・フェア。地域活性や販路開拓の補助が狙えます。",
    name: "イベント開催", uses: ["イベントを開催したい"], categories: ["イベント開催", "販路開拓", "地域活動"],
    tags: ["イベント", "展示会", "販路", "地域"],
    genres: ["自治体のイベント・地域活性補助", "持続化補助金"],
    requiredFields: ["所在地", "予算", "発注状況", "実施時期"],
    caution: PRE_ORDER_CAUTION + " 対象経費・実施時期・地域要件の確認が必要になる場合があります。",
    expenses: ["委託費", "外注費", "広告宣伝費"], killers: ["発注・契約後だと対象外の可能性", "実施時期が補助対象期間外の可能性"],
    nextActions: ["発注前か確認する", "実施時期を確認する", "公式の公募要領を確認する"],
    questions: [{ id: "kind", q: "種類は？", options: ["展示会出展", "自主開催イベント", "セミナー", "わからない"] }],
  },
  {
    key: "hire", label: "人を採用したい", description: "採用・正社員化など。雇用系の助成金（社労士確認が多い）が狙えます。",
    name: "採用", uses: ["人を採用したい"], categories: ["雇用", "人材"],
    tags: ["採用", "雇用", "正社員", "人材"],
    genres: ["キャリアアップ助成金", "雇用関係助成金"],
    requiredFields: ["所在地", "法人種別", "従業員数", "雇用形態"],
    caution: "雇用系の助成金は、社労士の確認や事前の計画届が必要な場合があります。先に確認してください。",
    expenses: ["人件費"], killers: ["事前の計画届が必要なことがある", "対象労働者・期間の要件を満たさない可能性"],
    nextActions: ["公式の公募要領を確認する", "社労士に相談する", "従業員数・雇用形態を確認する"],
    questions: [{ id: "type", q: "どんな採用ですか？", options: ["新規採用", "正社員化", "アルバイト", "わからない"] }],
  },
  {
    key: "training", label: "研修したい", description: "社員研修・人材育成。人材開発支援助成金などが狙えます。",
    name: "社員研修", uses: ["研修したい"], categories: ["研修", "人材育成"],
    tags: ["研修", "教育", "人材育成"],
    genres: ["人材開発支援助成金", "雇用関係助成金"],
    requiredFields: ["所在地", "法人種別", "従業員数", "研修内容"],
    caution: "研修系の助成金は、事前の計画提出・社労士の確認が必要な場合があります。先に確認してください。",
    expenses: ["研修費", "人件費"], killers: ["事前の計画提出が必要なことがある", "対象研修・時間の要件を満たさない可能性"],
    nextActions: ["公式の公募要領を確認する", "社労士に相談する", "研修内容を確認する"],
    questions: [{ id: "kind", q: "研修の種類は？", options: ["技能研修", "OJT", "外部研修", "わからない"] }],
  },
  {
    key: "energy", label: "省エネ設備を入れたい", description: "LED・高効率機器など省エネ設備。省エネ補助金が狙えます。",
    name: "省エネ設備導入", uses: ["省エネ設備を入れたい"], categories: ["省エネ", "設備導入"],
    tags: ["省エネ", "LED", "設備", "高効率"],
    genres: ["省エネ設備導入補助金", "自治体の省エネ補助"],
    requiredFields: ["所在地", "予算", "発注状況", "見積状況", "省エネ性能・型番"],
    caution: PRE_ORDER_CAUTION + " 省エネ性能・型番・見積が必要になる可能性があります。",
    expenses: ["機械装置費", "設備費"], killers: ["発注・契約後だと対象外の可能性", "省エネ性能が要件に達しない可能性"],
    nextActions: ["発注前か確認する", "公式の公募要領を確認する", "見積を取得する", "省エネ性能・型番を確認する"],
    questions: [{ id: "spec", q: "省エネ性能・型番は分かりますか？", options: ["分かる", "これから確認"] }],
  },
  {
    key: "newstore", label: "新店舗を出したい", description: "新規出店・開業。創業補助金や空き店舗活用が狙えます。",
    name: "新店舗出店", uses: ["新店舗を出したい", "店舗を改装したい"], categories: ["新店舗出店", "創業", "内装工事"],
    tags: ["新店舗", "出店", "創業", "改装"],
    genres: ["創業補助金", "空き店舗活用", "自治体の出店補助"],
    requiredFields: ["所在地", "予算", "発注状況", "創業年数"],
    caution: PRE_ORDER_CAUTION + " 物件・内装・創業要件の確認が必要になる場合があります。",
    expenses: ["内装工事費", "設備費", "委託費"], killers: ["発注・契約後だと対象外の可能性", "創業時期・要件を満たさない可能性"],
    nextActions: ["発注前か確認する", "公式の公募要領を確認する", "創業要件を確認する", "見積を取得する"],
    questions: [{ id: "stage", q: "出店の段階は？", options: ["物件検討中", "物件決定", "内装見積中", "わからない"] }],
  },
];

export function getTemplate(key: string | null | undefined): ProjectTemplate | null {
  if (!key) return null;
  return PROJECT_TEMPLATES.find((t) => t.key === key) ?? null;
}

// 支出テーマのカテゴリ分け（「今日やること」と混同しないよう、テーマはカテゴリで見せる）
export const PROJECT_TEMPLATE_GROUPS: { title: string; keys: string[] }[] = [
  { title: "店舗・設備", keys: ["aircon", "renovation", "signboard", "newstore", "energy"] },
  { title: "IT・DX", keys: ["ai_pos", "ec", "website"] },
  { title: "広告・販路", keys: ["ad", "event"] },
  { title: "採用・研修", keys: ["hire", "training"] },
];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  none: "まだ何もしていない",
  estimate: "見積だけ取った",
  contract: "契約した",
  ordered: "発注した",
  paid: "支払い済み",
};

export const URGENCY_LABEL: Record<Urgency, string> = { low: "ゆっくり", mid: "ふつう", high: "急ぎ" };

export function formatBudget(yen: number): string {
  if (yen >= 100_000_000) return `${(yen / 100_000_000).toLocaleString()}億円`;
  return `${Math.round(yen / 10_000).toLocaleString()}万円`;
}

// 用途タグ（相談ウィザードと共通の言い回し。synonyms 辞書が反応する語）
export const PURPOSE_TAGS = [
  "空調を入れ替えたい", "店舗を改装したい", "看板を作りたい", "ホームページを作りたい",
  "ECを強化したい", "AI・在庫管理・POSを入れたい", "広告を出したい", "イベントを開催したい",
  "人を採用したい", "研修したい", "新店舗を出したい", "省エネ設備を入れたい", "セキュリティを強化したい",
];

export const PROJECT_CHECKLIST: { key: string; label: string }[] = [
  { key: "pre_order", label: "発注前か確認した" },
  { key: "guideline", label: "公式の公募要領を確認した" },
  { key: "expense", label: "対象経費を確認した" },
  { key: "area", label: "対象地域を確認した" },
  { key: "employees", label: "従業員数の要件を確認した" },
  { key: "gbizid", label: "GビズIDを確認した" },
  { key: "estimate", label: "見積書を取得した" },
  { key: "shokokai", label: "商工会議所に相談した" },
  { key: "pro", label: "士業（社労士・行政書士等）に確認した" },
  { key: "deadline", label: "申請締切を確認した" },
];

// 発注してよいか / 待つべきか
export function orderAdvice(s: OrderStatus): { wait: boolean; tone: string; icon: string; title: string; text: string } {
  // 色：未発注=アンバー、見積のみ=青、発注済み=赤。緑は「進めてOK」に見えるため使わない。
  if (s === "none") {
    return {
      wait: true, tone: "border-amber-300 bg-amber-50 text-amber-800", icon: "🟠",
      title: "まだ発注しないでください",
      text: "この支出は補助金を使えるかもしれません。契約・注文する前に、公式サイトで条件（対象になる費用・締切）を確認しましょう。",
    };
  }
  if (s === "estimate") {
    return {
      wait: true, tone: "border-sky-300 bg-sky-50 text-sky-800", icon: "🔵",
      title: "見積もりだけなら、まだ間に合うかもしれません",
      text: "契約・注文・支払いをする前に、公式サイトで「対象になる費用」と「募集期間」を確認しましょう。",
    };
  }
  return {
    wait: false, tone: "border-red-300 bg-red-50 text-red-700", icon: "🔴",
    title: "この費用は対象外になるかもしれません",
    text: "すでに契約・注文・支払い済みの費用は、補助金の対象外になることがあります。ただし、別の費用や次回の募集なら使えることもあるので確認しましょう。",
  };
}

// 判定を強くするために足りない情報（最大3件・入力済みは出さない）
export function missingInfo(project: SpendingProject): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  if (project.budget == null) out.push({ key: "budget", label: "見積・予算はいくらですか？" });
  if (project.employees == null) out.push({ key: "employees", label: "従業員数は何人ですか？" });
  if (!project.location) out.push({ key: "location", label: "どこで使いますか？（市区町村）" });
  if (!project.industry) out.push({ key: "industry", label: "業種は何ですか？" });
  if (!project.schedule) out.push({ key: "schedule", label: "いつ頃実施しますか？" });
  return out.slice(0, 3);
}

// 概算の補助額イメージ（断定しない。補助率不明なら null）
export function estimateRange(project: SpendingProject): { budget: number; low: number; high: number; rateLabel: string } | null {
  if (project.budget == null) return null;
  return { budget: project.budget, low: Math.round(project.budget * 0.5), high: Math.round((project.budget * 2) / 3), rateLabel: "1/2〜2/3" };
}

// 相談用メモ（商工会議所・士業・自治体窓口向け）を生成
export function generateConsultMemo(project: SpendingProject, coreNames: string[]): string {
  const where = project.location || "（地域未入力）";
  const budget = project.budget != null ? `約${formatBudget(project.budget)}` : "（予算未入力）";
  const order = ORDER_STATUS_LABEL[project.orderStatus];
  const theme = project.uses[0] || project.purpose || project.name || "支出";
  const programs = coreNames.slice(0, 3).join("、") || "関係する補助金";
  return [
    "【相談したい内容】",
    `${where}で「${theme}」を予定しています。予算は${budget}、現在は「${order}」の状況です。`,
    `${programs} の対象になるか確認したいです。`,
    "",
    "【確認したいこと】",
    "1. 発注前に申請が必要か",
    "2. この支出が対象経費になるか",
    "3. 申請期限・募集期間",
    "4. 必要書類",
    "5. 商工会議所・事前相談が必要か",
    "",
    "【相談先候補】",
    "・商工会議所／商工会",
    "・自治体の産業振興課",
    "・認定支援機関",
    "・社労士／行政書士／税理士",
  ].join("\n");
}

// 見積依頼メモ（支出テーマ別の記載依頼）を生成
export function generateEstimateMemo(project: SpendingProject): string {
  const tk = project.templateKey ?? "";
  const head = "補助金申請を検討しているため、見積書には以下を記載してください。";
  let items: string[];
  if (["aircon", "energy"].includes(tk)) {
    items = ["機器名", "型番", "数量", "単価", "工事費", "既存機器の撤去費", "省エネ性能が分かる資料", "発行日", "宛名"];
  } else if (["ai_pos", "ec", "website"].includes(tk)) {
    items = ["ツール名", "初期費用", "月額費用", "導入支援費", "保守費", "対象ツール登録の有無", "ベンダー名", "発行日", "宛名"];
  } else if (["ad", "signboard", "event"].includes(tk)) {
    items = ["制作物の内容", "掲載期間", "制作費", "広告運用費", "デザイン費", "印刷費", "施工費", "発行日", "宛名"];
  } else {
    items = ["品目・内容", "数量", "単価", "工事費・委託費", "発行日", "宛名"];
  }
  return [head, "", ...items.map((i) => `・${i}`)].join("\n");
}

// ---- localStorage ストア ----
const KEY = "spending_projects_v1";

// 既存データ（古い形）でも壊れないよう、足りない項目を補完して正規化する。
//   templateKey が無い案件は custom（テンプレ無し）として扱う。
function normalize(p: any): SpendingProject {
  const base = emptyProject();
  return {
    ...base,
    ...p,
    uses: Array.isArray(p?.uses) ? p.uses : [],
    checklist: p?.checklist && typeof p.checklist === "object" ? p.checklist : {},
    answers: p?.answers && typeof p.answers === "object" ? p.answers : {},
    coreChecks: p?.coreChecks && typeof p.coreChecks === "object" ? p.coreChecks : {},
    templateKey: typeof p?.templateKey === "string" ? p.templateKey : "",
    urgency: p?.urgency ?? "mid",
    orderStatus: p?.orderStatus ?? "none",
    id: p?.id ?? base.id,
  };
}

export function loadProjects(): SpendingProject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as any[]) : [];
    return Array.isArray(list) ? list.map(normalize) : [];
  } catch {
    return [];
  }
}

function persist(list: SpendingProject[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event("projects-changed"));
}

export function getProject(id: string): SpendingProject | null {
  return loadProjects().find((p) => p.id === id) ?? null;
}

export function newProjectId(): string {
  return (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `p_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function emptyProject(): SpendingProject {
  const now = new Date().toISOString();
  return {
    id: newProjectId(), name: "", purpose: "", uses: [], store: "", location: "", entity: "", industry: "",
    employees: null, budget: null, schedule: "", orderStatus: "none", urgency: "mid", memo: "",
    checklist: {}, templateKey: "", answers: {}, coreChecks: {}, created_at: now, updated_at: now,
  };
}

export function upsertProject(p: SpendingProject): SpendingProject {
  const list = loadProjects();
  const idx = list.findIndex((x) => x.id === p.id);
  const saved = { ...p, updated_at: new Date().toISOString() };
  if (idx >= 0) list[idx] = saved;
  else list.unshift(saved);
  persist(list);
  // クラウドへ反映（ベストエフォート。失敗してもローカルは保持する）
  pushProjectToCloud(saved);
  return saved;
}

export function deleteProject(id: string) {
  persist(loadProjects().filter((p) => p.id !== id));
  if (supabaseConfigured) {
    deleteSpendingProjectRow(id).catch((e) => console.warn("[projects] cloud delete failed:", e?.message ?? e));
  }
}

// ---- Supabase 同期（任意。未設定なら何もしない） ----
//   ローカル(localStorage)を即時キャッシュにしつつ、共有保存先(Supabase)と突き合わせる。
//   競合は updated_at の新しい方を採用（last-write-wins）。

function projectToRow(p: SpendingProject): SpendingProjectRow {
  return {
    id: p.id, name: p.name, purpose: p.purpose, uses: p.uses, store: p.store, location: p.location,
    entity: p.entity, industry: p.industry, employees: p.employees, budget: p.budget, schedule: p.schedule,
    order_status: p.orderStatus, urgency: p.urgency, memo: p.memo, checklist: p.checklist,
    template_key: p.templateKey ?? "", answers: p.answers ?? {}, core_checks: p.coreChecks ?? {},
    created_at: p.created_at, updated_at: p.updated_at,
  };
}

export function rowToProject(r: SpendingProjectRow): SpendingProject {
  return normalize({
    id: r.id, name: r.name ?? "", purpose: r.purpose ?? "", uses: r.uses, store: r.store ?? "",
    location: r.location ?? "", entity: r.entity ?? "", industry: r.industry ?? "",
    employees: r.employees != null ? Number(r.employees) : null, budget: r.budget != null ? Number(r.budget) : null, schedule: r.schedule ?? "",
    orderStatus: r.order_status ?? "none", urgency: r.urgency ?? "mid", memo: r.memo ?? "",
    checklist: r.checklist, templateKey: r.template_key ?? "", answers: r.answers, coreChecks: r.core_checks,
    created_at: r.created_at ?? new Date().toISOString(), updated_at: r.updated_at ?? new Date().toISOString(),
  });
}

function pushProjectToCloud(p: SpendingProject) {
  if (!supabaseConfigured) return;
  upsertSpendingProjectRow(projectToRow(p)).catch((e) => console.warn("[projects] cloud upsert failed:", e?.message ?? e));
}

// 直接 localStorage に書く（イベントは呼び出し側で制御）。同期マージ用。
function writeCache(list: SpendingProject[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(list));
}

let syncInFlight: Promise<SpendingProject[]> | null = null;

// Supabase と localStorage を突き合わせて最新化する。
//   - 両方にある案件は updated_at が新しい方を採用
//   - ローカルにしか無い案件は Supabase へ移行（push）
//   - Supabase にしか無い案件はローカルへ取り込む
//   未設定・失敗時はローカルをそのまま返す（止めない）。
export async function syncProjectsFromSupabase(): Promise<SpendingProject[]> {
  const local = loadProjects();
  if (!supabaseConfigured || typeof window === "undefined") return local;
  if (syncInFlight) return syncInFlight;
  syncInFlight = (async () => {
    try {
      const rows = await fetchSpendingProjectRows();
      const remote = rows.map(rowToProject);
      const byId = new Map<string, SpendingProject>();
      for (const p of remote) byId.set(p.id, p);
      const toPush: SpendingProject[] = [];
      for (const lp of local) {
        const rp = byId.get(lp.id);
        if (!rp) { byId.set(lp.id, lp); toPush.push(lp); }          // ローカルのみ → 移行
        else if (Date.parse(lp.updated_at) > Date.parse(rp.updated_at)) { byId.set(lp.id, lp); toPush.push(lp); } // ローカルが新しい
      }
      const merged = [...byId.values()].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
      writeCache(merged);
      window.dispatchEvent(new Event("projects-changed"));
      // ローカル優先分を裏で push（移行・競合解決）
      await Promise.allSettled(toPush.map((p) => upsertSpendingProjectRow(projectToRow(p))));
      return merged;
    } catch (e) {
      console.warn("[projects] sync failed (localStorage を継続使用):", (e as any)?.message ?? e);
      return local;
    } finally {
      syncInFlight = null;
    }
  })();
  return syncInFlight;
}

// ---- 案件 → 仮想の事業プロフィール（案件×補助金 判定の入力） ----
export function projectToProfile(p: SpendingProject): BusinessProfile {
  const tpl = getTemplate(p.templateKey);
  const answerText = Object.values(p.answers ?? {}).join(" ");
  // 判定テキスト：案件の実際の意図（uses/purpose/回答）＋テンプレの categories/tags（具体語）。
  // ※ genres（関係しそうな補助金ジャンル名）は displayConfidence を強めすぎるため CORE には入れない。
  //   ジャンルの近さは verifyItem 側の目的カテゴリ近接（possible 判定）＝見逃しリスクで拾う。
  const text = [
    p.name, p.purpose, p.uses.join(" "), p.industry, p.store, answerText,
    (tpl?.tags ?? []).join(" "), (tpl?.categories ?? []).join(" "),
  ].filter(Boolean).join(" ");
  const ex = expandQuery(text);
  const regions = Array.from(new Set([...expandRegions(p.location), ...expandRegions(p.store), ...expandRegions(p.name)]));
  const now = new Date().toISOString();
  return {
    id: `project:${p.id}`,
    name: p.name || "支出案件",
    entity_type: p.entity || null,
    location: p.location || null,
    regions,
    industries: Array.from(new Set([...(p.industry ? [p.industry] : []), ...ex.industries])),
    description: p.purpose || null,
    purposes: ex.purposes,
    // テンプレの「よくある対象経費」を明示的に経費カテゴリへ反映（経費近似判定に重要）
    expenses: Array.from(new Set([...ex.expenses, ...(tpl?.expenses ?? [])])),
    keywords: Array.from(new Set([...ex.keywords, ...p.uses, ...(tpl?.tags ?? [])])),
    exclude_keywords: [],
    desired_amount: p.budget,
    notes: p.memo || null,
    created_at: now,
    updated_at: now,
  };
}

// 今日やること＝申請準備タスク（支出テーマは含めない）。優先度付き・重複排除。
export type ProjectTask = {
  projectId: string;
  projectName: string;
  taskKey: string;
  action: string;
  reason: string;
  priority: number; // 小さいほど優先
  source: "basic" | "core_program" | "deadline" | "project_missing_info";
  relatedProgramKeys?: string[];
  relatedProgramNames?: string[];
  isCompleted?: boolean;
};

const IT_USE = /(AI|POS|在庫|EC|ホームページ|システム|DX|デジタル)/i;

// taskKey ごとの優先度（小さいほど上）
const TASK_PRIORITY: Record<string, number> = {
  pre_order: 1, deadline: 2, guideline: 3, estimate: 4, gbizid: 5,
  employees: 6, budget: 7, expense: 8, it_tool: 9, it_provider: 10,
  shokokai: 11, area_check: 12, purpose_check: 13, pro: 14, spec_check: 15,
  chinage: 16, koyou: 17, training_plan: 18,
};
// 定番制度の短縮名（理由の併記用）
const PROGRAM_SHORT: Record<string, string> = {
  it_donyu: "IT導入補助金", jizokuka: "小規模事業者持続化補助金", local_energy: "省エネ補助金",
  local_vacant: "空き店舗補助金", gyomu_kaizen: "業務改善助成金", career_up: "キャリアアップ助成金",
  jinzai_kaihatsu: "人材開発支援助成金", monozukuri: "ものづくり補助金", shoryokuka: "省力化投資補助金",
};

type Contribution = { taskKey: string; action: string; reason: string; source: ProjectTask["source"]; programKey?: string };

// 案件の申請準備タスクを優先度順に「すべて」返す（重複は taskKey でまとめる）。
export function getAllProjectTasks(project: SpendingProject, match?: ProjectMatch): ProjectTask[] {
  const c = project.checklist ?? {};
  const tpl = getTemplate(project.templateKey);
  const usesText = `${project.name} ${project.purpose} ${project.uses.join(" ")} ${(tpl?.tags ?? []).join(" ")}`;
  const isIT = IT_USE.test(usesText) || ["ai_pos", "ec", "website"].includes(project.templateKey ?? "");
  const dd = match?.top ? match.top.r.lc.deadlineDays : null;
  const contribs: Contribution[] = [];

  // 基本タスク
  if ((project.orderStatus === "none" || project.orderStatus === "estimate") && !c["pre_order"])
    contribs.push({ taskKey: "pre_order", action: "発注前か確認してください", reason: "発注済みだと対象外になる補助金があります", source: "basic" });
  if (dd != null && dd >= 0 && dd <= 14 && !c["deadline"])
    contribs.push({ taskKey: "deadline", action: "締切が近い制度を確認してください", reason: `あと${dd}日の候補があります`, source: "deadline" });
  if (!c["guideline"]) contribs.push({ taskKey: "guideline", action: "公式の公募要領を確認してください", reason: "対象経費・締切・条件を確認できます", source: "basic" });
  if (!c["estimate"]) contribs.push({ taskKey: "estimate", action: "見積を取得しましょう", reason: "多くの補助金で見積書が必要になります", source: "basic" });
  if (isIT && !c["gbizid"]) contribs.push({ taskKey: "gbizid", action: "GビズIDを確認してください", reason: "IT・DX系補助金で必要になります", source: "basic" });
  if (project.employees == null) contribs.push({ taskKey: "employees", action: "従業員数を入力してください", reason: "小規模事業者向け補助金の判定に必要です", source: "project_missing_info" });
  if (project.budget == null) contribs.push({ taskKey: "budget", action: "予算を入力してください", reason: "対象になる補助金を見つけやすくなります", source: "project_missing_info" });

  // 定番制度（CORE）由来タスク。確認済み(done)・対象外(skip)は出さない。
  const activeCore = new Set(
    getCoreProgramChecks(project).filter((cc) => !["done", "skip"].includes(project.coreChecks?.[cc.key] ?? "")).map((cc) => cc.key)
  );
  const core = (key: string, taskKey: string, action: string, reason: string) => {
    if (activeCore.has(key) && !c[taskKey]) contribs.push({ taskKey, action, reason, source: "core_program", programKey: key });
  };
  core("it_donyu", "gbizid", "GビズIDを確認してください", "");
  core("it_donyu", "it_tool", "対象ツールに登録されているか確認してください", "");
  core("it_donyu", "it_provider", "IT導入支援事業者が必要か確認してください", "");
  core("jizokuka", "employees", "従業員数を入力してください", "");
  core("jizokuka", "shokokai", "商工会／商工会議所に相談してください", "");
  core("jizokuka", "purpose_check", "販路開拓が目的か確認してください", "");
  core("local_energy", "spec_check", "設備の型番・省エネ性能を確認してください", "");
  core("monozukuri", "expense", "対象経費を確認してください", "");
  core("shoryokuka", "expense", "対象経費を確認してください", "");
  core("it_donyu", "expense", "対象経費を確認してください", "");
  core("local_vacant", "area_check", "対象区域・賃貸契約前か・事前相談を確認してください", "");
  core("gyomu_kaizen", "chinage", "賃上げ予定・事業場内最低賃金を確認してください", "");
  core("gyomu_kaizen", "employees", "従業員がいるか（従業員数）を確認してください", "");
  core("gyomu_kaizen", "pro", "社会保険労務士に相談してください", "");
  core("career_up", "koyou", "雇用形態・就業規則を確認してください", "");
  core("career_up", "pro", "社会保険労務士に相談してください", "");
  core("jinzai_kaihatsu", "training_plan", "研修内容・訓練時間・事前届出を確認してください", "");
  core("jinzai_kaihatsu", "pro", "社会保険労務士に相談してください", "");

  // taskKey で重複排除（複数制度に関係する場合は理由に併記）
  const byKey = new Map<string, { action: string; baseReason: string; source: ProjectTask["source"]; keys: Set<string>; names: Set<string> }>();
  for (const c0 of contribs) {
    const e = byKey.get(c0.taskKey);
    const short = c0.programKey ? PROGRAM_SHORT[c0.programKey] : undefined;
    if (!e) byKey.set(c0.taskKey, { action: c0.action, baseReason: c0.reason, source: c0.source, keys: c0.programKey ? new Set([c0.programKey]) : new Set(), names: short ? new Set([short]) : new Set() });
    else { if (c0.programKey) e.keys.add(c0.programKey); if (short) e.names.add(short); }
  }

  const base = { projectId: project.id, projectName: project.name || "支出案件" };
  const tasks: ProjectTask[] = [];
  for (const [taskKey, e] of byKey) {
    const names = [...e.names];
    const reason = names.length > 0 ? `${names.join("・")}で必要です` : e.baseReason;
    tasks.push({
      ...base, taskKey, action: e.action, reason,
      priority: TASK_PRIORITY[taskKey] ?? 50, source: e.source,
      relatedProgramKeys: [...e.keys], relatedProgramNames: names, isCompleted: false,
    });
  }
  return tasks.sort((a, b) => a.priority - b.priority);
}

// ホーム用：未完了・優先度順・最大 limit 件（既定3件）
export function getTopProjectTasks(project: SpendingProject, match?: ProjectMatch, limit = 3): ProjectTask[] {
  return getAllProjectTasks(project, match).slice(0, limit);
}
// 既存互換の別名
export const projectTasks = getAllProjectTasks;

// 案件ごとの「今日やること」を1つだけ返す（最優先）。完了済みなら null。
export function nextTask(project: SpendingProject, match?: ProjectMatch): ProjectTask | null {
  return projectTasks(project, match)[0] ?? null;
}

// ---- 案件 × 補助金 のトリアージ ----
export type ProjectEntry = { item: DiscoveredItem; r: TriageResult; v: VerifyResult };
export type ProjectMatch = {
  grouped: Map<TriageKey, ProjectEntry[]>;
  top: ProjectEntry | null; // 最有力候補
  total: number;
  hidden: number; // ノイズ等でユーザー非表示にした件数
  missRisk: "高" | "中" | "低"; // 見逃しリスク
};

export function classifyForProject(project: SpendingProject, items: DiscoveredItem[]): ProjectMatch {
  const profile = projectToProfile(project);
  const active = items.filter(
    (i) => !isSampleDiscovered(i) && i.status !== "rejected" && i.status !== "ignored" && i.status !== "imported"
  );
  const grouped = new Map<TriageKey, ProjectEntry[]>();
  let total = 0;
  let hidden = 0;
  for (const item of active) {
    const r = triageDiscovered(item, [profile]);
    // 案件と無関係（スコア0かつ地域/用途ヒットなし）は除外して候補を絞る
    if (r.score === 0 && r.key !== "missed" && r.key !== "deadline") continue;
    // 検証ゲート：ノイズ・古い/終了・制度外はユーザー候補にしない（管理者画面で確認）
    const v = verifyItem(item, profile);
    if (!v.userVisible) { hidden++; continue; }
    if (!grouped.has(r.key)) grouped.set(r.key, []);
    grouped.get(r.key)!.push({ item, r, v });
    total++;
  }
  for (const [, arr] of grouped) arr.sort((a, b) => b.r.score - a.r.score);

  // 最有力候補（usable→conditional→deadline→missed→next_time の順で先頭）
  let top: ProjectEntry | null = null;
  for (const k of TRIAGE_ORDER) {
    const arr = grouped.get(k);
    if (arr && arr.length) { top = arr[0]; break; }
  }

  // 見逃しリスク：案件の情報が少ないほど高い
  const filled = [project.location, project.entity, project.industry, project.budget != null, project.uses.length > 0].filter(Boolean).length;
  const missRisk = filled <= 2 ? "高" : filled <= 3 ? "中" : "低";

  return { grouped, top, total, hidden, missRisk };
}
