"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchDiscoveredItems } from "@/lib/supabase";
import type { DiscoveredItem } from "@/lib/types";
import {
  loadProjects, classifyForProject, projectTasks, orderAdvice, getTemplate, PROJECT_TEMPLATES, PROJECT_CHECKLIST,
  type SpendingProject, type ProjectMatch, type ProjectTask,
} from "@/lib/projects";

type Row = {
  p: SpendingProject;
  match: ProjectMatch;
  tasks: ProjectTask[];
  preOrderRisk: boolean; // 発注前確認が必要
  orderedRisk: boolean; // すでに発注済み（対象外の恐れ）
  headline: string;
  topTaskKey: string | null;
  tone: "red" | "amber" | "blue" | "green";
  nextActions: string[];
  done: number;
  rank: number; // 並び順（小さいほど上）
};

export function HomeDashboard() {
  const [projects, setProjects] = useState<SpendingProject[]>([]);
  const [items, setItems] = useState<DiscoveredItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setProjects(loadProjects());
    const onChange = () => setProjects(loadProjects());
    window.addEventListener("projects-changed", onChange);
    fetchDiscoveredItems().then(setItems).catch(() => setItems([])).finally(() => setLoaded(true));
    return () => window.removeEventListener("projects-changed", onChange);
  }, []);

  const rows: Row[] = useMemo(() => {
    return projects.map((p) => {
      const match = classifyForProject(p, items);
      const adv = orderAdvice(p.orderStatus);
      const tasks = projectTasks(p, match);
      const orderedRisk = p.orderStatus === "contract" || p.orderStatus === "ordered" || p.orderStatus === "paid";
      const preOrderRisk = adv.wait && !p.checklist?.["pre_order"];
      let headline: string;
      let tone: Row["tone"];
      // 発注状況別に headline と色を変える（常に赤の「まだ発注しないで」は強すぎる）
      if (orderedRisk) { headline = "この経費は対象外の可能性があります"; tone = "red"; }
      else if (tasks[0]?.taskKey === "pre_order") {
        headline = p.orderStatus === "estimate" ? "見積だけならまだ間に合う可能性があります" : "発注前に公式要領を確認してください";
        tone = "amber";
      }
      else if (tasks[0]) { headline = tasks[0].action; tone = "blue"; }
      else if (match.top?.r.key === "usable") { headline = "公式ページで最終確認しましょう"; tone = "green"; }
      else { headline = "公式ページで確認しましょう"; tone = "blue"; }
      const tpl = getTemplate(p.templateKey);
      // 「次にやること」は実際の未完了タスクから作る（チェック完了で消える）。0件のときだけテンプレ補助
      const nextActions = tasks.length ? tasks.map((t) => t.action).slice(0, 3) : (tpl?.nextActions ?? ["公式ページで確認"]).slice(0, 3);
      const done = PROJECT_CHECKLIST.filter((c) => p.checklist?.[c.key]).length;
      const deadlineNear = (match.top?.r.lc.deadlineDays ?? 999) <= 14;
      const rank = orderedRisk || preOrderRisk ? 0 : deadlineNear ? 1 : tasks.length ? 2 : 3;
      return { p, match, tasks, preOrderRisk, orderedRisk, headline, topTaskKey: tasks[0]?.taskKey ?? null, tone, nextActions, done, rank };
    }).sort((a, b) => a.rank - b.rank);
  }, [projects, items]);

  const counts = useMemo(() => {
    let preOrder = 0, todo = 0, usable = 0, missed = 0, next = 0;
    for (const r of rows) {
      if (r.preOrderRisk) preOrder++;
      todo += projectTasks(r.p, r.match).length;
      if ((r.match.grouped.get("usable")?.length ?? 0) > 0) usable++;
      if (r.match.missRisk === "高" || (r.match.grouped.get("missed")?.length ?? 0) > 0) missed++;
      if ((r.match.grouped.get("next_time")?.length ?? 0) > 0) next++;
    }
    return { preOrder, todo, usable, missed, next };
  }, [rows]);

  const anyOrdered = rows.some((r) => r.orderedRisk);
  const todayRows = rows.filter((r) => r.rank <= 2).slice(0, 5);

  // ---- 空状態：テンプレート入口 ----
  if (loaded && projects.length === 0) {
    return (
      <div>
        <Title />
        <div className="rounded-xl border bg-white p-6">
          <p className="mb-1 text-base font-semibold text-ink">まだ支出案件がありません</p>
          <p className="mb-3 text-sm text-gray-500">まずは、何にお金を使いたいか選んでください。</p>
          <p className="mb-2 text-xs font-medium text-gray-600">おすすめテンプレート</p>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {PROJECT_TEMPLATES.slice(0, 6).map((t) => (
              <Link key={t.key} href={`/projects/new?template=${t.key}`} className="rounded-lg border p-3 text-left text-sm transition hover:border-accent hover:shadow-sm">
                <div className="font-medium text-ink">{t.label}</div>
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/projects/new" className="rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">テンプレートから作る</Link>
            <Link href="/search" className="rounded-md border px-5 py-2.5 text-sm text-gray-700 hover:bg-gray-50">相談して作る</Link>
          </div>
        </div>
        <FooterLinks />
      </div>
    );
  }

  return (
    <div>
      {/* 1. 重要アラート（発注前確認） */}
      {anyOrdered ? (
        <div className="mb-4 rounded-lg border-2 border-red-300 bg-red-50 p-4 text-sm text-red-800">
          <span className="font-bold">⚠ 発注済みの案件があります。</span> 今回の経費は補助対象外になる可能性があります。別の経費・次回公募で使えないか確認しましょう。
        </div>
      ) : (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <span className="font-semibold">重要：</span>補助金を使う可能性がある支出は、<strong>契約・発注・支払い前</strong>に確認してください。
        </div>
      )}

      {/* 2. タイトル */}
      <Title />

      {/* 3. サマリーカード */}
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard n={counts.preOrder} label="発注前確認が必要" tone="red" href="/projects" />
        <SummaryCard n={counts.todo} label="今日やること" tone="blue" href="/projects" />
        <SummaryCard n={counts.usable} label="使える可能性が高い" tone="green" href="/projects" />
        <SummaryCard n={counts.missed} label="見逃し注意" tone="orange" href="/projects" />
        <SummaryCard n={counts.next} label="次回狙い" tone="purple" href="/projects" />
      </div>

      {/* 4. 今日やること */}
      <div className="mb-6">
        <h2 className="mb-2 text-base font-bold text-ink">📋 今日やること</h2>
        {todayRows.length === 0 ? (
          <p className="rounded-lg border bg-white p-4 text-sm text-gray-500">いまの案件でやることはありません。新しい支出案件を作って確認しましょう。</p>
        ) : (
          <ol className="space-y-2">
            {todayRows.map((r, i) => (
              <li key={r.p.id}>
                <Link href={`/projects/${r.p.id}${r.topTaskKey ? `?task=${r.topTaskKey}` : ""}`} className="flex items-start gap-3 rounded-xl border-l-4 bg-white p-3 transition hover:shadow-sm"
                  style={{ borderLeftColor: r.tone === "red" ? "#ef4444" : r.tone === "amber" ? "#f59e0b" : r.tone === "green" ? "#22c55e" : "#3b82f6" }}>
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-ink">{r.p.name || "支出案件"}</span>
                    <span className={`block text-sm font-semibold ${r.tone === "red" ? "text-red-600" : r.tone === "amber" ? "text-amber-700" : r.tone === "green" ? "text-green-700" : "text-blue-700"}`}>{r.headline}</span>
                    <span className="mt-0.5 block text-xs text-gray-500">次にやること：{r.nextActions.join(" → ")}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* 5. メインCTA */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <Link href="/projects/new" className="rounded-xl bg-accent px-5 py-4 text-center text-base font-semibold text-white hover:opacity-90">＋ 支出案件を作る</Link>
        <Link href="/search" className="rounded-xl border-2 border-accent px-5 py-4 text-center text-base font-semibold text-accent hover:bg-accent/5">💬 相談して探す</Link>
      </div>

      {/* 6. 進行中の支出案件 */}
      {rows.length > 0 && (
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-base font-bold text-ink">進行中の支出案件</h2>
            <Link href="/projects" className="text-xs text-accent hover:underline">すべて見る →</Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {rows.slice(0, 3).map((r) => (
              <Link key={r.p.id} href={`/projects/${r.p.id}`} className="rounded-lg border bg-white p-3 transition hover:border-accent">
                <div className="truncate text-sm font-semibold text-ink">{r.p.name || "支出案件"}</div>
                <div className="mt-0.5 truncate text-xs text-gray-500">{r.p.location || r.p.store || ""}{r.match.total > 0 ? `／候補 ${r.match.total}件` : ""}</div>
                <div className={`mt-1 text-xs font-medium ${r.tone === "red" ? "text-red-600" : r.tone === "amber" ? "text-amber-700" : r.tone === "green" ? "text-green-700" : "text-blue-700"}`}>{r.headline}</div>
                <div className="mt-1 text-[11px] text-gray-500">申請準備：{r.done}/{PROJECT_CHECKLIST.length} 完了{r.tasks[0] ? `　次：${r.tasks[0].action}` : ""}</div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <FooterLinks />
    </div>
  );
}

function Title() {
  return (
    <div className="mb-5">
      <h1 className="text-xl font-bold text-ink sm:text-2xl">あなたの補助金チェック</h1>
      <p className="mt-1 text-sm leading-relaxed text-gray-600">
        補助金を使える可能性がある支出は、契約・発注・支払い前に確認しましょう。まずは今日やることから確認してください。
      </p>
    </div>
  );
}

function SummaryCard({ n, label, tone, href }: { n: number; label: string; tone: string; href: string }) {
  const map: Record<string, string> = {
    red: "border-red-200 bg-red-50 text-red-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    green: "border-green-200 bg-green-50 text-green-700",
    orange: "border-orange-200 bg-orange-50 text-orange-700",
    purple: "border-violet-200 bg-violet-50 text-violet-700",
  };
  return (
    <Link href={href} className={`rounded-lg border p-3 text-center transition hover:shadow-sm ${map[tone]}`}>
      <div className="text-2xl font-bold">{n}</div>
      <div className="mt-0.5 text-[11px] font-medium text-gray-600">{label}</div>
    </Link>
  );
}

function FooterLinks() {
  return (
    <div className="mt-8 border-t pt-4">
      <p className="mb-2 text-xs text-gray-400">補助金そのものを見る</p>
      <div className="flex flex-wrap gap-2 text-xs">
        <Link href="/calendar" className="rounded-md border px-3 py-1.5 text-gray-600 hover:bg-gray-50">🗓 締切カレンダー</Link>
        <Link href="/new-and-standard" className="rounded-md border px-3 py-1.5 text-gray-600 hover:bg-gray-50">🆕 新着・定番</Link>
        <Link href="/discovery" className="rounded-md border px-3 py-1.5 text-gray-600 hover:bg-gray-50">🛠 管理者画面</Link>
      </div>
    </div>
  );
}
