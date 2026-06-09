"use client";

import Link from "next/link";

// 各画面上部の「この画面でできること」案内ボックス
export function HelpBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 p-3">
      <p className="text-sm font-semibold text-sky-900">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-sky-800">{children}</p>
    </div>
  );
}

// /discovery 上部に置く「①〜④」の手順ガイド
export function StepGuide() {
  const steps = [
    { no: "①", label: "情報源を登録", href: "/discovery/sources", desc: "どこから集めるか決める" },
    { no: "②", label: "全収集", href: "/discovery/sources", desc: "最新の補助金を取り込む" },
    { no: "③", label: "候補を確認", href: "/discovery/items", desc: "集まった候補を見る" },
    { no: "④", label: "正式登録", href: "/discovery/review", desc: "正式リストに追加する" },
  ];
  return (
    <div className="mb-4 rounded-lg border bg-white p-3">
      <p className="mb-2 text-xs font-semibold text-gray-600">使い方の流れ（この順に進めます）</p>
      <div className="flex flex-wrap items-stretch gap-2">
        {steps.map((s, i) => (
          <div key={s.no} className="flex items-center gap-2">
            <Link
              href={s.href}
              className="flex min-w-[140px] flex-col rounded-md border px-3 py-2 transition hover:border-accent hover:bg-gray-50"
            >
              <span className="text-sm font-semibold text-ink">
                <span className="text-accent">{s.no}</span> {s.label}
              </span>
              <span className="text-[11px] text-gray-500">{s.desc}</span>
            </Link>
            {i < steps.length - 1 && <span className="text-gray-300">→</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// 操作ボタンの説明一覧（「このボタンを押したら何が起きるか」を1行ずつ）
export function ButtonGuide({ items }: { items: { label: string; desc: string }[] }) {
  return (
    <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <p className="mb-1.5 text-xs font-semibold text-gray-600">ボタンの説明</p>
      <ul className="space-y-1">
        {items.map((it) => (
          <li key={it.label} className="flex flex-wrap gap-x-2 text-xs leading-relaxed">
            <span className="shrink-0 rounded bg-white px-1.5 py-0.5 font-medium text-ink ring-1 ring-gray-200">
              {it.label}
            </span>
            <span className="text-gray-600">{it.desc}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
