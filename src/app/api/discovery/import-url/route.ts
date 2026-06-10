import { NextRequest, NextResponse } from "next/server";
import { ingestUrl } from "@/lib/collect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// URLを直接取り込み discovered_items に保存する。J-Net21個別記事は専用パーサーで抽出。
// 取得失敗時もモックにせず ok:false + error + reason を返す。
export async function POST(req: NextRequest) {
  let url = "";
  try {
    const body = await req.json();
    url = String(body.url ?? "").trim();
    if (!/^https?:\/\//i.test(url)) throw new Error("URL形式が不正です");
  } catch {
    return NextResponse.json({ ok: false, error: "URLを入力してください。", reason: "bad_request" }, { status: 400 });
  }
  try {
    const r = await ingestUrl(url);
    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: r.error ?? "取り込みに失敗しました", reason: r.reason ?? "unknown", source_url: url },
        { status: 200 }
      );
    }
    return NextResponse.json({
      ok: true,
      inserted: r.inserted,
      discovered_item_id: r.discovered_item_id ?? null,
      title: r.title ?? null,
      source_url: url,
      official_url: r.official_url ?? null,
      external_source: r.external_source ?? null,
      match_score: r.match_score ?? null,
      match_profile: r.match_profile ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message, reason: "exception", source_url: url },
      { status: 200 }
    );
  }
}
