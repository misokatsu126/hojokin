"use client";

import { formatAmount, formatDate, daysUntil } from "@/lib/utils";

export type ReportItem = {
  kind: "grant" | "discovered" | "candidate";
  kindLabel: string; // 管理対象に登録済み / 見つかった補助金 / 整理済み候補
  title: string;
  source: string; // 出典
  regions: string[];
  amount: number | null;
  rate: string | null;
  deadline: string | null;
  score: number;
  reason: string;
  concerns: string;
  nextActions: string[];
  url: string | null;
};

export function ReportView({
  profileName,
  generatedAt,
  items,
  orgName,
}: {
  profileName: string;
  generatedAt: string;
  items: ReportItem[];
  orgName?: string;
}) {
  const high = items.filter((i) => i.score >= 80);
  const deadlineSoon = items.filter((i) => {
    const d = daysUntil(i.deadline);
    return d != null && d >= 0 && d <= 30;
  });

  return (
    <div className="rounded-lg border bg-white p-6 print-block">
      {/* ブランドヘッダー */}
      <div className="mb-4 flex items-center justify-between border-b-2 border-accent pb-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-accent text-sm font-bold text-white">補</span>
          <span className="text-base font-bold text-ink">補助金<span className="text-accent">レーダー</span></span>
        </div>
        <div className="text-right text-[11px] text-gray-500">
          {orgName ? <div className="font-medium text-ink">{orgName}</div> : null}
          <div>作成日：{generatedAt}</div>
        </div>
      </div>

      <div className="mb-4">
        <h2 className="text-lg font-bold text-ink">補助金・助成金 候補レポート</h2>
        <p className="text-sm text-gray-600">対象（お客様・事業）：{profileName}</p>
        <p className="text-xs text-gray-400">候補件数：{items.length}件（まず確認すべき{high.length}・締切30日以内{deadlineSoon.length}）</p>
      </div>

      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">条件に合う候補（合いそう度60点以上・締切前）はありませんでした。</p>
      ) : (
        <div className="space-y-5">
          <ReportSection title="まず確認すべき制度" desc="特に合いそう度が高く、優先して公式ページを確認する価値があります。" items={items.filter((i) => i.score >= 80)} />
          <ReportSection title="条件次第で使えるかもしれない制度" desc="条件次第で対象になる可能性があります。気になるものは公式ページで確認してください。" items={items.filter((i) => i.score >= 60 && i.score < 80)} />
        </div>
      )}

      <p className="mt-4 border-t pt-3 text-[11px] leading-relaxed text-gray-400">
        ※ 本レポートは登録データ・自動収集候補に基づく一次判定です。申請可否・受給を保証するものではありません。
        申請前に必ず公式情報・公募要領をご確認ください（各候補の「公式ページを見る」URL）。
      </p>
    </div>
  );
}

function ReportSection({ title, desc, items }: { title: string; desc: string; items: ReportItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="print-block">
      <h3 className="mb-1 text-sm font-bold text-ink">{title}（{items.length}件）</h3>
      <p className="mb-2 text-[11px] text-gray-500">{desc}</p>
      <ol className="space-y-3">
        {items.map((it, idx) => <ReportRow key={idx} it={it} idx={idx} />)}
      </ol>
    </section>
  );
}

function ReportRow({ it, idx }: { it: ReportItem; idx: number }) {
  const dd = daysUntil(it.deadline);
  return (
    <li className="rounded-md border p-3 print-block">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="mr-1 text-xs text-gray-400">{idx + 1}.</span>
          <span className="text-sm font-semibold text-ink">{it.title}</span>
          <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{it.kindLabel}</span>
        </div>
        <span className="shrink-0 rounded bg-green-100 px-2 py-0.5 text-xs font-bold text-green-800">合いそう度 {it.score}</span>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-gray-600 sm:grid-cols-4">
        <span>出典：{it.source}</span>
        <span>地域：{it.regions.slice(0, 3).join("・") || "—"}</span>
        <span>補助額：{it.amount != null ? formatAmount(it.amount) : it.rate || "—"}</span>
        <span className={dd != null && dd <= 14 ? "font-semibold text-red-600" : ""}>締切：{it.deadline ? `${formatDate(it.deadline)}${dd != null && dd >= 0 ? `（あと${dd}日）` : ""}` : "通年・未定"}</span>
      </div>
      {it.reason && <p className="mt-1 text-xs text-gray-700"><span className="text-gray-400">なぜ合いそうか：</span>{it.reason}</p>}
      {it.concerns && <p className="mt-0.5 text-xs text-red-600"><span className="text-red-400">注意点：</span>{it.concerns}</p>}
      {it.nextActions.length > 0 && (
        <p className="mt-0.5 text-xs text-orange-700"><span className="text-orange-400">次にやること：</span>{it.nextActions.join(" / ")}</p>
      )}
      {it.url && <p className="mt-0.5 text-xs"><span className="text-gray-400">公式ページを見る：</span><a href={it.url} target="_blank" rel="noopener noreferrer" className="text-accent underline">{it.url}</a></p>}
    </li>
  );
}
