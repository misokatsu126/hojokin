"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchNotificationCandidates, updateNotificationStatus } from "@/lib/supabase";
import type { NotificationCandidate } from "@/lib/types";
import { NOTIFICATION_TYPE_LABEL, NOTIFICATION_TYPE_COLORS, type NotificationType } from "@/lib/constants";
import { formatDate, daysUntil } from "@/lib/utils";

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationCandidate[]>([]);
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<string | null>(null);

  async function load() {
    setItems(await fetchNotificationCandidates());
  }

  async function sendAll() {
    setSending(true);
    setSendMsg(null);
    try {
      const r = await fetch("/api/notifications/send", { method: "POST" });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error ?? "送信に失敗しました");
      setSendMsg(
        d.skipped > 0
          ? `送信は未有効化です（NOTIFICATION_ENABLED 未設定）。対象 ${d.pending} 件は保持されています。LINE_USER_ID か NOTIFICATION_WEBHOOK_URL を設定すると送信できます。`
          : `送信しました：成功 ${d.sent} 件・失敗 ${d.failed} 件（対象 ${d.pending} 件）。`
      );
      await load();
    } catch (e: any) {
      setSendMsg(`送信エラー：${e.message}`);
    } finally {
      setSending(false);
    }
  }
  useEffect(() => {
    load()
      .catch((e) => setError(e.message ?? "読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  const shown = useMemo(
    () => (tab === "pending" ? items.filter((i) => i.status === "pending") : items),
    [items, tab]
  );

  async function setStatus(id: string, status: "sent" | "dismissed") {
    setBusy(id);
    try {
      await updateNotificationStatus(id, status);
      await load();
    } catch (e: any) {
      alert(`更新に失敗しました: ${e.message}`);
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <p className="py-12 text-center text-gray-400">読み込み中…</p>;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-ink">お知らせ候補</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border p-0.5 text-xs">
            <button onClick={() => setTab("pending")} className={`rounded px-2.5 py-1 ${tab === "pending" ? "bg-accent text-white" : "text-gray-600 hover:bg-gray-100"}`}>未対応</button>
            <button onClick={() => setTab("all")} className={`rounded px-2.5 py-1 ${tab === "all" ? "bg-accent text-white" : "text-gray-600 hover:bg-gray-100"}`}>すべて</button>
          </div>
          <button onClick={sendAll} disabled={sending} className="rounded-md border px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            {sending ? "送信中…" : "未送信をまとめて送信"}
          </button>
        </div>
      </div>
      {sendMsg && <p className="mb-3 rounded-md border border-sky-200 bg-sky-50 p-2 text-xs text-sky-800">{sendMsg}</p>}

      <p className="mb-4 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-800">
        毎日の自動収集で見つかった「お知らせすべき候補」（高相性80点以上・締切間近・新着・人間確認待ち）の一覧です。
        メール/LINE送信は今後対応予定で、現在は画面で確認します。「通知済みにする」「非表示」で整理できます。
      </p>

      {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}（discovery_phase2_schema.sql を実行済みか確認してください）</p>}

      {shown.length === 0 ? (
        <p className="rounded-lg border bg-white p-8 text-center text-gray-400">
          通知候補はありません。<Link href="/discovery/sources" className="text-accent hover:underline">情報源管理</Link>で「今すぐ全収集」を実行すると生成されます。
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-slate-50 text-left text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2">種別</th>
                <th className="px-3 py-2">補助金名</th>
                <th className="px-3 py-2">対象事業</th>
                <th className="px-3 py-2">相性</th>
                <th className="px-3 py-2">締切</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((n) => {
                const dd = daysUntil(n.deadline);
                const t = n.notification_type as NotificationType;
                return (
                  <tr key={n.id} className="border-b last:border-0 align-top">
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${NOTIFICATION_TYPE_COLORS[t] ?? "bg-gray-100 text-gray-600"}`}>
                        {NOTIFICATION_TYPE_LABEL[t] ?? n.notification_type}
                      </span>
                      {n.status !== "pending" && <div className="mt-0.5 text-[10px] text-gray-400">{n.status === "sent" ? "通知済み" : n.status === "dismissed" ? "非表示" : n.status}</div>}
                    </td>
                    <td className="px-3 py-2 font-medium text-ink">{n.title}</td>
                    <td className="px-3 py-2 text-gray-500">{n.profile_name ?? "—"}</td>
                    <td className="px-3 py-2">{n.match_score != null ? <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-bold text-green-800">{n.match_score}</span> : "—"}</td>
                    <td className="px-3 py-2 text-xs">{n.deadline ? `${formatDate(n.deadline)}${dd != null && dd >= 0 ? `（あと${dd}日）` : ""}` : "—"}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {(n.official_url || n.source_url) && (
                        <a href={n.official_url ?? n.source_url ?? "#"} target="_blank" rel="noopener noreferrer" className="mr-2 rounded bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:opacity-90">公式ページを見る↗</a>
                      )}
                      {n.status === "pending" && (
                        <>
                          <button onClick={() => setStatus(n.id, "sent")} disabled={busy === n.id} className="mr-2 text-accent hover:underline disabled:opacity-40">通知済みにする</button>
                          <button onClick={() => setStatus(n.id, "dismissed")} disabled={busy === n.id} className="text-gray-500 hover:underline disabled:opacity-40">非表示</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
