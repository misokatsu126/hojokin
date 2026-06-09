import { NextResponse } from "next/server";
import { runAll } from "@/lib/collect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 全収集をまとめて実行（Jグランツ + 公式巡回 + フィード）。
// Vercel Cron は GET で叩くため GET/POST 両対応。失敗時も 200 で返す（Cronを失敗扱いにしない）。
async function handle() {
  try {
    const { summaries, totals } = await runAll();
    return NextResponse.json({ ok: true, ran_at: new Date().toISOString(), totals, summaries });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message, ran_at: new Date().toISOString() },
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
