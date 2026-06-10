"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchDiscoveredItems, fetchProfiles } from "@/lib/supabase";
import type { DiscoveredItem, BusinessProfile } from "@/lib/types";
import { scoreDiscoveredAgainstProfiles } from "@/lib/discovery";
import { isSampleDiscovered } from "@/lib/sampleFilter";

function isToday(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}
function timeOf(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}
function sourceLabel(s: string | null | undefined): string {
  switch (s) {
    case "jnet21": return "J-Net21";
    case "jgrants": return "Jグランツ";
    case "mirasapo": return "ミラサポplus";
    case "official_city": return "市区町村公式";
    case "official_prefecture": return "都道府県公式";
    case "official_url_import": return "URL取り込み";
    case "crawl": return "公式巡回";
    case "feed": return "フィード";
    default: return s ?? "—";
  }
}

export function TodayAdded() {
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

  const todays = useMemo(() => {
    return items
      .filter((i) => !isSampleDiscovered(i))
      .filter((i) => i.status !== "rejected" && i.status !== "ignored" && i.review_state !== "not_needed")
      .filter((i) => isToday(i.detected_at) || isToday(i.fetched_at))
      .map((i) => {
        const sc = scoreDiscoveredAgainstProfiles(i, profiles);
        return {
          i,
          score: i.match_score ?? sc.bestScore,
          region: (i.match_profile ? sc.regions : sc.regions)[0] ?? "",
          when: i.fetched_at ?? i.detected_at,
        };
      })
      .sort((a, b) => new Date(b.when ?? 0).getTime() - new Date(a.when ?? 0).getTime());
  }, [items, profiles]);

  if (loading || unavailable) return null;

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-base font-bold text-ink">本日追加された補助金・助成金</h2>
      {todays.length === 0 ? (
        <div className="rounded-lg border bg-white p-5 text-sm text-gray-500">
          <p className="mb-3">本日追加された制度はまだありません。新しい制度を探すか、URLを貼って追加できます。</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/discovery/sources" className="rounded-md bg-accent px-4 py-2 text-xs font-medium text-white hover:opacity-90">新しい制度を探す</Link>
            <Link href="/discovery/import-url" className="rounded-md border px-4 py-2 text-xs text-gray-700 hover:bg-gray-50">URLから追加する</Link>
            <Link href="/search" className="rounded-md border px-4 py-2 text-xs text-gray-700 hover:bg-gray-50">相談して探す</Link>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {todays.slice(0, 12).map(({ i, score, region, when }) => (
            <div key={i.id} className="flex flex-col gap-2 rounded-lg border bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  {score > 0 && <span className="shrink-0 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-800" title="あなたに合いそう度">合 {score}</span>}
                  <span className="truncate text-sm font-semibold text-ink">{i.title}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-500">
                  {region && <span>📍{region}</span>}
                  <span>出典：{sourceLabel(i.external_source)}</span>
                  {timeOf(when) && <span>🕒{timeOf(when)} 取得</span>}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {(i.official_url || i.url) && (
                  <a href={i.official_url ?? i.url ?? "#"} target="_blank" rel="noopener noreferrer" className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">🔗 公式ページを見る ↗</a>
                )}
                <Link href="/discovery/items" className="rounded-md border px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">詳細を見る</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
