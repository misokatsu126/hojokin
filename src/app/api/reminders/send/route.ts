import { NextResponse } from "next/server";
import { supabase, type SpendingProjectRow } from "@/lib/supabase";
import { sendNotification } from "@/lib/notify";
import { rowToProject } from "@/lib/projects";
import { computeProjectAlerts, ALERT_META, type ProjectAlert } from "@/lib/projectAlerts";
import type { DiscoveredItem } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 案件ベースのリマインドを送信する（毎日のcron等から呼ぶ想定）。
//   - Supabase の spending_projects から案件を読み、通知を算出
//   - 重要度 high（至急）を既定で対象（?level=all で全件）
//   - reminder_log で「同じ通知をその日に二重送信」しないよう重複防止
//   - NOTIFICATION_ENABLED と送信先（LINE_USER_ID / NOTIFICATION_WEBHOOK_URL）が無ければ skipped
//   ※ モック成功にはしない。送れなければ skipped / failed を正直に返す。
async function handle(req: Request) {
  const level = new URL(req.url).searchParams.get("level") === "all" ? "all" : "high";

  let projects;
  let items: DiscoveredItem[] = [];
  try {
    const { data: rows, error } = await supabase.from("spending_projects").select("*").limit(500);
    if (error) throw error;
    projects = (rows as SpendingProjectRow[] ?? []).map(rowToProject);
    const { data: it } = await supabase.from("discovered_items").select("*");
    items = (it ?? []) as DiscoveredItem[];
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message, hint: "spending_projects_schema.sql を実行済みか確認してください" }, { status: 200 });
  }

  let alerts = computeProjectAlerts(projects, items);
  if (level === "high") alerts = alerts.filter((a) => a.severity === "high");
  if (alerts.length === 0) {
    return NextResponse.json({ ok: true, projects: projects.length, candidates: 0, sent: 0, failed: 0, skipped: 0, alreadySent: 0 });
  }

  // 当日すでに送ったものは除外（締切系も含め1日1回まで）
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  let already = new Set<string>();
  try {
    const { data } = await supabase
      .from("reminder_log")
      .select("alert_key, sent_at, status")
      .in("alert_key", alerts.map((a) => a.key))
      .gte("sent_at", startOfToday.toISOString());
    already = new Set((data ?? []).filter((r: any) => r.status === "sent").map((r: any) => r.alert_key));
  } catch {
    // reminder_log 未作成でも送信自体は試みる（重複防止だけ効かない）
  }
  const toSend = alerts.filter((a) => !already.has(a.key));

  // 案件ごとにまとめて1通
  const byProject = new Map<string, ProjectAlert[]>();
  for (const a of toSend) {
    if (!byProject.has(a.projectId)) byProject.set(a.projectId, []);
    byProject.get(a.projectId)!.push(a);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || null;
  let sent = 0, failed = 0, skipped = 0;

  for (const [projectId, group] of byProject) {
    const name = group[0].projectName;
    const message = group.map((a) => `${ALERT_META[a.kind].icon} ${a.title}\n　${a.detail}`).join("\n");
    const r = await sendNotification({
      title: `【補助金リマインド】${name}`,
      message,
      official_url: appUrl ? `${appUrl}/projects/${projectId}` : null,
      notification_type: group[0].kind,
    });
    if (r.skipped) { skipped += group.length; continue; } // 未有効化：ログも残さない
    if (r.ok) {
      sent += group.length;
      try {
        await supabase.from("reminder_log").insert(
          group.map((a) => ({ project_id: a.projectId, alert_key: a.key, kind: a.kind, channel: r.channel, status: "sent" }))
        );
      } catch { /* ログ失敗は無視（送信は成功） */ }
    } else {
      failed += group.length;
      try {
        await supabase.from("reminder_log").insert(
          group.map((a) => ({ project_id: a.projectId, alert_key: a.key, kind: a.kind, channel: r.channel, status: "failed" }))
        );
      } catch { /* noop */ }
    }
  }

  return NextResponse.json({
    ok: true,
    projects: projects.length,
    candidates: alerts.length,
    alreadySent: alerts.length - toSend.length,
    sent, failed, skipped,
    note: skipped > 0
      ? "NOTIFICATION_ENABLED と送信先（LINE_USER_ID / NOTIFICATION_WEBHOOK_URL）が未設定のため送信していません。"
      : undefined,
  });
}

export async function GET(req: Request) { return handle(req); }
export async function POST(req: Request) { return handle(req); }
