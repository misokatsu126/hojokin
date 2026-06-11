"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchDiscoveredItems, fetchProfiles, fetchGrants } from "@/lib/supabase";
import type { DiscoveredItem, BusinessProfile, Grant } from "@/lib/types";
import { scoreDiscoveredAgainstProfiles } from "@/lib/discovery";
import { isSampleDiscovered, isSampleGrant } from "@/lib/sampleFilter";
import { daysUntil, formatDate } from "@/lib/utils";

type Bar = {
  id: string;
  title: string;
  days: number;
  deadline: string;
  url: string | null;
  score: number;
};

// 締切までの日数で色を決める（赤=急ぎ → 緑=余裕）
function urgencyColor(days: number): { bar: string; dot: string; label: string } {
  if (days <= 7) return { bar: "bg-red-500", dot: "🔴", label: "かなり急ぎ" };
  if (days <= 14) return { bar: "bg-orange-500", dot: "🟠", label: "急ぎ" };
  if (days <= 30) return { bar: "bg-amber-400", dot: "🟡", label: "今月中に確認" };
  return { bar: "bg-green-500", dot: "🟢", label: "まだ余裕" };
}

const HORIZON = 120; // 表示する締切の上限（日）

export function DeadlineTimeline() {
  const [items, setItems] = useState<DiscoveredItem[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [profiles, setProfiles] = useState<BusinessProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    Promise.all([fetchDiscoveredItems(), fetchGrants(), fetchProfiles()])
      .then(([it, g, p]) => { setItems(it); setGrants(g); setProfiles(p); })
      .catch(() => setUnavailable(true))
      .finally(() => setLoading(false));
  }, []);

  const bars: Bar[] = useMemo(() => {
    const out: Bar[] = [];
    // 自動収集の候補（推定締切）
    for (const i of items) {
      if (isSampleDiscovered(i)) continue;
      if (i.status === "rejected" || i.status === "ignored" || i.review_state === "not_needed") continue;
      const sc = scoreDiscoveredAgainstProfiles(i, profiles);
      const deadline = i.extracted_deadline ?? sc.deadline;
      const d = daysUntil(deadline);
      if (d == null || d < 0 || d > HORIZON) continue;
      out.push({ id: `d-${i.id}`, title: i.title ?? "（無題）", days: d, deadline: deadline!, url: i.official_url ?? i.url, score: i.match_score ?? sc.bestScore });
    }
    // 登録済み補助金
    for (const g of grants) {
      if (isSampleGrant(g)) continue;
      const d = daysUntil(g.application_deadline);
      if (d == null || d < 0 || d > HORIZON) continue;
      out.push({ id: `g-${g.id}`, title: g.name, days: d, deadline: g.application_deadline!, url: g.official_url, score: 0 });
    }
    return out.sort((a, b) => a.days - b.days).slice(0, 12);
  }, [items, grants, profiles]);

  if (loading || unavailable) return null;

  return (
    <div className="mt-8">
      <h2 className="mb-1 text-base font-bold text-ink">締切タイムライン</h2>
      <p className="mb-3 text-xs text-gray-500">締切が近い順に並べています。色が赤いほど急ぎです（今日〜{HORIZON}日先まで）。</p>
      {bars.length === 0 ? (
        <div className="rounded-lg border bg-white p-5 text-sm text-gray-500">
          締切が分かっている制度がまだありません。候補が集まると、ここに締切順で並びます。
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/discovery/sources" className="rounded-md bg-accent px-4 py-2 text-xs font-medium text-white hover:opacity-90">新しい制度を探す</Link>
            <Link href="/calendar" className="rounded-md border px-4 py-2 text-xs text-gray-700 hover:bg-gray-50">カレンダーで見る</Link>
          </div>
        </div>
      ) : (
        <div className="space-y-2 rounded-lg border bg-white p-4">
          {bars.map((b) => {
            const u = urgencyColor(b.days);
            const width = Math.max(6, Math.round((b.days / HORIZON) * 100)); // 締切が遠いほど長いバー
            return (
              <div key={b.id} className="flex items-center gap-2">
                <div className="flex w-40 shrink-0 items-center gap-1 sm:w-56">
                  <span aria-hidden>{u.dot}</span>
                  <span className="truncate text-xs font-medium text-ink" title={b.title}>{b.title}</span>
                </div>
                <div className="relative h-5 flex-1 overflow-hidden rounded bg-gray-100">
                  <div className={`h-full ${u.bar}`} style={{ width: `${width}%` }} />
                </div>
                <span className={`w-16 shrink-0 text-right text-xs font-semibold ${b.days <= 7 ? "text-red-600" : "text-gray-600"}`}>あと{b.days}日</span>
                {b.url ? (
                  <a href={b.url} target="_blank" rel="noopener noreferrer" className="hidden shrink-0 text-xs text-emerald-700 hover:underline sm:inline" title={`締切 ${formatDate(b.deadline)}`}>公式 ↗</a>
                ) : (
                  <span className="hidden w-8 shrink-0 sm:inline" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
