"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchDiscoveredItems } from "@/lib/supabase";
import type { DiscoveredItem } from "@/lib/types";
import { verifyItem, VERIFY_STATE_LABEL, PAGE_TYPE_LABEL, type VerifyState } from "@/lib/verify";
import { formatAmount } from "@/lib/utils";
import { isSampleDiscovered } from "@/lib/sampleFilter";
import { DiscoveryNav } from "@/components/DiscoveryNav";
import { formatDate } from "@/lib/utils";

const STATE_TONE: Record<VerifyState, string> = {
  user_visible: "bg-green-100 text-green-800",
  admin_review: "bg-amber-100 text-amber-800",
  archived_or_old: "bg-slate-100 text-slate-600",
  reference_only: "bg-slate-100 text-slate-500",
  rejected_noise: "bg-gray-100 text-gray-400",
};

export default function SearchReviewPage() {
  const [items, setItems] = useState<DiscoveredItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<VerifyState | "all">("all");

  useEffect(() => {
    fetchDiscoveredItems().then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => {
    return items
      .filter((i) => !isSampleDiscovered(i))
      .map((i) => ({ i, v: verifyItem(i, null) }))
      .sort((a, b) => b.v.score - a.v.score);
  }, [items]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.v.state] = (c[r.v.state] ?? 0) + 1;
    return c;
  }, [rows]);

  const shown = filter === "all" ? rows : rows.filter((r) => r.v.state === filter);

  if (loading) return <p className="py-12 text-center text-gray-400">読み込み中…</p>;

  return (
    <div>
      <DiscoveryNav />
      <h1 className="mb-1 text-xl font-bold text-ink">検索結果レビュー（管理者）</h1>
      <p className="mb-4 text-sm text-gray-500">
        検索・収集で見つけた候補を「公式・制度ページ・要件・ノイズ」で検証した結果です。
        ユーザー画面には「表示OK／公式確認待ち」だけが出ます。ノイズ・古い・参考情報はここで管理します。
      </p>

      <div className="mb-4 flex flex-wrap gap-1.5 text-xs">
        <button onClick={() => setFilter("all")} className={`rounded-full border px-2.5 py-1 ${filter === "all" ? "border-accent bg-accent/10 text-accent" : "text-gray-600 hover:bg-gray-50"}`}>すべて（{rows.length}）</button>
        {(Object.keys(VERIFY_STATE_LABEL) as VerifyState[]).map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={`rounded-full border px-2.5 py-1 ${filter === s ? "border-accent bg-accent/10 text-accent" : "text-gray-600 hover:bg-gray-50"}`}>
            {VERIFY_STATE_LABEL[s]}（{counts[s] ?? 0}）
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-lg border bg-white p-8 text-center text-gray-400">該当する候補がありません。</p>
      ) : (
        <div className="space-y-2">
          {shown.map(({ i, v }) => (
            <div key={i.id} className="rounded-lg border bg-white p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 truncate font-semibold text-ink">{i.title ?? "（無題）"}</span>
                <span className="flex shrink-0 items-center gap-1.5 text-[11px]">
                  <span className={`rounded px-1.5 py-0.5 ${STATE_TONE[v.state]}`}>{VERIFY_STATE_LABEL[v.state]}</span>
                  <span className="rounded bg-green-50 px-1.5 py-0.5 text-green-800" title="ユーザーに強く表示してよいか">表示 {v.displayConfidence}</span>
                  <span className="rounded bg-sky-50 px-1.5 py-0.5 text-sky-800" title="捨てると見逃しになりそうか">見逃しリスク {v.missedOpportunityRisk}</span>
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
                <span className="rounded bg-slate-100 px-1.5 py-0.5">{PAGE_TYPE_LABEL[v.pageType]}</span>
                <span>{v.official ? "公式" : "民間/未確認"}</span>
                <span>要件抽出 {v.req.count}/9</span>
                <span>出典：{i.external_source ?? "—"}</span>
              </div>
              <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-gray-600 sm:grid-cols-3">
                <span title={v.regionMatchReason}>地域：{v.regionMatchType}（{v.regionMatch ? "一致" : "不一致/不明"}）</span>
                <span title={v.expenseMatchReason}>経費：{v.expenseMatchType}（{v.expenseMatch ? "一致/近い" : "不一致/不明"}）</span>
                <span>補助率/上限：{v.extracted.rate || (v.extracted.maxAmount != null ? formatAmount(v.extracted.maxAmount) : "—")}</span>
                <span>対象者：{v.req.target ? "記載あり" : "—"}</span>
                <span>公募要領：{v.req.guideline ? "あり" : "—"}</span>
                <span>締切：{v.extracted.deadline ? formatDate(v.extracted.deadline) : "—"}</span>
              </div>
              {v.userVisibleReason && <p className="mt-1 text-[11px] text-green-700">表示理由：{v.userVisibleReason}</p>}
              {v.adminReviewReason && <p className="mt-1 text-[11px] text-amber-700">確認待ち理由：{v.adminReviewReason}</p>}
              {v.rejectReason && <p className="mt-1 text-[11px] text-rose-600">除外理由：{v.rejectReason}</p>}
              <div className="mt-1.5 flex flex-wrap gap-2 text-xs">
                {(i.official_url || i.url) && <a href={i.official_url ?? i.url ?? "#"} target="_blank" rel="noopener noreferrer" className="text-emerald-700 hover:underline">ページを開く ↗</a>}
                <Link href="/discovery/items" className="text-gray-500 hover:underline">候補一覧で操作する</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
