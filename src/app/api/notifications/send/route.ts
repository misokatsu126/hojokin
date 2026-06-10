import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendNotification } from "@/lib/notify";
import type { NotificationCandidate } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 未送信(pending)の通知候補をまとめて送信する。
// NOTIFICATION_ENABLED 未設定なら送信せず skipped を返す（モック成功にしない）。
async function handle() {
  let pending: NotificationCandidate[] = [];
  try {
    const { data } = await supabase
      .from("notification_candidates")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(50);
    pending = (data ?? []) as NotificationCandidate[];
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 200 });
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const n of pending) {
    const r = await sendNotification({
      title: n.title,
      message: n.message,
      official_url: n.official_url ?? n.source_url ?? null,
      notification_type: String(n.notification_type),
    });
    if (r.skipped) {
      skipped++;
      continue; // 送信未有効化：statusは変更しない
    }
    if (r.ok) {
      sent++;
      await supabase.from("notification_candidates").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", n.id);
    } else {
      failed++;
      await supabase.from("notification_candidates").update({ status: "failed" }).eq("id", n.id);
    }
  }

  return NextResponse.json({
    ok: true,
    pending: pending.length,
    sent,
    failed,
    skipped,
    note: skipped > 0 ? "NOTIFICATION_ENABLED 未設定のため送信していません（候補は保持）。" : undefined,
  });
}

export async function GET() {
  return handle();
}
export async function POST() {
  return handle();
}
