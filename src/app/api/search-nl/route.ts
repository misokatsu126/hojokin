import { NextRequest, NextResponse } from "next/server";
import { supabase, logSearch } from "@/lib/supabase";
import { aiExtractConditions, hasOpenAI } from "@/lib/ai";
import { ruleExtractConditions, filterGrantsByConditions } from "@/lib/nlsearch";
import { ruleMatch, classify } from "@/lib/matching";
import { deadlineState } from "@/lib/utils";
import type {
  Grant,
  BusinessProfile,
  InterpretedConditions,
  NlSearchResultItem,
  NlSearchResponse,
} from "@/lib/types";

export const runtime = "nodejs";

// 抽出条件から仮想プロフィールを作り、ruleMatch でスコアリングに利用
function conditionsToProfile(cond: InterpretedConditions): BusinessProfile {
  const now = new Date().toISOString();
  return {
    id: "virtual",
    name: "検索条件",
    entity_type: cond.business_types[0] ?? null,
    location: null,
    regions: cond.regions,
    industries: cond.industries,
    description: null,
    purposes: cond.purposes,
    expenses: cond.eligible_expenses,
    keywords: cond.keywords,
    exclude_keywords: [],
    desired_amount: cond.min_grant_amount,
    notes: null,
    created_at: now,
    updated_at: now,
  };
}

export async function POST(req: NextRequest) {
  let query = "";
  try {
    const body = await req.json();
    query = String(body.query ?? "").trim();
    if (!query) throw new Error("query が空です");
  } catch {
    return NextResponse.json({ error: "検索文を入力してください。" }, { status: 400 });
  }

  // 条件抽出（AI 優先、失敗時ルールベース）
  const aiCond = await aiExtractConditions(query);
  const cond: InterpretedConditions = aiCond ?? ruleExtractConditions(query);
  const engine: "ai" | "rule" = aiCond ? "ai" : "rule";

  // 登録済み補助金を取得
  const { data, error } = await supabase.from("grants").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const grants = (data ?? []) as Grant[];

  // 締切条件のフィルタ
  const passDeadline = (g: Grant) => {
    if (!cond.deadline_condition) return true;
    const s = deadlineState(g.application_deadline);
    if (cond.deadline_condition === "within_7") return s === "urgent";
    if (cond.deadline_condition === "soon") return s === "urgent" || s === "soon";
    if (cond.deadline_condition === "this_month" || cond.deadline_condition === "within_30")
      return s === "urgent" || s === "soon" || s === "month";
    return true;
  };

  // まず厳密、ヒット0なら緩和
  let strict = filterGrantsByConditions(grants, cond, true).filter(passDeadline);
  const relaxed_search_suggestions: string[] = [];
  let used = strict;
  if (strict.length === 0) {
    used = filterGrantsByConditions(grants, cond, false);
    if (cond.deadline_condition) relaxed_search_suggestions.push("締切条件を外して再検索しました。");
    if (cond.regions.length) relaxed_search_suggestions.push("地域条件を緩和しました（全国・近隣も含む）。");
  }

  // スコアリング
  const vProfile = conditionsToProfile(cond);
  const scored = used
    .map((g) => {
      const m = ruleMatch(g, vProfile);
      return { g, m };
    })
    .filter(({ m }) => m.match_score >= 30)
    .sort((a, b) => b.m.match_score - a.m.match_score);

  const results: NlSearchResultItem[] = scored.map(({ g, m }) => ({
    grant_id: g.id,
    grant_name: g.name,
    match_score: m.match_score,
    recommendation: classify(m.match_score, m.status === "not_applicable").recommendation,
    matched_reasons: m.matched_reasons,
    possible_uses: m.possible_uses,
    concerns: m.exclusion_risks,
    next_actions: m.next_actions,
    official_url: g.official_url,
  }));

  const summary =
    results.length === 0
      ? "条件に合う登録済みの制度は見つかりませんでした。条件を変えるか、補助金を登録してください。"
      : `${results.length}件の候補が見つかりました。上位は「${results[0].grant_name}」です。これは登録済みデータに基づく一次判定です。`;

  await logSearch(query, cond, results.length);

  const response: NlSearchResponse = {
    interpreted_conditions: cond,
    results,
    relaxed_search_suggestions,
    summary,
    engine,
  };
  return NextResponse.json(response);
}
