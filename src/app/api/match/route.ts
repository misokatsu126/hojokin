import { NextRequest, NextResponse } from "next/server";
import { aiMatch, hasOpenAI } from "@/lib/ai";
import type { Grant, BusinessProfile } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let grant: Grant;
  let profile: BusinessProfile;
  try {
    const body = await req.json();
    grant = body.grant;
    profile = body.profile;
    if (!grant || !profile) throw new Error("grant / profile が必要です");
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です。" }, { status: 400 });
  }

  const result = await aiMatch(grant, profile);
  return NextResponse.json({ ...result, engine: hasOpenAI() ? "ai" : "rule" });
}
