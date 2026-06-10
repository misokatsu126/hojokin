import { NextResponse } from "next/server";
import { runJnet21 } from "@/lib/collect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// J-Net21 支援情報ヘッドライン RSS を実HTTP取得して取り込む。
// 取得失敗時もモックは返さず、200 + ok:false（理由つき）で返す。
async function handle() {
  try {
    const summary = await runJnet21();
    return NextResponse.json({ ...summary });
  } catch (e) {
    return NextResponse.json(
      { source: "jnet21", ok: false, inserted: 0, updated: 0, scanned: 0, error: (e as Error).message },
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
