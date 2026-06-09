import OpenAI from "openai";
import type { Grant, BusinessProfile, MatchResult, InterpretedConditions } from "./types";
import { normalizeMatch, ruleMatch } from "./matching";

export function hasOpenAI(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function client(): OpenAI {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const MATCH_SYSTEM = `あなたは日本の補助金・助成金に精通したアドバイザーです。
与えられた事業プロフィールと補助金情報を照合し、その事業がこの制度を使える可能性を一次判定してください。
申請可否や受給を保証するものではなく、社内検討用の一次判定であることを前提にしてください。

必ず次のJSONのみで回答（前置き・マークダウン・コードフェンス禁止）：
{
  "match_score": 0〜100の整数,
  "recommendation": "A" | "B" | "C" | "D",
  "status": "high_match" | "possible" | "needs_review" | "low_match" | "not_applicable",
  "matched_reasons": ["対象になりそうな理由"],
  "possible_uses": ["その事業で使えそうな用途"],
  "eligible_expenses": ["対象経費になりそうな項目"],
  "exclusion_risks": ["対象外になる可能性がある理由"],
  "deadline_warning": "締切に関する警告（なければ空文字）",
  "pre_application_warning": "申請前着手NGに関する警告（なければ空文字）",
  "next_actions": ["次にやるべき具体的行動"],
  "professional_consultation_needed": true/false,
  "summary": "ユーザー向けの短い要約（です・ます調）"
}

判定基準：
- 80点以上=A/high_match、60〜79=B/possible、40〜59=C/needs_review、39以下=D/low_match。明確に対象外なら not_applicable。
- 目的・対象経費の一致を特に重視する。
- 「全国」「全業種」は地域・業種の制約なしとみなす。
- 募集終了・法人種別の明確なミスマッチは not_applicable に寄せる。
- 申請前着手NGや難易度が高い場合は professional_consultation_needed を true にする。`;

function matchUserPrompt(grant: Grant, profile: BusinessProfile): string {
  return `# 事業プロフィール
事業名: ${profile.name}
法人種別: ${profile.entity_type ?? "未設定"}
所在地: ${profile.location ?? "未設定"}
対象地域: ${profile.regions.join("、") || "未設定"}
業種: ${profile.industries.join("、") || "未設定"}
事業内容: ${profile.description ?? "未設定"}
目的: ${profile.purposes.join("、") || "未設定"}
使いたい経費: ${profile.expenses.join("、") || "未設定"}
キーワード: ${profile.keywords.join("、") || "なし"}
除外キーワード: ${profile.exclude_keywords.join("、") || "なし"}

# 補助金情報
名称: ${grant.name}
種別: ${grant.grant_type ?? "不明"}
実施主体: ${grant.organization ?? "不明"}
対象地域: ${grant.regions.join("、") || "指定なし"}
対象業種: ${grant.industries.join("、") || "指定なし"}
対象法人種別: ${grant.entity_types.join("、") || "指定なし"}
対象者: ${grant.target_audience ?? "未設定"}
対象経費: ${grant.expense_categories.join("、") || "未設定"}
目的カテゴリ: ${grant.purposes.join("、") || "未設定"}
補助率: ${grant.subsidy_rate ?? "未設定"}
補助上限額(円): ${grant.max_amount ?? "未設定"}
募集状態: ${grant.recruitment_status ?? "不明"}
締切: ${grant.application_deadline ?? "通年・未定"}
申請前着手NGの可能性: ${grant.pre_application_ng ? "あり" : "不明"}
士業確認推奨: ${grant.requires_professional ? "あり" : "不明"}
難易度: ${grant.difficulty ?? "不明"}
注意点: ${grant.notes ?? "なし"}
対象外条件: ${grant.exclusion_conditions ?? "なし"}

この事業がこの制度を使える可能性を判定し、指定のJSONで回答してください。`;
}

export async function aiMatch(grant: Grant, profile: BusinessProfile): Promise<MatchResult> {
  const fallback = ruleMatch(grant, profile);
  if (!hasOpenAI()) return fallback;
  try {
    const completion = await client().chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: MATCH_SYSTEM },
        { role: "user", content: matchUserPrompt(grant, profile) },
      ],
    });
    const raw = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    return normalizeMatch(raw, fallback);
  } catch (e) {
    console.warn("[aiMatch] fallback to rule:", (e as Error).message);
    return fallback;
  }
}

const EXTRACT_SYSTEM = `あなたは補助金検索の条件抽出器です。ユーザーの自然文から検索条件を抽出し、次のJSONのみで返してください（前置き禁止）：
{
  "regions": [], "industries": [], "business_types": [], "purposes": [],
  "eligible_expenses": [], "min_grant_amount": null, "deadline_condition": "",
  "status": "", "keywords": []
}
- regions は都道府県・市区町村名。industries は業種。business_types は法人種別。
- deadline_condition は "this_month" | "soon" | "within_30" | "within_7" | "" のいずれか。
- status は "募集中" | "募集予定" | ""。min_grant_amount は円単位の数値か null。`;

export async function aiExtractConditions(text: string): Promise<InterpretedConditions | null> {
  if (!hasOpenAI()) return null;
  try {
    const completion = await client().chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: EXTRACT_SYSTEM },
        { role: "user", content: text },
      ],
    });
    const raw = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    return {
      regions: Array.isArray(raw.regions) ? raw.regions.map(String) : [],
      industries: Array.isArray(raw.industries) ? raw.industries.map(String) : [],
      business_types: Array.isArray(raw.business_types) ? raw.business_types.map(String) : [],
      purposes: Array.isArray(raw.purposes) ? raw.purposes.map(String) : [],
      eligible_expenses: Array.isArray(raw.eligible_expenses) ? raw.eligible_expenses.map(String) : [],
      min_grant_amount: raw.min_grant_amount == null ? null : Number(raw.min_grant_amount),
      deadline_condition: typeof raw.deadline_condition === "string" ? raw.deadline_condition : "",
      status: typeof raw.status === "string" ? raw.status : "",
      keywords: Array.isArray(raw.keywords) ? raw.keywords.map(String) : [],
    };
  } catch (e) {
    console.warn("[aiExtractConditions] fallback to rule:", (e as Error).message);
    return null;
  }
}
