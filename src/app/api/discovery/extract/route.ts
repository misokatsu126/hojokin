import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { aiExtractCandidate, hasOpenAI } from "@/lib/ai";
import { htmlToText } from "@/lib/discovery";
import type { DiscoveredItem, SourceSite } from "@/lib/types";

export const runtime = "nodejs";

// サーバー側で URL を取得してテキスト化する。失敗（拒否・JS描画・タイムアウト等）は ok:false。
async function tryFetchUrl(
  url: string
): Promise<{ ok: boolean; text?: string; html?: string; reason?: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; HojokinRadar/1.0; +https://example.com/bot)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const html = await res.text();
    const text = htmlToText(html);
    if (text.length < 40) return { ok: false, reason: "本文が取得できませんでした（JS描画の可能性）", html };
    return { ok: true, text, html };
  } catch (e) {
    return { ok: false, reason: (e as Error).name === "AbortError" ? "タイムアウト" : "取得失敗" };
  }
}

/**
 * discovered_item から補助金情報を抽出し、extracted_grant_candidates に保存する。
 * - 本文(raw_text)が乏しく URL がある場合は、サーバー側で URL 取得を試みる。
 *   取得できなければ「テキスト貼り付けへのフォールバック」をUIに促すフラグを返す。
 * - OpenAIキーがあればAI抽出、なければルールベース抽出（ai.ts 側でフォールバック）。
 * - 抽出結果は本登録せず、必ず候補テーブルに保存する（安全フロー）。
 */
export async function POST(req: NextRequest) {
  let itemId: string;
  try {
    const body = await req.json();
    itemId = body.discovered_item_id;
    if (!itemId) throw new Error("discovered_item_id が必要です");
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です。" }, { status: 400 });
  }

  const { data: itemData, error: itemErr } = await supabase
    .from("discovered_items")
    .select("*")
    .eq("id", itemId)
    .maybeSingle();
  if (itemErr || !itemData) {
    return NextResponse.json({ error: "検知候補が見つかりません。" }, { status: 404 });
  }
  let item = itemData as DiscoveredItem;

  let site: SourceSite | null = null;
  if (item.source_site_id) {
    const { data: siteData } = await supabase
      .from("source_sites")
      .select("*")
      .eq("id", item.source_site_id)
      .maybeSingle();
    site = (siteData as SourceSite) ?? null;
  }

  // 本文が乏しく URL があれば取得を試みる
  let fetch_attempted = false;
  let fetch_succeeded = false;
  let fetch_reason: string | null = null;
  const needsFetch = (!item.raw_text || item.raw_text.trim().length < 40) && !!item.url;
  if (needsFetch && item.url) {
    fetch_attempted = true;
    const r = await tryFetchUrl(item.url);
    if (r.ok && r.text) {
      fetch_succeeded = true;
      // 取得本文を保存し、以降の抽出に使う
      await supabase
        .from("discovered_items")
        .update({ raw_text: r.text, raw_html: r.html ?? null })
        .eq("id", item.id);
      item = { ...item, raw_text: r.text, raw_html: r.html ?? null };
    } else {
      fetch_reason = r.reason ?? "取得失敗";
    }
  }

  const engine = hasOpenAI() ? "ai" : "rule";
  const result = await aiExtractCandidate(item, site);

  const { data: candidate, error: insErr } = await supabase
    .from("extracted_grant_candidates")
    .insert({
      discovered_item_id: item.id,
      name: result.name,
      grant_type: result.grant_type,
      organizer: result.organizer,
      target_regions: result.target_regions,
      target_industries: result.target_industries,
      target_business_types: result.target_business_types,
      target_people: result.target_people,
      eligible_expenses: result.eligible_expenses,
      subsidy_rate: result.subsidy_rate,
      max_amount: result.max_amount,
      min_amount: result.min_amount,
      application_start_date: result.application_start_date,
      deadline: result.deadline,
      application_status: result.application_status,
      application_method: result.application_method,
      required_documents: result.required_documents,
      official_url: result.official_url,
      official_pdf_url: result.official_pdf_url,
      notes: result.notes,
      pre_application_ng_risk: result.pre_application_ng_risk,
      professional_check_recommended: result.professional_check_recommended,
      confidence_score: result.confidence_score,
      missing_fields: result.missing_fields,
      source_category: item.source_category ?? site?.source_type ?? null,
      trust_level: item.trust_level ?? site?.trust_level ?? null,
      verification_status: item.verification_status ?? "unverified",
    })
    .select()
    .single();
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  // 検知候補のステータスを「確認候補」に進める（未確認のままだったもののみ）
  if (item.status === "unreviewed") {
    await supabase.from("discovered_items").update({ status: "candidate" }).eq("id", item.id);
  }

  return NextResponse.json({
    engine,
    candidate,
    confidence_score: result.confidence_score,
    missing_fields: result.missing_fields,
    fetch_attempted,
    fetch_succeeded,
    fetch_reason,
  });
}
