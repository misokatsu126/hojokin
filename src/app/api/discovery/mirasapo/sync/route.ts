import { NextResponse } from "next/server";
import { runMirasapo } from "@/lib/collect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ミラサポplus 補助金一覧を実HTTP取得して取り込む（出典「中小企業庁 ミラサポplus」付与）。
// 取得失敗・一覧抽出0件でもモックは返さず、200 + ok:false（理由つき）で返す。
async function handle() {
  try {
    const summary = await runMirasapo();
    return NextResponse.json({ ...summary });
  } catch (e) {
    return NextResponse.json(
      { source: "mirasapo", ok: false, inserted: 0, updated: 0, scanned: 0, error: (e as Error).message },
      { status: 200 }
    );
  }
}

export async function GET() {
  return handle();
}
export async function POST() {
  return handle();
}
