// 支出案件（Spending Project）：このツールの新しい主語。
//   ユーザーは「補助金名」ではなく「この支出に使える補助金があるか」を知りたい。
//   案件を登録し、案件 × 補助金 で候補を判定する。
//   MVP はブラウザの localStorage に保存（SQL不要で即動作。将来サーバ同期に拡張可能）。

import type { BusinessProfile, DiscoveredItem } from "./types";
import { expandQuery, expandRegions } from "./synonyms";
import { triageDiscovered, TRIAGE_ORDER, type TriageKey, type TriageResult } from "./triage";
import { verifyItem, type VerifyResult } from "./verify";
import { isSampleDiscovered } from "./sampleFilter";

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
  created_at: string;
  updated_at: string;
};

// 支出案件テンプレート（初心者は自由入力が難しいので、まず「何をしたい」をカードで選ばせる）
export type TemplateQuestion = { id: string; q: string; options: string[] };
export type ProjectTemplate = {
  key: string;
  label: string; // 何をしたいですか（選択肢の表示）
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
export function orderAdvice(s: OrderStatus): { wait: boolean; tone: string; title: string; text: string } {
  if (s === "none" || s === "estimate") {
    return {
      wait: true,
      tone: "border-green-200 bg-green-50 text-green-800",
      title: s === "none" ? "まだ発注しないでください（申請できる可能性があります）" : "契約・発注の前に確認しましょう（まだ間に合う可能性）",
      text: "補助金は交付決定前の契約・発注・支払いが対象外になることが多いです。先に公式の公募要領を確認してください。",
    };
  }
  return {
    wait: false,
    tone: "border-amber-200 bg-amber-50 text-amber-800",
    title: "この経費は対象外の可能性があります",
    text: "すでに契約・発注・支払い済みの経費は対象外になる可能性があります。ただし、追加経費・別の経費・次回公募で使える可能性はあります。",
  };
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
    checklist: {}, templateKey: "", answers: {}, created_at: now, updated_at: now,
  };
}

export function upsertProject(p: SpendingProject): SpendingProject {
  const list = loadProjects();
  const idx = list.findIndex((x) => x.id === p.id);
  const saved = { ...p, updated_at: new Date().toISOString() };
  if (idx >= 0) list[idx] = saved;
  else list.unshift(saved);
  persist(list);
  return saved;
}

export function deleteProject(id: string) {
  persist(loadProjects().filter((p) => p.id !== id));
}

// ---- 案件 → 仮想の事業プロフィール（案件×補助金 判定の入力） ----
export function projectToProfile(p: SpendingProject): BusinessProfile {
  const tpl = getTemplate(p.templateKey);
  const answerText = Object.values(p.answers ?? {}).join(" ");
  const text = `${p.name} ${p.purpose} ${p.uses.join(" ")} ${p.industry} ${p.store} ${answerText} ${(tpl?.tags ?? []).join(" ")}`;
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
    expenses: ex.expenses,
    keywords: Array.from(new Set([...ex.keywords, ...p.uses])),
    exclude_keywords: [],
    desired_amount: p.budget,
    notes: p.memo || null,
    created_at: now,
    updated_at: now,
  };
}

// 案件ごとの「今日やること」を1つだけ返す（最も重要なものを優先）。完了済みなら null。
export type ProjectTask = { projectId: string; projectName: string; action: string; reason: string };

const IT_USE = /(AI|POS|在庫|EC|ホームページ|システム|DX|デジタル)/i;

// 案件の「やること」を重要な順に全部返す（未完了の確認だけ）。
export function projectTasks(project: SpendingProject, match?: ProjectMatch): ProjectTask[] {
  const c = project.checklist ?? {};
  const base = { projectId: project.id, projectName: project.name || "支出案件" };
  const tpl = getTemplate(project.templateKey);
  const usesText = `${project.name} ${project.purpose} ${project.uses.join(" ")} ${(tpl?.tags ?? []).join(" ")}`;
  const isIT = IT_USE.test(usesText) || ["ai_pos", "ec", "website"].includes(project.templateKey ?? "");
  const out: ProjectTask[] = [];

  if ((project.orderStatus === "none" || project.orderStatus === "estimate") && !c["pre_order"]) {
    out.push({ ...base, action: "発注前か確認してください", reason: "発注済みだと対象外になる補助金があります" });
  }
  // IT/DX系はGビズIDを上位に
  if (isIT && !c["gbizid"]) {
    out.push({ ...base, action: "GビズIDを確認してください", reason: "IT・DX系補助金で必要になる可能性があります" });
  }
  if (project.employees == null) {
    out.push({ ...base, action: "従業員数を入力してください", reason: "小規模事業者向け補助金の判定に必要です" });
  }
  if (project.budget == null) {
    out.push({ ...base, action: "予算を入力してください", reason: "対象になる補助金を見つけやすくなります" });
  }
  const dd = match?.top ? match.top.r.lc.deadlineDays : null;
  if (dd != null && dd >= 0 && dd <= 14 && !c["deadline"]) {
    out.push({ ...base, action: "締切が近い制度があります。締切を確認してください", reason: `あと${dd}日の候補があります` });
  }
  if (!c["guideline"]) {
    out.push({ ...base, action: "公式の公募要領を確認してください", reason: "対象経費・締切・条件を確認できます" });
  }
  if (!c["estimate"]) {
    out.push({ ...base, action: "見積を取得しましょう", reason: "多くの補助金で見積書が必要になります" });
  }
  return out;
}

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
