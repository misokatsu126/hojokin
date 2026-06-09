import { NextRequest, NextResponse } from "next/server";
import { fetchSourceSite } from "@/lib/supabase";
import { runCrawl } from "@/lib/collect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 公式ページ巡回。?source_id=... または body.source_id。取得失敗時も 200 で ok:false を返す。
async function handle(sourceId: string | null) {
  if (!sourceId) {
    return NextResponse.json({ ok: false, error: "source_id が必要です。" }, { status: 400 });
  }
  try {
    const site = await fetchSourceSite(sourceId);
    if (!site) return NextResponse.json({ ok: false, error: "情報源が見つかりません。" }, { status: 404 });
    const summary = await runCrawl(site);
    return NextResponse.json({ ...summary });
  } catch (e) {
    return NextResponse.json(
      { source: "crawl", ok: false, inserted: 0, updated: 0, scanned: 0, error: (e as Error).message },
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
