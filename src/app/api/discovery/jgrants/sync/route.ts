import { NextRequest, NextResponse } from "next/server";
import { runJgrantsSync } from "@/lib/collect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Jグランツ公開API同期。GET/POST 両対応。取得失敗時も 200 + ok:false で返す（落とさない）。
async function handle(keywords?: string[]) {
  try {
    const summary = await runJgrantsSync(keywords?.length ? { keywords } : undefined);
    return NextResponse.json({ ...summary });
  } catch (e) {
    return NextResponse.json(
      { source: "jgrants", ok: false, inserted: 0, updated: 0, scanned: 0, error: (e as Error).message },
      { status: 200 }
    );
  }
}

export async function GET() {
  return handle();
}

export async function POST(req: NextRequest) {
  let keywords: string[] | undefined;
  try {
    const body = await req.json();
    if (Array.isArray(body?.keywords)) keywords = body.keywords.map(String);
  } catch {
    /* body任意 */
  }
  return handle(keywords);
}
