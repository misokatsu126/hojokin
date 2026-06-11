"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchDiscoveredItems, fetchProfiles } from "@/lib/supabase";
import type { DiscoveredItem, BusinessProfile } from "@/lib/types";
import { isSampleDiscovered } from "@/lib/sampleFilter";
import { triageDiscovered, TRIAGE_META, STANDARD_SUBSIDIES, JGRANTS_PORTAL_URL } from "@/lib/triage";
import { loadProjects, type SpendingProject } from "@/lib/projects";
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

  // 定番補助金に「関係しそうな案件」を紐づける（タグが案件名・用途・メモに含まれるか）
  function relatedProjects(tags: string[]): SpendingProject[] {
    return projects.filter((p) => {
      const text = `${p.name} ${p.purpose} ${p.uses.join(" ")} ${p.industry} ${p.memo}`;
      return tags.some((t) => text.includes(t));
    });
  }

  // 直近14日以内に検知/取得した候補（新着・更新）
  const recent = useMemo(() => {
    const within = (iso: string | null | undefined) => {
      const d = daysUntil(iso ?? null);
      return d != null && d <= 0 && d >= -14;
    };
    return items
      .filter((i) => !isSampleDiscovered(i) && i.status !== "rejected" && i.status !== "ignored")
      .filter((i) => within(i.fetched_at) || within(i.detected_at))
      .map((i) => ({ i, r: triageDiscovered(i, profiles), when: i.fetched_at ?? i.detected_at }))
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
            {recent.map(({ i, r, when }) => (
              <div key={i.id} className="flex flex-col gap-2 rounded-lg border bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${TRIAGE_META[r.key].chip}`}>{TRIAGE_META[r.key].icon} {TRIAGE_META[r.key].label}</span>
                    {r.officialConfirmed ? <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">公式確認済み</span> : <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">公式未確認</span>}
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

      {/* 一般的によく使われる定番 */}
      <section>
        <h2 className="mb-1 text-base font-bold text-ink">📌 一般的によく使われる補助金（定番）</h2>
        <p className="mb-2 text-xs text-gray-500">あなた向け判定とは別に、多くの中小企業・小規模事業者が確認する価値のある制度です（一般確認推奨）。</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {STANDARD_SUBSIDIES.map((s) => {
            const rel = relatedProjects(s.tags);
            return (
              <div key={s.name} className="rounded-lg border bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-ink">{s.name}</div>
                    <div className="truncate text-xs text-gray-500">{s.use}</div>
                  </div>
                  <a href={JGRANTS_PORTAL_URL} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-md border px-3 py-1.5 text-xs text-emerald-700 hover:bg-gray-50">公式ポータルで探す ↗</a>
                </div>
                {rel.length > 0 && (
                  <div className="mt-2 rounded-md bg-sky-50 p-2 text-[11px] text-sky-900">
                    <span className="font-medium">関係しそうな案件：</span>
                    {rel.slice(0, 2).map((p, i) => (
                      <span key={p.id}>{i > 0 ? "、" : ""}<Link href={`/projects/${p.id}`} className="underline">{p.name}</Link></span>
                    ))}
                    <div className="mt-0.5 text-sky-700">確認理由：{s.reason}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
