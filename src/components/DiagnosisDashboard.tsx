"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchDiscoveredItems, fetchProfiles } from "@/lib/supabase";
import type { DiscoveredItem, BusinessProfile } from "@/lib/types";
import { scoreDiscoveredAgainstProfiles } from "@/lib/discovery";
import { isSampleDiscovered } from "@/lib/sampleFilter";
import { lifecycle, priority, extractStartDate, type Priority } from "@/lib/lifecycle";

type Rank = Priority["rank"];

export function DiagnosisDashboard() {
  const [items, setItems] = useState<DiscoveredItem[]>([]);
  const [profiles, setProfiles] = useState<BusinessProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    Promise.all([fetchDiscoveredItems(), fetchProfiles()])
      .then(([it, p]) => { setItems(it); setProfiles(p); })
      .catch(() => setUnavailable(true))
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const active = items.filter(
      (i) => !isSampleDiscovered(i) && i.status !== "rejected" && i.status !== "ignored" && i.status !== "imported" && i.review_state !== "not_needed"
    );
    const rankCount: Record<Rank, number> = { S: 0, A: 0, B: 0, C: 0, D: 0 };
    const regionCount = new Map<string, number>();
    let worthCount = 0;
    for (const i of active) {
      const sc = scoreDiscoveredAgainstProfiles(i, profiles);
      const score = i.match_score ?? sc.bestScore;
      const start = extractStartDate(i.raw_text);
      const lc = lifecycle(start, i.extracted_deadline ?? sc.deadline);
      const pr = priority(score, lc.key);
      rankCount[pr.rank]++;
      if (pr.rank === "S" || pr.rank === "A" || pr.rank === "B") worthCount++;
      const region = sc.regions[0] || "地域指定なし";
      regionCount.set(region, (regionCount.get(region) ?? 0) + 1);
    }
    const regions = [...regionCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    return { total: active.length, worthCount, rankCount, regions };
  }, [items, profiles]);

  if (loading || unavailable || stats.total === 0) return null;

  const rankRows: { rank: Rank; label: string; color: string }[] = [
    { rank: "S", label: "S 最優先", color: "bg-rose-500" },
    { rank: "A", label: "A 確認価値大", color: "bg-green-500" },
    { rank: "B", label: "B 条件次第", color: "bg-amber-500" },
    { rank: "C", label: "C 参考", color: "bg-slate-400" },
    { rank: "D", label: "D 低め", color: "bg-gray-300" },
  ];
  const rankMax = Math.max(1, ...rankRows.map((r) => stats.rankCount[r.rank]));
  const regionMax = Math.max(1, ...stats.regions.map((r) => r[1]));

  return (
    <div className="mb-6 rounded-xl border bg-white p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs text-gray-500">あなたの事業情報から見ると</p>
          <p className="text-ink">
            <span className="text-3xl font-bold text-accent">{stats.worthCount}</span>
            <span className="ml-1 text-sm font-semibold">件の制度を確認する価値があります</span>
          </p>
          <p className="mt-0.5 text-xs text-gray-400">（全候補 {stats.total} 件のうち、合いそう度が高い順）</p>
        </div>
        <Link href="/discovery/items?view=high" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">候補を見る →</Link>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {/* 優先度の内訳 */}
        <div>
          <p className="mb-2 text-xs font-semibold text-gray-600">優先度の内訳</p>
          <div className="space-y-1.5">
            {rankRows.map((r) => {
              const n = stats.rankCount[r.rank];
              return (
                <div key={r.rank} className="flex items-center gap-2 text-xs">
                  <span className="w-20 shrink-0 text-gray-500">{r.label}</span>
                  <div className="h-4 flex-1 overflow-hidden rounded bg-gray-100">
                    <div className={`h-full ${r.color}`} style={{ width: `${(n / rankMax) * 100}%` }} />
                  </div>
                  <span className="w-6 shrink-0 text-right font-semibold text-ink">{n}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 地域の内訳 */}
        <div>
          <p className="mb-2 text-xs font-semibold text-gray-600">地域の内訳</p>
          {stats.regions.length === 0 ? (
            <p className="text-xs text-gray-400">地域情報のある候補がまだありません。</p>
          ) : (
            <div className="space-y-1.5">
              {stats.regions.map(([name, n]) => (
                <div key={name} className="flex items-center gap-2 text-xs">
                  <span className="w-24 shrink-0 truncate text-gray-500" title={name}>📍{name}</span>
                  <div className="h-4 flex-1 overflow-hidden rounded bg-gray-100">
                    <div className="h-full bg-sky-400" style={{ width: `${(n / regionMax) * 100}%` }} />
                  </div>
                  <span className="w-6 shrink-0 text-right font-semibold text-ink">{n}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
