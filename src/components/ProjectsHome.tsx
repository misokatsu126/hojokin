"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchDiscoveredItems } from "@/lib/supabase";
import type { DiscoveredItem } from "@/lib/types";
import {
  loadProjects, classifyForProject, orderAdvice, URGENCY_LABEL, PROJECT_TEMPLATES,
  type SpendingProject,
} from "@/lib/projects";
import { TRIAGE_META } from "@/lib/triage";
import { formatAmount } from "@/lib/utils";

export function ProjectsHome({ heading = "今ある支出案件", showIntro = true }: { heading?: string; showIntro?: boolean }) {
  const [projects, setProjects] = useState<SpendingProject[]>([]);
  const [items, setItems] = useState<DiscoveredItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setProjects(loadProjects());
    const onChange = () => setProjects(loadProjects());
    window.addEventListener("projects-changed", onChange);
    fetchDiscoveredItems().then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
    return () => window.removeEventListener("projects-changed", onChange);
  }, []);

  if (loading && projects.length === 0) {
    // 初回ロード中でも案件が無ければオンボーディングを出す（補助金取得待ちで止めない）
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-ink sm:text-2xl">{heading}</h1>
        <Link href="/projects/new" className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90">＋ 支出案件を追加</Link>
      </div>
      {showIntro && (
        <p className="mb-4 text-sm leading-relaxed text-gray-600">
          「何にお金を使いたいか」を登録すると、その支出に使える可能性がある補助金を判定します。
          発注してよいか・今やることも案件ごとに分かります。
        </p>
      )}

      {projects.length === 0 ? (
        <div className="rounded-xl border bg-white p-6">
          <p className="mb-1 text-base font-semibold text-ink">まだ支出案件がありません</p>
          <p className="mb-3 text-sm text-gray-500">まずは「何にお金を使いたいか」から選んでください。登録すると、使える補助金・発注してよいか・次にやることを整理します。</p>
          <p className="mb-2 text-xs font-medium text-gray-600">おすすめテンプレート</p>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {PROJECT_TEMPLATES.slice(0, 6).map((t) => (
              <Link key={t.key} href={`/projects/new?template=${t.key}`} className="rounded-lg border p-3 text-left text-sm transition hover:border-accent hover:shadow-sm">
                <div className="font-medium text-ink">{t.label}</div>
                <div className="mt-0.5 text-[11px] text-gray-400">{t.categories.slice(0, 2).join("・")}</div>
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/projects/new" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">テンプレートから作る</Link>
            <Link href="/search" className="rounded-md border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">相談して作る</Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} items={items} loading={loading} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({ project, items, loading }: { project: SpendingProject; items: DiscoveredItem[]; loading: boolean }) {
  const match = useMemo(() => classifyForProject(project, items), [project, items]);
  const top = match.top;
  const adv = orderAdvice(project.orderStatus);
  const meta = top ? TRIAGE_META[top.r.key] : null;
  const next = top?.r.nextActions ?? ["公式の公募要領を確認する", "対象経費を確認する"];

  return (
    <Link href={`/projects/${project.id}`} className="block rounded-xl border bg-white p-4 transition hover:border-accent hover:shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-ink">{project.name || "（名称未設定の案件）"}</h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-500">
            {project.store && <span>🏬{project.store}</span>}
            {project.location && <span>📍{project.location}</span>}
            {project.budget != null && <span>💰{formatAmount(project.budget)}</span>}
            {project.schedule && <span>🗓{project.schedule}</span>}
            <span className={`rounded px-1.5 py-0.5 ${project.urgency === "high" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"}`}>{URGENCY_LABEL[project.urgency]}</span>
          </div>
        </div>
        <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] ${adv.wait ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
          {adv.wait ? "発注前：申請の可能性あり" : "発注後：対象外の可能性"}
        </span>
      </div>

      {/* 判定 */}
      <div className="mt-2 rounded-lg bg-slate-50 p-2.5 text-sm">
        {loading ? (
          <p className="text-xs text-gray-400">補助金候補を読み込み中…</p>
        ) : match.total === 0 ? (
          <p className="text-xs text-gray-500">
            まだ候補が見つかっていません。<span className="text-gray-400">情報を増やすか、相談して探すと見つかりやすくなります。</span>
          </p>
        ) : (
          <>
            <p className="font-semibold text-ink">
              判定：{meta ? `${meta.icon} ${meta.label}` : "確認中"}
              <span className="ml-2 text-xs font-normal text-gray-500">候補 {match.total} 件</span>
            </p>
            {top && <p className="mt-0.5 text-xs text-gray-600">最有力候補：{top.item.title}</p>}
            <p className="mt-0.5 text-xs text-orange-700">次にやること：{next.slice(0, 3).join(" → ")}</p>
          </>
        )}
        <p className="mt-1 text-[11px] text-gray-500">見逃しリスク：<span className={match.missRisk === "高" ? "font-semibold text-orange-700" : match.missRisk === "中" ? "text-amber-700" : "text-green-700"}>{match.missRisk}</span></p>
        {!adv.wait && <p className="mt-0.5 text-[11px] text-amber-700">注意：すでに発注済みだと対象外の可能性があります</p>}
      </div>

      <div className="mt-2 text-right text-xs font-medium text-accent">この案件の詳細・補助金候補を見る →</div>
    </Link>
  );
}
