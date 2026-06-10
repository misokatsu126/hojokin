"use client";

import { useState } from "react";
import Link from "next/link";

const SLIDES = [
  { n: "1", title: "事業プロフィールを登録", body: "まず自社（またはお客様）の事業を登録します。地域・業種・やりたいことを入れると、合いそうな補助金を自動でおすすめします。", cta: { href: "/setup", label: "初期設定へ" }, emoji: "🏢" },
  { n: "2", title: "補助金を自動で集める", body: "情報源（Jグランツ・J-Net21・自治体ページ）を登録して「今すぐ全収集」。毎朝6時にも自動で最新化されます。", cta: { href: "/discovery/sources", label: "情報源・収集へ" }, emoji: "📡" },
  { n: "3", title: "今日見るべきものを確認", body: "ホームとカレンダーで「本日開始・締切間近・自社に合う」がひと目で分かります。気になったら「公式ページを見る」。", cta: { href: "/calendar", label: "カレンダーへ" }, emoji: "🗓" },
  { n: "4", title: "使えそうなら申請を検討する", body: "候補ごとに申請前チェックで抜け漏れを防ぎ、「申請を検討する」に。不要なものは「今回は使わない」に整理できます。", cta: { href: "/discovery/items", label: "候補を見るへ" }, emoji: "✅" },
  { n: "5", title: "お客様に渡す資料を作る", body: "事業を選んで「レポート作成」→「印刷 / PDF保存」。そのままお客様に渡せます。", cta: { href: "/reports", label: "資料を作るへ" }, emoji: "📄" },
];

// 補助金と助成金の違い（初心者向けの説明：brief §23）
const KINDS = [
  { title: "補助金", body: "審査があり、採択されると経費の一部が補助される制度。応募多数や予算上限で採択されない場合もあります。", tone: "bg-blue-50 text-blue-900 border-blue-200" },
  { title: "助成金", body: "条件を満たすと受けられる可能性が高い制度。雇用・研修・労務関連が多く、申請前の手続きが重要です。", tone: "bg-emerald-50 text-emerald-900 border-emerald-200" },
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

      {/* 補助金と助成金の違い */}
      <div className="mt-8">
        <h2 className="mb-2 text-base font-bold text-ink">補助金と助成金のちがい</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {KINDS.map((k) => (
            <div key={k.title} className={`rounded-lg border p-4 ${k.tone}`}>
              <h3 className="mb-1 text-sm font-bold">{k.title}</h3>
              <p className="text-xs leading-relaxed">{k.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
          どちらも、申請前に条件確認が必要です。交付決定前に発注・購入すると対象外になる場合があります。先に買う前に、必ず公式ページ・公募要領で確認してください。
        </p>
      </div>

      {/* このツールの考え方（見落とし防止） */}
      <div className="mt-6 rounded-lg border bg-white p-4 text-sm text-gray-600">
        <h2 className="mb-2 text-base font-bold text-ink">このツールの考え方</h2>
        <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed">
          <li>使える可能性がある補助金・助成金を「見落とさない」ためのツールです。</li>
          <li>AIが申請可否を断定するものではありません。まず広く候補を拾い、確認する順番を付けます。</li>
          <li>最終判断は、公式ページ・公募要領・窓口で必ず確認してください。</li>
          <li>不要なものは「今回は使わない」、使えそうなものは「申請を検討する」に整理できます。</li>
        </ul>
      </div>
    </div>
  );
}
