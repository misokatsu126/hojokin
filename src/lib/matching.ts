import type { Grant, BusinessProfile, MatchResult } from "./types";
import type { Recommendation, MatchStatus } from "./constants";
import { PRE_APPLICATION_WARNING_TEXT } from "./constants";
import {
  intersect,
  regionMatches,
  industryMatches,
  daysUntil,
} from "./utils";

// score → recommendation / status の分類（仕様の優先度設計に準拠）
export function classify(score: number, notApplicable: boolean): {
  recommendation: Recommendation;
  status: MatchStatus;
} {
  if (notApplicable) return { recommendation: "D", status: "not_applicable" };
  if (score >= 80) return { recommendation: "A", status: "high_match" };
  if (score >= 60) return { recommendation: "B", status: "possible" };
  if (score >= 40) return { recommendation: "C", status: "needs_review" };
  return { recommendation: "D", status: "low_match" };
}

export function deadlineWarningText(grant: Grant): string {
  const d = daysUntil(grant.application_deadline);
  if (grant.recruitment_status === "終了") return "募集はすでに終了しています。";
  if (d == null) {
    if (grant.recruitment_status === "募集予定") return "募集開始前です。開始時期を確認してください。";
    return "";
  }
  if (d < 0) return "締切を過ぎています。";
  if (d === 0) return "本日が締切です。至急対応が必要です。";
  if (d <= 7) return `締切まで残り${d}日です。最優先で確認してください。`;
  if (d <= 14) return `締切まで残り${d}日です。早めの準備が必要です。`;
  if (d <= 30) return `締切まで残り${d}日です。今月中の検討をおすすめします。`;
  return "";
}

/**
 * 補助金 × 事業プロフィール のルールベース判定。
 * OpenAI 未設定時のフォールバックとして、また AI 失敗時の保険として使用。
 */
export function ruleMatch(grant: Grant, profile: BusinessProfile): MatchResult {
  const matched_reasons: string[] = [];
  const exclusion_risks: string[] = [];

  // --- 各次元のスコア ---
  // 目的（最重要・最大30点）
  const purposeHits = intersect(grant.purposes, profile.purposes);
  const purposeScore =
    grant.purposes.length === 0
      ? 12 // 目的指定なしは中立的に加点
      : Math.min(30, purposeHits.length * 12);
  if (purposeHits.length > 0) {
    matched_reasons.push(`目的が一致：${purposeHits.join("、")}`);
  } else if (grant.purposes.length > 0) {
    exclusion_risks.push("事業の目的と補助金の対象目的が直接一致していません。");
  }

  // 地域（最大25点）
  const regionOk = regionMatches(grant.regions, profile.regions);
  const regionScore = regionOk ? 25 : 0;
  if (regionOk) {
    matched_reasons.push(
      grant.regions.includes("全国") || grant.regions.length === 0
        ? "全国対象のため地域要件を満たします。"
        : `対象地域に該当：${intersect(grant.regions, profile.regions).join("、") || grant.regions.join("、")}`
    );
  } else {
    exclusion_risks.push("事業の所在地・対象地域が補助金の対象地域外の可能性があります。");
  }

  // 業種（最大20点）
  const industryOk = industryMatches(grant.industries, profile.industries);
  const industryScore = industryOk ? 20 : 0;
  if (industryOk) {
    if (grant.industries.length > 0 && !grant.industries.includes("全業種")) {
      matched_reasons.push(`対象業種に該当：${intersect(grant.industries, profile.industries).join("、")}`);
    }
  } else {
    exclusion_risks.push("業種が対象に含まれていない可能性があります。");
  }

  // 法人種別（最大15点）
  let entityOk = true;
  if (grant.entity_types.length > 0 && profile.entity_type) {
    entityOk = grant.entity_types.includes(profile.entity_type);
  }
  const entityScore = entityOk ? 15 : 0;
  if (!entityOk) {
    exclusion_risks.push(
      `法人種別「${profile.entity_type}」が対象に明記されていない可能性があります。`
    );
  } else if (grant.entity_types.length > 0 && profile.entity_type) {
    matched_reasons.push(`法人種別「${profile.entity_type}」が対象に含まれます。`);
  }

  // 対象経費（最大10点）
  const expenseHits = intersect(grant.expense_categories, profile.expenses);
  const expenseScore =
    grant.expense_categories.length === 0 ? 4 : Math.min(10, expenseHits.length * 5);

  // キーワード加点 / 除外キーワード減点
  const grantText = `${grant.name} ${grant.notes ?? ""} ${grant.target_audience ?? ""} ${grant.keywords.join(" ")} ${grant.purposes.join(" ")}`;
  let keywordBonus = 0;
  for (const kw of profile.keywords) {
    if (kw && grantText.includes(kw)) keywordBonus += 3;
  }
  keywordBonus = Math.min(10, keywordBonus);

  let excludePenalty = 0;
  for (const ex of profile.exclude_keywords) {
    if (ex && grantText.includes(ex)) {
      excludePenalty += 40;
      exclusion_risks.push(`除外キーワード「${ex}」に該当します。`);
    }
  }

  // --- 強制対象外の判定 ---
  let notApplicable = false;
  if (grant.recruitment_status === "終了") {
    notApplicable = true;
    exclusion_risks.push("募集が終了しています。");
  }
  if (!entityOk && grant.entity_types.length > 0) {
    // 法人種別が明確にミスマッチなら対象外候補に寄せる（ただし即0にはしない）
  }
  if (excludePenalty >= 40) notApplicable = true;

  // --- 合算 ---
  let score =
    purposeScore + regionScore + industryScore + entityScore + expenseScore + keywordBonus - excludePenalty;
  score = Math.max(0, Math.min(100, Math.round(score)));
  if (notApplicable) score = Math.min(score, 30);

  const { recommendation, status } = classify(score, notApplicable);

  // --- 用途・経費 ---
  const possible_uses = purposeHits.length > 0 ? purposeHits : intersect(profile.purposes, grant.keywords);
  const eligible_expenses = expenseHits;

  // --- 注意点・経費の曖昧さ ---
  if (grant.expense_categories.length === 0) {
    exclusion_risks.push("対象経費が明記されていないため、公募要領での確認が必要です。");
  }

  // --- 締切・着手NG ---
  const deadline_warning = deadlineWarningText(grant);
  const pre_application_warning = grant.pre_application_ng ? PRE_APPLICATION_WARNING_TEXT : "";

  // --- 専門家相談 ---
  const professional_consultation_needed =
    grant.requires_professional || grant.difficulty === "高" || grant.pre_application_ng;

  // --- 次にやること ---
  const next_actions: string[] = [];
  if (status === "not_applicable") {
    next_actions.push("今回は対象外の可能性が高いため見送りを検討");
  } else {
    next_actions.push("公募要領を確認する");
    if (grant.expense_categories.length === 0 || expenseHits.length === 0)
      next_actions.push("対象経費に該当するか確認する");
    if (score >= 60) next_actions.push("見積書を取得する");
    if (professional_consultation_needed) next_actions.push("行政書士・社労士・認定支援機関などの専門家に確認する");
    if (grant.pre_application_ng) next_actions.push("契約・発注前に申請前着手NGか必ず確認する");
  }

  // --- 要約 ---
  const recLabel: Record<Recommendation, string> = {
    A: "かなり使える可能性が高い",
    B: "確認する価値がある",
    C: "条件次第では使える可能性あり",
    D: "対象外の可能性が高い",
  };
  const summary =
    status === "not_applicable"
      ? `「${profile.name}」では対象外の可能性が高い制度です（${exclusion_risks[0] ?? ""}）。`
      : `「${profile.name}」にとって${recLabel[recommendation]}制度です（適合度${score}点）。${possible_uses.length ? `用途：${possible_uses.slice(0, 3).join("、")}。` : ""}`;

  return {
    match_score: score,
    recommendation,
    status,
    matched_reasons,
    possible_uses,
    eligible_expenses,
    exclusion_risks,
    deadline_warning,
    pre_application_warning,
    next_actions,
    professional_consultation_needed,
    summary,
  };
}

// AI が返したJSONを安全な MatchResult に正規化する
export function normalizeMatch(raw: any, fallback: MatchResult): MatchResult {
  if (!raw || typeof raw !== "object") return fallback;
  const arr = (v: any): string[] => (Array.isArray(v) ? v.map(String) : []);
  const score = Math.max(0, Math.min(100, Math.round(Number(raw.match_score)) || 0));
  const validRec = ["A", "B", "C", "D"];
  const validStatus = ["high_match", "possible", "needs_review", "low_match", "not_applicable"];
  return {
    match_score: score,
    recommendation: validRec.includes(raw.recommendation) ? raw.recommendation : classify(score, false).recommendation,
    status: validStatus.includes(raw.status) ? raw.status : classify(score, false).status,
    matched_reasons: arr(raw.matched_reasons),
    possible_uses: arr(raw.possible_uses),
    eligible_expenses: arr(raw.eligible_expenses),
    exclusion_risks: arr(raw.exclusion_risks),
    deadline_warning: typeof raw.deadline_warning === "string" ? raw.deadline_warning : fallback.deadline_warning,
    pre_application_warning:
      typeof raw.pre_application_warning === "string" && raw.pre_application_warning
        ? raw.pre_application_warning
        : fallback.pre_application_warning,
    next_actions: arr(raw.next_actions),
    professional_consultation_needed: Boolean(raw.professional_consultation_needed),
    summary: typeof raw.summary === "string" ? raw.summary : fallback.summary,
  };
}
