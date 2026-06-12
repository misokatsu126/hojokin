"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchDiscoveredItems, fetchProfiles } from "@/lib/supabase";
import type { DiscoveredItem, BusinessProfile } from "@/lib/types";
import { isSampleDiscovered } from "@/lib/sampleFilter";
import { triageDiscovered, TRIAGE_META } from "@/lib/triage";
import { verifyItem } from "@/lib/verify";
import { loadProjects, type SpendingProject } from "@/lib/projects";
import { CORE_PROGRAM_MASTER, getCoreProgramChecks, coreFreshness, OFFICIAL_STATUS_LABEL, OFFICIAL_STATUS_TONE, type CoreGroup } from "@/lib/coreMaster";
import { formatDate, daysUntil } from "@/lib/utils";

function sourceLabel(s: string | null | undefined): string {
  switch (s) {
    case "jnet21": return "J-Net21";
    case "jgrants": return "Jグランツ";
    case "mirasapo": return "ミラサポplus";
    case "official_url_import": return "URL取り込み";
    case "crawl": return "公式巡回";
    case "feed": return "フィード";
    default: return s ?? "—";
  }
}

export default function NewAndStandardPage() {
  const [items, setItems] = useState<DiscoveredItem[]>([]);
  const [profiles, setProfiles] = useState<BusinessProfile[]>([]);
  const [projects, setProjects] = useState<SpendingProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setProjects(loadProjects());
    Promise.all([fetchDiscoveredItems(), fetchProfiles()])
      .then(([it, p]) => { setItems(it); setProfiles(p); })
      .catch((e) => setError(e.message ?? "読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  // 案件横断で「まず見る定番制度」を集計（key → 関係する案件）
  const coreByProject = useMemo(() => {
    const map = new Map<string, { name: string; confidence: string; projects: SpendingProject[] }>();
    for (const p of projects) {
      for (const c of getCoreProgramChecks(p)) {
        const e = map.get(c.key) ?? { name: c.name, confidence: c.confidenceLabel, projects: [] };
        e.projects.push(p);
        map.set(c.key, e);
      }
    }
    return [...map.values()].sort((a, b) => b.projects.length - a.projects.length);
  }, [projects]);

  // 直近14日以内に検知/取得した候補（新着・更新）
  const recent = useMemo(() => {
    const within = (iso: string | null | undefined) => {
      const d = daysUntil(iso ?? null);
      return d != null && d <= 0 && d >= -14;
    };
    return items
      .filter((i) => !isSampleDiscovered(i) && i.status !== "rejected" && i.status !== "ignored")
      .filter((i) => within(i.fetched_at) || within(i.detected_at))
      .map((i) => ({ i, r: triageDiscovered(i, profiles), v: verifyItem(i), when: i.fetched_at ?? i.detected_at }))
      // ノイズ（採択結果・議会・入札・ニュース等）と制度外の参考情報は新着にも出さない
      .filter(({ v }) => v.state !== "rejected_noise" && v.state !== "reference_only")
      .sort((a, b) => new Date(b.when ?? 0).getTime() - new Date(a.when ?? 0).getTime())
      .slice(0, 20);
  }, [items, profiles]);

  if (loading) return <p className="py-12 text-center text-gray-400">読み込み中…</p>;

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-ink">新着・定番</h1>
      <p className="mb-5 text-sm text-gray-500">新しく見つかった制度と、多くの中小企業が確認する定番制度をまとめています。</p>

      {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {/* 新着・更新 */}
      <section className="mb-8">
        <h2 className="mb-2 text-base font-bold text-ink">🆕 新着・更新された補助金</h2>
        {recent.length === 0 ? (
          <div className="rounded-lg border bg-white p-5 text-sm text-gray-500">
            最近見つかった制度はまだありません。
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/discovery/sources" className="rounded-md bg-accent px-4 py-2 text-xs font-medium text-white hover:opacity-90">新しい制度を探す</Link>
              <Link href="/search" className="rounded-md border px-4 py-2 text-xs text-gray-700 hover:bg-gray-50">相談して探す</Link>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {recent.map(({ i, r, v, when }) => (
              <div key={i.id} className="flex flex-col gap-2 rounded-lg border bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${TRIAGE_META[r.key].chip}`}>{TRIAGE_META[r.key].icon} {TRIAGE_META[r.key].label}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${v.tone}`}>{v.label}</span>
                    {r.score > 0 && <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-800">合いそう {r.score}</span>}
                  </div>
                  <div className="mt-0.5 truncate text-sm font-semibold text-ink">{i.title}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-500">
                    <span>出典：{sourceLabel(i.external_source)}</span>
                    {when && <span>更新：{formatDate(when)}</span>}
                    {r.deadline && <span>締切：{formatDate(r.deadline)}</span>}
                  </div>
                  {r.score === 0 && <p className="mt-0.5 text-[11px] text-gray-400">新着のため、まだ詳しい判定ができていません。一般的に確認する価値があります。</p>}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {(i.official_url || i.url) && <a href={i.official_url ?? i.url ?? "#"} target="_blank" rel="noopener noreferrer" className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">🔗 公式ページを見る ↗</a>}
                  <Link href="/discovery/items" className="rounded-md border px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">詳細を見る</Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 1. あなたの案件でまず見る定番制度 */}
      {coreByProject.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-base font-bold text-ink">⭐ あなたの案件でまず見る定番制度</h2>
          <div className="space-y-2">
            {coreByProject.slice(0, 8).map((e) => (
              <div key={e.name} className="rounded-lg border bg-white p-3 text-sm">
                <span className="font-semibold text-ink">{e.name}</span>
                <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-[10px] text-green-800">{e.confidence}</span>
                <span className="ml-2 text-xs text-gray-500">関係する案件：{e.projects.slice(0, 3).map((p) => p.name || "支出案件").join("、")}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 2〜4. 制度マスター（国／厚労省系／自治体パターン） */}
      <MasterGroup group="national_subsidy" title="🏛 国の定番補助金" />
      <MasterGroup group="labor_grant" title="👥 厚労省系の助成金" />
      <MasterGroup group="local_pattern" title="📍 自治体で探すべき定番パターン" />

      <p className="mt-6 text-[11px] leading-relaxed text-gray-400">
        ※ 定番制度は「使える」と断定するものではありません。条件が合えば使える可能性があります。対象になるかは公式要領で確認し、発注前に確認してください。年度・名称は変わることがあります。
      </p>
    </div>
  );
}

const GROUP_NOTE: Record<CoreGroup, string> = {
  national_subsidy: "中小企業・小規模事業者がまず確認する国の定番です。",
  labor_grant: "採用・賃上げ・研修に関わる厚労省系の助成金です。",
  local_pattern: "地域ごとに探すべき定番パターンです。自治体名で検索して確認します。",
};

function MasterGroup({ group, title }: { group: CoreGroup; title: string }) {
  const items = CORE_PROGRAM_MASTER.filter((m) => m.group === group);
  return (
    <section className="mb-6">
      <h2 className="mb-1 text-base font-bold text-ink">{title}</h2>
      <p className="mb-2 text-xs text-gray-500">{GROUP_NOTE[group]}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((m) => {
          const href = m.officialUrl ?? (m.officialSearchQuery ? `https://www.google.com/search?q=${encodeURIComponent(m.officialSearchQuery.replace("{region}", "お住まいの自治体"))}` : "https://www.jgrants-portal.go.jp/");
          const fresh = coreFreshness(m);
          return (
            <div key={m.key} className="rounded-lg border bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink">{m.name}</div>
                  <div className="mt-0.5 text-xs text-gray-500">{m.relatedReason}</div>
                </div>
                <span className="shrink-0 rounded bg-green-100 px-1.5 py-0.5 text-[10px] text-green-800">{m.confidenceLabel}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px]">
                <span className={`rounded px-1.5 py-0.5 ${OFFICIAL_STATUS_TONE[m.officialStatus]}`}>{OFFICIAL_STATUS_LABEL[m.officialStatus]}</span>
                {m.fiscalYear && m.fiscalYear !== "—" && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{m.fiscalYear}年度想定</span>}
                {m.applicationRound && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{m.applicationRound}</span>}
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">締切：{m.deadline ?? "公式要領で確認"}</span>
                <span className="text-gray-400">最終確認 {fresh.asOf}</span>
              </div>
              {fresh.stale && <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-[10px] text-amber-800">⚠ {fresh.note}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                <a href={href} target="_blank" rel="noopener noreferrer" className="inline-block rounded-md border px-3 py-1.5 text-xs text-emerald-700 hover:bg-gray-50">{m.officialUrl ? "公式ページを見る ↗" : "公式情報を探す ↗"}</a>
                {m.guidelineUrl && <a href={m.guidelineUrl} target="_blank" rel="noopener noreferrer" className="inline-block rounded-md border border-emerald-300 px-3 py-1.5 text-xs text-emerald-700 hover:bg-emerald-50">📄 公募要領 ↗</a>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
