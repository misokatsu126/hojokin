import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { aiMatch, hasOpenAI } from "@/lib/ai";
import { deadlineState } from "@/lib/utils";
import type { Grant, BusinessProfile, MatchResult } from "@/lib/types";
import type { MatchStatus } from "@/lib/constants";

export const runtime = "nodejs";

/**
 * 補助金を登録・更新したときに呼ぶ。
 * その補助金 × 全事業プロフィール を照合し、grant_matches を upsert、
 * 高相性(>=80)・要確認(60-79)・締切間近・新着 のアラートを作成する。
 */
export async function POST(req: NextRequest) {
  let grantId: string;
  let isNew = false;
  try {
    const body = await req.json();
    grantId = body.grant_id;
    isNew = Boolean(body.is_new);
    if (!grantId) throw new Error("grant_id が必要です");
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です。" }, { status: 400 });
  }

  // 補助金と全プロフィールを取得
  const [{ data: grantData, error: gErr }, { data: profileData, error: pErr }] = await Promise.all([
    supabase.from("grants").select("*").eq("id", grantId).maybeSingle(),
    supabase.from("business_profiles").select("*"),
  ]);
  if (gErr || !grantData) {
    return NextResponse.json({ error: "補助金が見つかりません。" }, { status: 404 });
  }
  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  const grant = grantData as Grant;
  const profiles = (profileData ?? []) as BusinessProfile[];
  const engine = hasOpenAI() ? "ai" : "rule";
  const dState = deadlineState(grant.application_deadline);
  const deadlineSoon = dState === "urgent" || dState === "soon" || dState === "month";

  let highCount = 0;
  const results: { profile: string; score: number; status: MatchStatus }[] = [];

  for (const profile of profiles) {
    const m: MatchResult = await aiMatch(grant, profile);

    // grant_matches を upsert
    await supabase.from("grant_matches").upsert(
      {
        grant_id: grant.id,
        profile_id: profile.id,
        match_score: m.match_score,
        recommendation: m.recommendation,
        status: m.status,
        matched_reasons: m.matched_reasons,
        possible_uses: m.possible_uses,
        eligible_expenses: m.eligible_expenses,
        exclusion_risks: m.exclusion_risks,
        deadline_warning: m.deadline_warning,
        pre_application_warning: m.pre_application_warning,
        next_actions: m.next_actions,
        professional_consultation_needed: m.professional_consultation_needed,
        summary: m.summary,
        engine,
      },
      { onConflict: "grant_id,profile_id" }
    );

    // 既存アラートを一旦削除して作り直す（再照合のたびに最新化）
    await supabase.from("alerts").delete().eq("grant_id", grant.id).eq("profile_id", profile.id);

    const alertsToInsert: any[] = [];
    if (isNew) {
      alertsToInsert.push({
        grant_id: grant.id,
        profile_id: profile.id,
        alert_type: "新着",
        match_score: m.match_score,
        message: `新着：${grant.name}`,
        is_read: false,
      });
    }
    if (m.match_score >= 80) {
      highCount++;
      alertsToInsert.push({
        grant_id: grant.id,
        profile_id: profile.id,
        alert_type: "高相性",
        match_score: m.match_score,
        message: m.summary,
        is_read: false,
      });
    } else if (m.match_score >= 60) {
      alertsToInsert.push({
        grant_id: grant.id,
        profile_id: profile.id,
        alert_type: "要確認",
        match_score: m.match_score,
        message: m.summary,
        is_read: false,
      });
    } else if (m.status === "not_applicable") {
      alertsToInsert.push({
        grant_id: grant.id,
        profile_id: profile.id,
        alert_type: "対象外候補",
        match_score: m.match_score,
        message: m.exclusion_risks[0] ?? "対象外の可能性",
        is_read: false,
      });
    }
    // 締切間近（相性が参考以上のものに限定）
    if (deadlineSoon && m.match_score >= 40) {
      alertsToInsert.push({
        grant_id: grant.id,
        profile_id: profile.id,
        alert_type: "締切間近",
        match_score: m.match_score,
        message: m.deadline_warning || `${grant.name} の締切が近づいています。`,
        is_read: false,
      });
    }

    if (alertsToInsert.length) {
      await supabase.from("alerts").insert(alertsToInsert);
    }

    results.push({ profile: profile.name, score: m.match_score, status: m.status });
  }

  return NextResponse.json({
    grant_id: grant.id,
    engine,
    matched: profiles.length,
    high_match_count: highCount,
    results,
  });
}
