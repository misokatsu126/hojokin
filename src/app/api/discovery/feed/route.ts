import { NextRequest, NextResponse } from "next/server";
import { fetchSourceSite } from "@/lib/supabase";
import { runFeed } from "@/lib/collect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 公開RSS/Atomフィード取り込み。?source_id=... の情報源の feed_url を購読する。
// メール受信取り込みは将来実装（設計のみ）：
//   - 受信専用アドレスに各自治体メルマガを転送 → Inbound Webhook（例 SendGrid/Resend）で受信
//   - 本文を解析し discovered_items に保存。RSS と同じ正規化導線に合流させる想定。
async function handle(sourceId: string | null) {
  if (!sourceId) {
    return NextResponse.json({ ok: false, error: "source_id が必要です。" }, { status: 400 });
  }
  try {
    const site = await fetchSourceSite(sourceId);
    if (!site) return NextResponse.json({ ok: false, error: "情報源が見つかりません。" }, { status: 404 });
    if (!site.feed_url) {
      return NextResponse.json(
        { ok: false, error: "この情報源には feed_url（RSS/Atom URL）が設定されていません。" },
        { status: 200 }
      );
    }
    const summary = await runFeed(site);
    return NextResponse.json({ ...summary });
  } catch (e) {
    return NextResponse.json(
      { source: "feed", ok: false, inserted: 0, updated: 0, scanned: 0, error: (e as Error).message },
      { status: 200 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handle(req.nextUrl.searchParams.get("source_id"));
}

export async function POST(req: NextRequest) {
  let sourceId: string | null = req.nextUrl.searchParams.get("source_id");
  try {
    const body = await req.json();
    if (body?.source_id) sourceId = String(body.source_id);
  } catch {
    /* body任意 */
  }
  return handle(sourceId);
}
