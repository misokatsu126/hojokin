import { NextRequest, NextResponse } from "next/server";
import { supabase, logSearch } from "@/lib/supabase";
import { aiExtractConditions } from "@/lib/ai";
import { ruleExtractConditions, filterGrantsByConditions } from "@/lib/nlsearch";
import { ruleMatch, classify } from "@/lib/matching";
import { ingestUrl } from "@/lib/collect";
import { isSampleGrant, isSampleDiscovered } from "@/lib/sampleFilter";
import { deadlineState } from "@/lib/utils";
import type {
  Grant,
  BusinessProfile,
  InterpretedConditions,
  NlSearchResultItem,
  NlSearchResponse,
  DiscoveredItem,
  DiscoveredSearchItem,
  IngestResult,
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

  // 検索文にURLが含まれていたら、そのURLを直接取得して discovered_items に取り込む
  let ingested: IngestResult | undefined;
  const urlMatch = query.match(/https?:\/\/[^\s　]+/);
  if (urlMatch) {
    try {
      const r = await ingestUrl(urlMatch[0]);
      ingested = {
        ok: r.ok,
        title: r.title,
        url: r.url,
        official_url: r.official_url ?? null,
        inserted: r.inserted,
        error: r.error,
      };
    } catch (e) {
      ingested = { ok: false, url: urlMatch[0], error: (e as Error).message };
    }
  }

  // 条件抽出（AI 優先、失敗時ルールベース）
  const aiCond = await aiExtractConditions(query);
  const cond: InterpretedConditions = aiCond ?? ruleExtractConditions(query);
  const engine: "ai" | "rule" = aiCond ? "ai" : "rule";

  // 登録済み補助金を取得
  const { data, error } = await supabase.from("grants").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const grants = ((data ?? []) as Grant[]).filter((g) => !isSampleGrant(g)); // サンプル除外

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
    source_type: "grant",
    result_type: "grant",
  }));

  // 自動検知候補（discovered_items）も検索対象にする（grants は維持）
  const discovered_results = await searchDiscovered(query, cond);

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
    discovered_results,
    ingested,
  };
  return NextResponse.json(response);
}

// discovered_items を title/raw_text/url/official_url/external_source/match_profile で検索
async function searchDiscovered(query: string, cond: InterpretedConditions): Promise<DiscoveredSearchItem[]> {
  let items: DiscoveredItem[] = [];
  try {
    const { data } = await supabase.from("discovered_items").select("*").limit(1000);
    items = (data ?? []) as DiscoveredItem[];
  } catch {
    return [];
  }
  // 検索語：クエリのトークン（2文字以上、URLは除外）＋抽出条件
  const terms = Array.from(
    new Set(
      [
        ...query.replace(/https?:\/\/[^\s　]+/g, " ").split(/[\s　、，,]+/),
        ...cond.regions,
        ...cond.industries,
        ...cond.purposes,
        ...cond.keywords,
        ...cond.eligible_expenses,
      ]
        .map((s) => s.trim())
        .filter((s) => s.length >= 2)
    )
  );

  const out: DiscoveredSearchItem[] = [];
  for (const it of items) {
    if (it.status === "rejected") continue;
    if (isSampleDiscovered(it)) continue; // サンプル除外
    const hay = [
      it.title,
      it.raw_text,
      it.url,
      it.official_url,
      it.external_source,
      it.match_profile,
    ]
      .filter(Boolean)
      .join(" ");
    let hits = 0;
    for (const t of terms) if (hay.includes(t)) hits++;
    if (terms.length > 0 && hits === 0) continue; // 語句指定があり一致なしは除外
    const score = hits * 10 + Math.round((it.match_score ?? 0) / 5);
    out.push({
      source_type: "discovered_item",
      result_type: "discovered_item",
      id: it.id,
      title: it.title ?? "（無題）",
      url: it.url ?? null,
      official_url: it.official_url ?? null,
      external_source: it.external_source ?? null,
      match_score: it.match_score ?? null,
      match_profile: it.match_profile ?? null,
      status: it.status,
      fetched_at: it.fetched_at ?? null,
      score,
    });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 30);
}
