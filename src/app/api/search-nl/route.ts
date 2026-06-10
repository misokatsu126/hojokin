import { NextRequest, NextResponse } from "next/server";
import { supabase, logSearch, fetchProfiles } from "@/lib/supabase";
import { aiExtractConditions } from "@/lib/ai";
import { ruleExtractConditions, filterGrantsByConditions } from "@/lib/nlsearch";
import { ruleMatch, classify } from "@/lib/matching";
import { ingestUrl } from "@/lib/collect";
import { isSampleGrant, isSampleDiscovered } from "@/lib/sampleFilter";
import { deadlineState } from "@/lib/utils";
import { expandQuery, followUpQuestions } from "@/lib/synonyms";
import { lifecycle, priority } from "@/lib/lifecycle";
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

  // スコアリング：相談文（仮想プロフィール）×登録済み事業プロフィールの両面で評価し、
  //   最も相性の良いスコアを採用する（brief §11：検索文 × 事業プロフィール）。
  const vProfile = conditionsToProfile(cond);
  let profiles: BusinessProfile[] = [];
  try {
    profiles = await fetchProfiles();
  } catch {
    profiles = [];
  }
  const scored = used
    .map((g) => {
      let best = ruleMatch(g, vProfile);
      let bestProfileName = "";
      for (const p of profiles) {
        const m = ruleMatch(g, p);
        if (m.match_score > best.match_score) {
          best = m;
          bestProfileName = p.name;
        }
      }
      return { g, m: best, bestProfileName };
    })
    .filter(({ m }) => m.match_score >= 30)
    .sort((a, b) => {
      const pa = priority(a.m.match_score, lifecycle(a.g.application_start, a.g.application_deadline).key).sort;
      const pb = priority(b.m.match_score, lifecycle(b.g.application_start, b.g.application_deadline).key).sort;
      return pb - pa;
    });

  // 「なぜ出たか」：相談文から展開したカテゴリ（類義語辞書）の説明文
  const whyReasons = expandQuery(query).reasons;
  const whyText =
    whyReasons.length > 0
      ? `${whyReasons.join("／")} に関係する可能性があるため表示しています。`
      : "相談文と事業プロフィールから、関係する可能性がある制度を表示しています。";

  const results: NlSearchResultItem[] = scored.map(({ g, m, bestProfileName }) => {
    const lc = lifecycle(g.application_start, g.application_deadline);
    const pr = priority(m.match_score, lc.key);
    const why = m.matched_reasons.slice(0, 2).join("／") ||
      (bestProfileName ? `登録事業「${bestProfileName}」との相性で表示しています。` : whyText);
    return {
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
      why,
      priority: pr.rank,
    };
  });

  // 見つかった補助金も検索対象にする（grants は維持）
  const discovered_results = await searchDiscovered(query, cond);

  // 精度を上げるための確認質問（候補は出したうえで追加で尋ねる：brief §9）
  const follow_up_questions = followUpQuestions(query, cond);

  const totalFound = results.length + (discovered_results?.length ?? 0);
  const summary =
    totalFound === 0
      ? "完全に一致する制度は見つかりませんでしたが、条件を広げて近い可能性のある制度を探しました。公式URLを貼ると、その制度も候補として確認できます。"
      : results.length === 0
        ? `登録済みの制度では一致しませんでしたが、自動収集で見つかった候補が${discovered_results!.length}件あります。${whyText}`
        : `${results.length}件の使える可能性がある制度が見つかりました。${whyText}まずは上位から公式ページで確認してください。`;

  await logSearch(query, cond, results.length);

  const response: NlSearchResponse = {
    interpreted_conditions: cond,
    results,
    relaxed_search_suggestions,
    summary,
    engine,
    discovered_results,
    ingested,
    why: whyText,
    follow_up_questions,
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
