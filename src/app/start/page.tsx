"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { loadProjects, syncProjectsFromSupabase, type SpendingProject } from "@/lib/projects";

// 初期状態から「補助金を見つけて申請する」までを順番に案内するスタートナビ。
//   最新の補助金チェックの状態（チェックリスト・進行ステータス）から「いまここ」を自動判定する。

type Step = {
  title: string;
  desc: string;
  done: (p: SpendingProject | null, hasAny: boolean) => boolean;
  href: (p: SpendingProject | null) => string;
  cta: string;
};

const STEPS: Step[] = [
  {
    title: "補助金チェックを登録する",
    desc: "「これから何にお金を使うか」を1つ登録します（例：看板を作りたい）。30秒でOK。",
    done: (_p, hasAny) => hasAny,
    href: () => "/projects/new",
    cta: "支出を登録する",
  },
  {
    title: "発注の前か確認する",
    desc: "補助金は契約・注文の前が原則。まず「発注前か」をチェックします。",
    done: (p) => !!p?.checklist?.["pre_order"],
    href: (p) => (p ? `/projects/${p.id}?task=pre_order` : "/projects/new"),
    cta: "発注前か確認する",
  },
  {
    title: "使える補助金・定番制度を確認する",
    desc: "判定された候補と、まず確認すべき定番制度を見て、公式サイトで条件を確認します。",
    done: (p) => !!p?.checklist?.["guideline"],
    href: (p) => (p ? `/projects/${p.id}` : "/projects/new"),
    cta: "候補と定番制度を見る",
  },
  {
    title: "見積・必要書類をそろえる",
    desc: "多くの補助金で見積書が必要です。「見積依頼メモ」を使うと業者に頼みやすくなります。",
    done: (p) => !!p?.checklist?.["estimate"],
    href: (p) => (p ? `/projects/${p.id}?task=estimate` : "/projects/new"),
    cta: "見積の準備をする",
  },
  {
    title: "相談する（商工会議所・専門家）",
    desc: "はじめてなら相談がおすすめ。「相談用メモ」を持っていくと話が早いです。",
    done: (p) => !!(p?.checklist?.["shokokai"] || p?.checklist?.["pro"]),
    href: (p) => (p ? `/projects/${p.id}` : "/projects/new"),
    cta: "相談先を見る",
  },
  {
    title: "申請する",
    desc: "準備ができたら申請。申請後は「いまどの段階？」を更新すると、通知や進め方が正確になります。",
    done: (p) => ["applied", "approved", "implementing", "reported", "received"].includes(p?.appStatus ?? ""),
    href: (p) => (p ? `/projects/${p.id}` : "/projects/new"),
    cta: "申請の進め方を見る",
  },
];

export default function StartPage() {
  const [projects, setProjects] = useState<SpendingProject[]>([]);

  useEffect(() => {
    setProjects(loadProjects());
    const onChange = () => setProjects(loadProjects());
    window.addEventListener("projects-changed", onChange);
    syncProjectsFromSupabase().catch(() => {});
    return () => window.removeEventListener("projects-changed", onChange);
  }, []);

  const latest = projects[0] ?? null; // loadProjects は新しい順
  const hasAny = projects.length > 0;
  const states = useMemo(() => STEPS.map((s) => s.done(latest, hasAny)), [latest, hasAny]);
  const current = states.findIndex((d) => !d); // 最初の未完了＝いまここ
  const allDone = current === -1;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-bold text-ink sm:text-2xl">スタートナビ</h1>
      <p className="mt-1 mb-4 text-sm leading-relaxed text-gray-600">
        補助金を見つけて申請するまでを、順番に進めましょう。いまやることだけ進めればOKです。
      </p>

      {allDone ? (
        <div className="mb-4 rounded-xl border-2 border-green-300 bg-green-50 p-4 text-sm text-green-800">
          ひと通り完了しています。新しい支出があれば、いつでも追加してチェックしましょう。
        </div>
      ) : (
        <div className="mb-4 rounded-xl border-2 border-accent/40 bg-accent/5 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">次にやること</p>
          <p className="mt-0.5 text-base font-bold text-ink">{STEPS[current].title}</p>
          <p className="mt-1 text-sm text-gray-600">{STEPS[current].desc}</p>
          <Link href={STEPS[current].href(latest)} className="mt-3 inline-block rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">
            {STEPS[current].cta} →
          </Link>
        </div>
      )}

      <ol className="space-y-2">
        {STEPS.map((s, i) => {
          const done = states[i];
          const here = i === current;
          const locked = !hasAny && i > 0 && !done;
          return (
            <li key={s.title} className={`flex items-start gap-3 rounded-lg border p-3 ${here ? "border-accent bg-accent/5" : done ? "border-green-200 bg-green-50/40" : "bg-white"}`}>
              <span className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-green-500 text-white" : here ? "bg-accent text-white" : "bg-gray-200 text-gray-600"}`}>
                {done ? "✓" : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{s.title}</span>
                  {done && <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] text-green-700">済み</span>}
                  {here && <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] text-white">いまここ</span>}
                </span>
                <span className="mt-0.5 block text-xs text-gray-600">{s.desc}</span>
                {!done && !locked && (
                  <Link href={s.href(latest)} className="mt-1.5 inline-block text-xs font-medium text-accent hover:underline">{s.cta} →</Link>
                )}
                {locked && <span className="mt-1.5 inline-block text-[11px] text-gray-400">先に「補助金チェックを登録」から始めましょう</span>}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link href="/" className="rounded-md border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">ホームへ</Link>
        <Link href="/guide" className="rounded-md border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">くわしい使い方ガイド</Link>
      </div>
    </div>
  );
}
