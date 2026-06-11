// 補助金トリアージ：初心者が「使える/条件確認/見逃し注意/締切/次回/定番/新着」を
// 迷わず判断できるよう、discovered_items を 8 分類し「結論」文を付ける。
//   思想：対象外と断定できない限り消さない（見逃し防止）。低スコアでも
//   「条件確認」「見逃し注意」「次回狙い」「一般確認推奨」に振り分ける。

import type { DiscoveredItem, BusinessProfile } from "./types";
import { scoreDiscoveredAgainstProfiles, ruleExtract } from "./discovery";
import { lifecycle, extractStartDate, feasibility, preparation, type Lifecycle } from "./lifecycle";
import { daysUntil } from "./utils";

export type TriageKey =
  | "usable" // 使える可能性が高い
  | "conditional" // 条件確認で使えるかも
  | "missed" // 見逃し注意
  | "deadline" // 締切注意
  | "next_time" // 次回狙い
  | "unusable" // 今は使えない
  | "new"; // 新着・更新

export const TRIAGE_META: Record<TriageKey, { label: string; head: string; tone: string; bar: string; chip: string; icon: string }> = {
  usable: { label: "使える可能性が高い", head: "この補助金は使える可能性が高いです", tone: "border-green-300 bg-green-50", bar: "bg-green-500", chip: "bg-green-100 text-green-800", icon: "✅" },
  conditional: { label: "条件確認で使えるかも", head: "あと少し確認すれば使えるか判断できます", tone: "border-amber-300 bg-amber-50", bar: "bg-amber-400", chip: "bg-amber-100 text-amber-800", icon: "🟡" },
  missed: { label: "見逃し注意", head: "情報が不足していますが、対象外とは限りません", tone: "border-orange-300 bg-orange-50", bar: "bg-orange-400", chip: "bg-orange-100 text-orange-800", icon: "👀" },
  deadline: { label: "締切注意", head: "締切が近いので急いで確認してください", tone: "border-red-300 bg-red-50", bar: "bg-red-500", chip: "bg-red-100 text-red-700", icon: "⚠️" },
  next_time: { label: "次回狙い", head: "今回は終了していますが、次回狙う価値があります", tone: "border-sky-300 bg-sky-50", bar: "bg-sky-500", chip: "bg-sky-100 text-sky-800", icon: "🔵" },
  unusable: { label: "今は使えない", head: "今は対象外の可能性が高いです", tone: "border-gray-300 bg-gray-50", bar: "bg-gray-300", chip: "bg-gray-100 text-gray-500", icon: "－" },
  new: { label: "新着・更新", head: "新しく見つかりました（くわしい判定はこれから）", tone: "border-violet-300 bg-violet-50", bar: "bg-violet-400", chip: "bg-violet-100 text-violet-800", icon: "🆕" },
};

// 表示順（上にあるほど初心者が見落としやすい/重要）
export const TRIAGE_ORDER: TriageKey[] = ["usable", "conditional", "missed", "deadline", "next_time", "new", "unusable"];

// 次回狙いに値する定番テーマ（終了していても準備すれば次回使える可能性）
const RECURRING_THEMES = /(空調|省エネ|IT|DX|AI|広告|EC|ネットショップ|店舗改装|改装|採用|研修|販路|設備|生産性|持続化|ものづくり)/i;

export type TriageResult = {
  key: TriageKey;
  conclusion: string; // 「結論：…」の本文（接頭辞なし）
  possibility: string; // 高 / 中 / 低 / 条件確認 / 見逃し注意 / 次回狙い
  score: number;
  why: string; // なぜ候補に出たか
  uses: string[]; // 使えそうな用途
  killers: string[]; // ダメになる条件
  missing: string[]; // 判定に足りない情報
  nextActions: string[]; // 今すぐやること
  deadline: string | null;
  lc: Lifecycle;
  feas: { label: string; tone: string };
  prep: { label: string; tone: string };
  officialConfirmed: boolean;
  secondary: boolean;
};

const POSSIBILITY: Record<TriageKey, string> = {
  usable: "高", conditional: "条件確認", missed: "見逃し注意", deadline: "要確認", next_time: "次回狙い", unusable: "低", new: "確認中",
};

export function triageDiscovered(item: DiscoveredItem, profiles: BusinessProfile[]): TriageResult {
  const sc = scoreDiscoveredAgainstProfiles(item, profiles);
  const ex = ruleExtract(item);
  const start = extractStartDate(item.raw_text);
  const deadline = item.extracted_deadline ?? sc.deadline;
  const lc = lifecycle(start, deadline);
  const score = item.match_score ?? sc.bestScore;
  const officialConfirmed = !!item.official_source_confirmed;
  const trust = item.trust_level ?? "E";
  const secondary = trust === "C" || trust === "D" || trust === "E";
  const text = `${item.title ?? ""}\n${item.raw_text ?? ""}`;

  // 足りない情報（公式未確認・経費不明・締切不明・対象事業者不明）
  const missing: string[] = [];
  if (!officialConfirmed) missing.push("公式ページの確認");
  if (ex.eligible_expenses.length === 0) missing.push("対象経費");
  if (!deadline) missing.push("締切・募集期間");
  if (ex.target_regions.length === 0) missing.push("対象地域");

  // ダメになる条件（初心者が引っかかりやすい注意）
  const killers: string[] = [];
  if (ex.pre_application_ng_risk || /(交付決定前|事前着手|着手前|契約.{0,4}前|発注.{0,4}前)/.test(text)) killers.push("発注・契約後だと対象外の可能性");
  if (/(予算上限|先着|なくなり次第|早期終了)/.test(text)) killers.push("予算上限で早期終了の可能性");
  if (ex.professional_check_recommended) killers.push("士業・専門家の確認が必要なことがある");

  // 今すぐやること
  const nextActions: string[] = [];
  nextActions.push(officialConfirmed ? "公式ページで最終確認する" : "公式ページを確認する");
  if (ex.eligible_expenses.length === 0) nextActions.push("対象経費を確認する");
  if (killers.some((k) => k.includes("発注"))) nextActions.push("発注・契約前か確認する");
  if (!deadline) nextActions.push("締切・募集期間を確認する");

  const dd = daysUntil(deadline);
  const ended = lc.key === "ended";
  const recurring = RECURRING_THEMES.test(text);

  // ---- 分類（見逃し防止を最優先：断定できないものは消さない） ----
  let key: TriageKey;
  if (ended) {
    key = recurring ? "next_time" : "next_time"; // 終了は基本「次回狙い」へ（断定して消さない）
  } else if (dd != null && dd >= 0 && dd <= 30) {
    key = "deadline"; // 締切が近い（最優先で確認）
  } else if (score >= 70 && (lc.key === "open" || lc.key === "soon_start" || lc.key === "today_start" || lc.key === "deadline_30")) {
    key = "usable";
  } else if (score >= 45) {
    key = "conditional";
  } else if (item.status === "unreviewed" && score === 0 && missing.length >= 2) {
    key = "new"; // まだ判定材料が少ない新着
  } else {
    key = "missed"; // 低スコアでも対象外と断定できない → 見逃し注意
  }

  // 結論文
  const meta = TRIAGE_META[key];
  let conclusion = meta.head;
  if (key === "conditional" && missing.length > 0) {
    conclusion = `あと${missing.length}つ確認すれば使えるか判断できます（${missing.slice(0, 2).join("・")} など）`;
  }
  if (key === "deadline" && dd != null) {
    conclusion = `締切まであと${dd}日。急いで公式ページを確認してください`;
  }

  return {
    key,
    conclusion,
    possibility: POSSIBILITY[key],
    score,
    why: item.match_reason || sc.reason || "事業情報と関係する可能性があるため表示しています",
    uses: ex.target_industries.length ? ex.target_industries.slice(0, 3) : sc.regions.slice(0, 2),
    killers,
    missing,
    nextActions: Array.from(new Set(nextActions)).slice(0, 4),
    deadline,
    lc,
    feas: feasibility(deadline),
    prep: preparation({ text: item.raw_text, professional: ex.professional_check_recommended, preNg: ex.pre_application_ng_risk }),
    officialConfirmed,
    secondary,
  };
}

// ---- 判定精度（事業プロフィールの入力充足度） ----
export type Accuracy = { percent: number; missing: { key: string; label: string }[] };

export function judgmentAccuracy(profiles: BusinessProfile[]): Accuracy {
  if (!profiles || profiles.length === 0) {
    return {
      percent: 0,
      missing: [
        { key: "profile", label: "事業情報を登録する" },
        { key: "region", label: "所在地・対象地域を入力する" },
        { key: "industry", label: "業種を入力する" },
      ],
    };
  }
  // 代表（最も埋まっている）プロフィールで評価
  const p = profiles.reduce((best, cur) => (filledCount(cur) >= filledCount(best) ? cur : best), profiles[0]);
  const checks: { key: string; label: string; ok: boolean }[] = [
    { key: "region", label: "所在地・対象地域を入力する", ok: (p.regions?.length ?? 0) > 0 || !!p.location },
    { key: "industry", label: "業種を入力する", ok: (p.industries?.length ?? 0) > 0 },
    { key: "entity", label: "法人・個人の種別を入力する", ok: !!p.entity_type },
    { key: "expense", label: "使いたい経費を入力する", ok: (p.expenses?.length ?? 0) > 0 },
    { key: "purpose", label: "やりたいこと（目的）を入力する", ok: (p.purposes?.length ?? 0) > 0 },
    { key: "amount", label: "使いたい予算（希望額）を入力する", ok: p.desired_amount != null },
    { key: "desc", label: "事業内容を入力する", ok: !!p.description },
  ];
  const okCount = checks.filter((c) => c.ok).length;
  const percent = Math.round((okCount / checks.length) * 100);
  return { percent, missing: checks.filter((c) => !c.ok).map((c) => ({ key: c.key, label: c.label })) };
}

function filledCount(p: BusinessProfile): number {
  return [
    (p.regions?.length ?? 0) > 0 || !!p.location,
    (p.industries?.length ?? 0) > 0,
    !!p.entity_type,
    (p.expenses?.length ?? 0) > 0,
    (p.purposes?.length ?? 0) > 0,
    p.desired_amount != null,
    !!p.description,
  ].filter(Boolean).length;
}

// ---- 一般的によく使われる定番補助金（一般確認推奨） ----
//   個別の公募ページは年度で変わるため、リンクは公式ポータル（Jグランツ）に集約。
export const STANDARD_SUBSIDIES: { name: string; use: string; reason: string; tags: string[] }[] = [
  { name: "IT導入補助金", use: "ソフト・システム・ECなどのIT導入", reason: "IT・DX・業務効率化に該当する可能性", tags: ["IT", "DX", "EC", "ホームページ", "POS", "在庫", "AI", "システム"] },
  { name: "小規模事業者持続化補助金", use: "広告・販路開拓・店舗改装など", reason: "販路開拓・広告宣伝・店舗改装に該当する可能性", tags: ["広告", "看板", "ホームページ", "EC", "販路", "店舗改装", "改装", "チラシ", "展示会"] },
  { name: "ものづくり補助金", use: "設備投資・試作開発・生産性向上", reason: "設備投資・生産性向上に該当する可能性", tags: ["設備", "機械", "試作", "開発", "生産性"] },
  { name: "中小企業省力化投資補助金", use: "省人化・自動化の設備導入", reason: "省力化・自動化に該当する可能性", tags: ["POS", "在庫", "AI", "自動", "省力", "ロボット", "システム"] },
  { name: "事業承継・M&A補助金", use: "事業承継・引き継ぎ・M&A", reason: "事業承継・M&Aに該当する可能性", tags: ["承継", "M&A", "引き継"] },
  { name: "業務改善助成金", use: "賃上げと設備投資をセットで", reason: "賃上げ＋設備投資に該当する可能性", tags: ["賃上げ", "設備", "最低賃金"] },
  { name: "キャリアアップ助成金", use: "正社員化・処遇改善（雇用系）", reason: "採用・正社員化・雇用に該当する可能性", tags: ["採用", "雇用", "正社員", "人材"] },
  { name: "省エネ設備導入補助金", use: "空調・LED・高効率機器など", reason: "空調・省エネ・設備更新に該当する可能性", tags: ["空調", "省エネ", "エアコン", "LED", "設備"] },
];
export const JGRANTS_PORTAL_URL = "https://www.jgrants-portal.go.jp/";
