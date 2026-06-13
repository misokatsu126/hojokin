"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchDiscoveredItems } from "@/lib/supabase";
import type { DiscoveredItem, BusinessProfile } from "@/lib/types";
import { isSampleDiscovered } from "@/lib/sampleFilter";
import { triageDiscovered, TRIAGE_META } from "@/lib/triage";
import { verifyItem } from "@/lib/verify";
import { loadProjects, syncProjectsFromSupabase, projectToProfile, type SpendingProject } from "@/lib/projects";
import { formatDate, daysUntil } from "@/lib/utils";

function sourceLabel(s: string | null | undefined): string {
  switch (s) {
    case "jnet21": return "J-Net21"; case "jgrants": return "Jグランツ"; case "mirasapo": return "ミラサポplus";
    case "official_url_import": return "URL取り込み"; case "crawl": return "公式巡回"; case "feed": return "フィード";
    default: return s ?? "—";
  }
}
const whenOf = (i: DiscoveredItem) => i.fetched_at ?? i.detected_at ?? null;
function bucketOf(iso: string | null): "today" | "week" | "month" | "old" {
  const d = daysUntil(iso); // 過去日は負
  if (d == null) return "old";
  if (d >= 0) return "today";      // 当日以降に検知（実質きょう）
  if (d >= -7) return "week";
  if (d >= -30) return "month";
  return "old";
}

export default function NewArrivalsPage() {
  const [items, setItems] = useState<DiscoveredItem[]>([]);
  const [projects, setProjects] = useState<SpendingProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setProjects(loadProjects());
    syncProjectsFromSupabase().then(setProjects).catch(() => {});
    fetchDiscoveredItems().then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  }, []);

  const profiles: BusinessProfile[] = useMemo(() => projects.map(projectToProfile), [projects]);

  // 直近30日の新着（ノイズ・参考情報・終了は除外）。案件への関連度も判定。
  const rows = useMemo(() => {
    return items
      .filter((i) => !isSampleDiscovered(i) && i.status !== "rejected" && i.status !== "ignored" && i.status !== "imported")
      .map((i) => {
        const r = triageDiscovered(i, profiles);
        const v = verifyItem(i);
        return { i, r, v, when: whenOf(i), bucket: bucketOf(whenOf(i)), relevant: profiles.length > 0 && r.score > 0 };
      })
      .filter(({ v, bucket }) => v.state !== "rejected_noise" && v.state !== "reference_only" && bucket !== "old")
      .sort((a, b) => new Date(b.when ?? 0).getTime() - new Date(a.when ?? 0).getTime());
  }, [items, profiles]);

  const relevant = rows.filter((x) => x.relevant);
  const groups: { key: "today" | "week" | "month"; title: string }[] = [
    { key: "today", title: "本日" }, { key: "week", title: "今週（直近7日）" }, { key: "month", title: "直近30日" },
  ];

  if (loading) return <p className="py-12 text-center text-gray-400">読み込み中…</p>;

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-ink">🆕 新着の補助金</h1>
      <p className="mb-4 text-sm leading-relaxed text-gray-600">
        自動収集で新しく見つかった補助金です。<strong>補助金は「支出から確認する」のが基本</strong>です。気になる制度は、支出案件を作って発注前の注意や使える可能性を確認しましょう。
      </p>

      {rows.length === 0 ? (
        <div className="rounded-xl border bg-white p-8 text-center text-gray-500">
          <p>直近の新着はまだありません。</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Link href="/discovery/sources" className="rounded-md bg-accent px-4 py-2 text-xs font-medium text-white hover:opacity-90">情報源と収集（管理者）</Link>
            <Link href="/projects/new" className="rounded-md border px-4 py-2 text-xs text-gray-700 hover:bg-gray-50">支出から確認する</Link>
          </div>
        </div>
      ) : (
        <>
          {relevant.length > 0 && (
            <section className="mb-6">
              <h2 className="mb-2 text-base font-bold text-ink">🎯 あなたの支出に関係しそうな新着（{relevant.length}）</h2>
              <div className="space-y-2">{relevant.slice(0, 10).map((x) => <NewRow key={`r-${x.i.id}`} {...x} />)}</div>
            </section>
          )}
          {groups.map((g) => {
            const list = rows.filter((x) => x.bucket === g.key);
            if (list.length === 0) return null;
            return (
              <section key={g.key} className="mb-6">
                <h2 className="mb-2 text-base font-bold text-ink">{g.title}（{list.length}）</h2>
                <div className="space-y-2">{list.slice(0, 30).map((x) => <NewRow key={`${g.key}-${x.i.id}`} {...x} />)}</div>
              </section>
            );
          })}
        </>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-gray-400">
        ※ 出典・取得日を表示しています。内容・締切・対象は変わることがあります。最終確認は必ず公式要領・窓口で行ってください。「使える」「採択される」を保証するものではありません。
      </p>
    </div>
  );
}

function NewRow({ i, r, v, when, relevant }: { i: DiscoveredItem; r: ReturnType<typeof triageDiscovered>; v: ReturnType<typeof verifyItem>; when: string | null; relevant: boolean }) {
  const dd = daysUntil(r.deadline);
  return (
    <div className={`rounded-lg border bg-white p-3 ${relevant ? "border-accent/40" : ""}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${TRIAGE_META[r.key].chip}`}>{TRIAGE_META[r.key].icon} {TRIAGE_META[r.key].label}</span>
        <span className={`rounded px-1.5 py-0.5 text-[10px] ${v.tone}`}>{v.label}</span>
        {relevant && <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">あなたの案件に関係しそう</span>}
      </div>
      <div className="mt-0.5 truncate text-sm font-semibold text-ink">{i.title}</div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-500">
        <span>出典：{sourceLabel(i.external_source)}</span>
        {when && <span>取得：{formatDate(when)}</span>}
        {r.deadline && <span className={dd != null && dd <= 14 ? "text-red-600" : ""}>締切：{formatDate(r.deadline)}{dd != null && dd >= 0 ? `（あと${dd}日）` : ""}</span>}
        <span className="text-gray-400">最新は公式で確認</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {(i.official_url || i.url) && <a href={i.official_url ?? i.url ?? "#"} target="_blank" rel="noopener noreferrer" className="rounded-md bg-emerald-600 px-3 py-1.5 font-medium text-white hover:opacity-90">🔗 公式ページを見る ↗</a>}
        <Link href="/projects/new" className="rounded-md border px-3 py-1.5 text-gray-700 hover:bg-gray-50">支出案件で確認する</Link>
      </div>
    </div>
  );
}
