"use client";

import { useState } from "react";
import Link from "next/link";

const SLIDES = [
  { n: "1", title: "事業プロフィールを登録", body: "まず自社（またはお客様）の事業を登録します。地域・業種・やりたいことを入れると、合いそうな補助金を自動でおすすめします。", cta: { href: "/setup", label: "初期設定へ" }, emoji: "🏢" },
  { n: "2", title: "補助金を自動で集める", body: "情報源（Jグランツ・J-Net21・自治体ページ）を登録して「今すぐ全収集」。毎朝6時にも自動で最新化されます。", cta: { href: "/discovery/sources", label: "情報源・収集へ" }, emoji: "📡" },
  { n: "3", title: "今日見るべきものを確認", body: "ホームとカレンダーで「本日開始・締切間近・自社に合う」がひと目で分かります。気になったら「公式ページを見る」。", cta: { href: "/calendar", label: "カレンダーへ" }, emoji: "🗓" },
  { n: "4", title: "使えそうなら申請候補に", body: "候補ごとに公式確認チェックリストで抜け漏れを防ぎ、状態を「申請候補」に。メモも残せます。", cta: { href: "/discovery/items", label: "見つかった補助金へ" }, emoji: "✅" },
  { n: "5", title: "お客様向けレポートを作る", body: "事業を選んで「レポート作成」→「印刷 / PDF保存」。そのままお客様に渡せます。", cta: { href: "/reports", label: "レポートへ" }, emoji: "📄" },
];

export default function GuidePage() {
  const [i, setI] = useState(0);
  const s = SLIDES[i];
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-4 text-xl font-bold text-ink">使い方ガイド</h1>

      <div className="rounded-xl border bg-white p-6 text-center shadow-sm">
        <div className="mb-2 text-4xl">{s.emoji}</div>
        <div className="mx-auto mb-3 inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">{s.n}</div>
        <h2 className="mb-2 text-lg font-bold text-ink">{s.title}</h2>
        <p className="mx-auto mb-4 max-w-md text-sm leading-relaxed text-gray-600">{s.body}</p>
        <Link href={s.cta.href} className="inline-block rounded-md bg-accent px-5 py-2 text-sm font-medium text-white hover:opacity-90">{s.cta.label}</Link>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button onClick={() => setI((v) => Math.max(0, v - 1))} disabled={i === 0} className="rounded-md border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40">← 戻る</button>
        <div className="flex gap-1.5">
          {SLIDES.map((_, idx) => (
            <button key={idx} onClick={() => setI(idx)} className={`h-2.5 w-2.5 rounded-full ${idx === i ? "bg-accent" : "bg-gray-300"}`} aria-label={`スライド${idx + 1}`} />
          ))}
        </div>
        {i < SLIDES.length - 1 ? (
          <button onClick={() => setI((v) => Math.min(SLIDES.length - 1, v + 1))} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">次へ →</button>
        ) : (
          <Link href="/" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">はじめる</Link>
        )}
      </div>
    </div>
  );
}
