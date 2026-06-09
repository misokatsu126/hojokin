import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { aiExtractConditions, hasOpenAI } from "@/lib/ai";
import { ruleExtractConditions } from "@/lib/nlsearch";
import type {
  Grant,
  DiscoveredItem,
  ExtractedGrantCandidate,
  InterpretedConditions,
} from "@/lib/types";

export const runtime = "nodejs";

type UnifiedResult = {
  source: "grant" | "discovered" | "candidate";
  id: string;
  name: string;
  state: string;
  state_tone: "green" | "sky" | "orange" | "indigo" | "purple" | "gray";
  official_url: string | null;
  detail_href: string;
  score: number;
  warnings: string[];
};

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr.filter(Boolean)));
}

function termsFrom(query: string, cond: InterpretedConditions): string[] {
  const fromQuery = query.split(/[\s、,，]+/).map((s) => s.trim()).filter((s) => s.length >= 2);
  return uniq([
    ...cond.regions,
    ...cond.industries,
    ...cond.purposes,
    ...cond.business_types,
    ...cond.eligible_expenses,
    ...cond.keywords,
    ...fromQuery,
  ]);
}

function scoreHaystack(haystack: string, terms: string[]): number {
  if (terms.length === 0) return 1; // 条件抽出ゼロでも全件を弱く返す
  let s = 0;
  for (const t of terms) if (haystack.includes(t)) s += 1;
  return s;
}

/**
 * 自然文で grants / discovered_items / extracted_grant_candidates を横断検索する拡張版。
 * 既存の /api/search-nl は変更せず、別エンドポイントとして提供する。
 * 結果には必ず情報の状態（正式登録済み/未確認候補/公式未確認/AI抽出済み/過年度候補/重複候補）を付与する。
 */
export async function POST(req: NextRequest) {
  let query = "";
  try {
    const body = await req.json();
    query = String(body.query ?? "").trim();
    if (!query) throw new Error("query が必要です");
  } catch {
    return NextResponse.json({ error: "検索文を入力してください。" }, { status: 400 });
  }

  const engine = hasOpenAI() ? "ai" : "rule";
  const cond = (await aiExtractConditions(query)) ?? ruleExtractConditions(query);
  const terms = termsFrom(query, cond);

  const [gRes, dRes, cRes] = await Promise.all([
    supabase.from("grants").select("*"),
    supabase.from("discovered_items").select("*"),
    supabase.from("extracted_grant_candidates").select("*"),
  ]);

  const results: UnifiedResult[] = [];

  for (const g of (gRes.data ?? []) as Grant[]) {
    const hay = [
      g.name, g.organization, g.target_audience, g.notes,
      ...g.regions, ...g.industries, ...g.purposes, ...g.keywords, ...g.expense_categories,
    ].filter(Boolean).join(" ");
    const score = scoreHaystack(hay, terms);
    if (score <= 0) continue;
    results.push({
      source: "grant",
      id: g.id,
      name: g.name,
      state: "正式登録済み",
      state_tone: "green",
      official_url: g.official_url,
      detail_href: `/grants/${g.id}`,
      score: score + 2, // 正式データを優先
      warnings: [],
    });
  }

  for (const d of (dRes.data ?? []) as DiscoveredItem[]) {
    if (d.status === "rejected" || d.status === "imported") continue;
    const hay = [d.title, d.raw_text].filter(Boolean).join(" ");
    const score = scoreHaystack(hay, terms);
    if (score <= 0) continue;
    const warnings: string[] = [];
    let state = "未確認候補";
    let tone: UnifiedResult["state_tone"] = "sky";
    if (d.duplicate_of) {
      state = "重複候補";
      tone = "purple";
      warnings.push("既存と類似する重複候補です。");
    } else if (d.source_warning) {
      state = "過年度候補";
      tone = "orange";
      warnings.push(d.source_warning);
    } else if (!d.official_source_confirmed) {
      state = "公式未確認";
      tone = "orange";
      warnings.push("公式URL/公募要領PDFが未確認です。申請判断には使用しないでください。");
    }
    results.push({
      source: "discovered",
      id: d.id,
      name: d.title ?? "（無題の検知候補）",
      state,
      state_tone: tone,
      official_url: d.official_url ?? d.url,
      detail_href: "/discovery/items",
      score,
      warnings,
    });
  }

  for (const c of (cRes.data ?? []) as ExtractedGrantCandidate[]) {
    const hay = [
      c.name, c.organizer, c.notes,
      ...c.target_regions, ...c.target_industries, ...c.eligible_expenses,
    ].filter(Boolean).join(" ");
    const score = scoreHaystack(hay, terms);
    if (score <= 0) continue;
    const confirmed =
      c.verification_status === "official_found" ||
      c.verification_status === "verified" ||
      !!c.official_url ||
      !!c.official_pdf_url;
    const warnings = confirmed
      ? []
      : ["公式URL/公募要領PDFが未確認です。申請判断には使用しないでください。"];
    results.push({
      source: "candidate",
      id: c.id,
      name: c.name ?? "（名称未抽出の候補）",
      state: confirmed ? "AI抽出済み" : "AI抽出済み（公式未確認）",
      state_tone: confirmed ? "indigo" : "orange",
      official_url: c.official_url,
      detail_href: "/discovery/review",
      score,
      warnings,
    });
  }

  results.sort((a, b) => b.score - a.score);

  return NextResponse.json({
    engine,
    interpreted_conditions: cond,
    query,
    count: results.length,
    results: results.slice(0, 50),
  });
}
