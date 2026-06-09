"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchDiscoveredItems, fetchProfiles } from "@/lib/supabase";
import type { DiscoveredItem, BusinessProfile } from "@/lib/types";
import { AUDIENCE_TYPE_LABEL, AUDIENCE_TYPE_COLORS, type AudienceType } from "@/lib/constants";
import { scoreDiscoveredAgainstProfiles, suggestNextActions } from "@/lib/discovery";
import { daysUntil, formatDate } from "@/lib/utils";

type AudienceFilter = "all" | "business" | "individual";
type Scored = {
  i: DiscoveredItem;
  score: number;
  profile: string;
  deadline: string | null;
  regions: string[];
};

function matchAudience(a: AudienceType | null | undefined, f: AudienceFilter): boolean {
  if (f === "all") return true;
  if (!a || a === "both" || a === "unknown") return true;
  return a === f;
}

export function AutoCollectSection() {
  const [items, setItems] = useState<DiscoveredItem[]>([]);
  const [profiles, setProfiles] = useState<BusinessProfile[]>([]);
  const [filter, setFilter] = useState<AudienceFilter>("all");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  async function load() {
    const [it, p] = await Promise.all([fetchDiscoveredItems(), fetchProfiles()]);
    setItems(it);
    setProfiles(p);
  }
  useEffect(() => {
    load()
      .catch(() => setUnavailable(true))
      .finally(() => setLoading(false));
  }, []);

  const scored: Scored[] = useMemo(() => {
    return items
      .filter((i) => matchAudience(i.audience_type, filter) && i.status !== "imported" && i.status !== "rejected")
      .map((i) => {
        const r = scoreDiscoveredAgainstProfiles(i, profiles);
        return {
          i,
          score: i.match_score ?? r.bestScore,
          profile: i.match_profile ?? r.bestProfile,
          deadline: i.extracted_deadline ?? r.deadline,
          regions: r.regions,
        };
      });
  }, [items, profiles, filter]);

  // 実務優先順位：①締切7日以内 ②高相性80+ ③未確認 ④今日新規 ⑤締切30日以内
  const PRIORITY: { rank: number; label: string; tone: string }[] = [
    { rank: 1, label: "締切7日以内", tone: "bg-red-600 text-white" },
    { rank: 2, label: "高相性80点+", tone: "bg-green-600 text-white" },
    { rank: 3, label: "未確認", tone: "bg-sky-600 text-white" },
    { rank: 4, label: "今日新規", tone: "bg-violet-600 text-white" },
    { rank: 5, label: "締切30日以内", tone: "bg-amber-500 text-white" },
  ];
  function rankOf(s: Scored): number {
    const d = daysUntil(s.deadline);
    if (d != null && d >= 0 && d <= 7) return 1;
    if (s.score >= 80) return 2;
    if (s.i.status === "unreviewed") return 3;
    if (daysUntil(s.i.detected_at) === 0) return 4;
    if (d != null && d >= 0 && d <= 30) return 5;
    return 99;
  }
  const prioritized = useMemo(() => {
    return scored
      .map((s) => ({ s, rank: rankOf(s) }))
      .filter((x) => x.rank < 99)
      .sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        const da = daysUntil(a.s.deadline);
        const db = daysUntil(b.s.deadline);
        if ((a.rank === 1 || a.rank === 5) && da != null && db != null) return da - db;
        return b.s.score - a.s.score;
      })
      .slice(0, 15);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scored]);
  const counts = useMemo(() => {
    const c = [0, 0, 0, 0, 0];
    for (const s of scored) {
      const r = rankOf(s);
      if (r < 99) c[r - 1]++;
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scored]);

  // 通知候補（送信はまだ。高相性80+/締切30日以内/新着/人間確認待ち）
  const notify = useMemo(() => {
    const out: { s: Scored; tags: string[] }[] = [];
    for (const s of scored) {
      const tags: string[] = [];
      if (s.score >= 80) tags.push("高相性80+");
      const d = daysUntil(s.deadline);
      if (d != null && d >= 0 && d <= 30) tags.push("締切30日");
      if (daysUntil(s.i.detected_at) === 0) tags.push("新着");
      const rs = s.i.review_state ?? "ai_judged";
      if ((rs === "ai_judged" || rs === "unconfirmed") && s.score >= 70) tags.push("確認待ち");
      if (tags.length) out.push({ s, tags });
    }
    return out.sort((a, b) => b.s.score - a.s.score).slice(0, 8);
  }, [scored]);

  async function runAll() {
    setRunning(true);
    setMsg(null);
    try {
      const r = await fetch("/api/discovery/run", { method: "POST" });
      const d = await r.json();
      setMsg(
        d.ok
          ? `最新情報を取り込みました（新着 ${d.totals?.inserted ?? 0} 件・更新 ${d.totals?.updated ?? 0} 件／自社事業と照合 ${d.matched ?? 0} 件）。`
          : `取り込みに失敗しました。時間をおいて再度お試しください。（${d.error ?? "不明"}）`
      );
      await load();
    } catch {
      setMsg("取り込みに失敗しました。時間をおいて再度お試しください。");
    } finally {
      setRunning(false);
    }
  }

  if (loading || unavailable) return null;

  return (
    <div className="mb-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-ink">今日の補助金チェック</h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border p-0.5 text-xs">
            {(["all", "business", "individual"] as AudienceFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded px-2.5 py-1 transition ${filter === f ? "bg-accent text-white" : "text-gray-600 hover:bg-gray-100"}`}
              >
                {f === "all" ? "すべて" : f === "business" ? "事業者向け" : "個人向け"}
              </button>
            ))}
          </div>
          <button onClick={runAll} disabled={running} className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50" title="登録した全情報源から最新の補助金を取り込みます">
            {running ? "取り込み中…" : "最新を取り込む"}
          </button>
        </div>
      </div>

      {msg && <p className="rounded-md border border-green-200 bg-green-50 p-2 text-xs text-green-800">{msg}</p>}

      {/* 優先度の内訳カウント */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {PRIORITY.map((p, idx) => (
          <div key={p.rank} className="rounded-md border bg-white p-2 text-center">
            <div className="text-lg font-bold text-ink">{counts[idx]}</div>
            <div className="text-[10px] text-gray-500">{p.label}</div>
          </div>
        ))}
      </div>

      {/* 今日見るべき補助金（実務優先順） */}
      <div className="rounded-lg border bg-white">
        <div className="border-b px-4 py-2 text-sm font-semibold text-ink">今日見るべき補助金（優先順）</div>
        {prioritized.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-400">
            対象の候補はまだありません。「最新を取り込む」または <Link href="/setup" className="text-accent hover:underline">初期設定</Link> で事業を登録してください。
          </p>
        ) : (
          <ul className="divide-y">
            {prioritized.map(({ s, rank }) => {
              const p = PRIORITY[rank - 1];
              const dd = daysUntil(s.deadline);
              return (
                <li key={s.i.id} className="px-4 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${p.tone}`}>{p.label}</span>
                        <span className="truncate text-sm font-semibold text-ink">{s.i.title}</span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-500">
                        {s.regions.length > 0 && <span>📍{s.regions.slice(0, 2).join("・")}</span>}
                        {s.profile && <span>🏢{s.profile}</span>}
                        {s.deadline && <span className={dd != null && dd <= 7 ? "font-semibold text-red-600" : ""}>🗓{formatDate(s.deadline)}{dd != null && dd >= 0 ? `（あと${dd}日）` : ""}</span>}
                        <AudienceTag a={s.i.audience_type} />
                      </div>
                      <NextActions item={s.i} />
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {s.score > 0 && <span className="rounded bg-green-100 px-1.5 py-0.5 text-[11px] font-bold text-green-800">相性{s.score}</span>}
                      <div className="flex gap-1">
                        {(s.i.official_url || s.i.url) && (
                          <a href={s.i.official_url ?? s.i.url ?? "#"} target="_blank" rel="noopener noreferrer" className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-medium text-white hover:opacity-90">本物↗</a>
                        )}
                        <Link href="/discovery/items" className="rounded border px-2 py-0.5 text-[10px] text-gray-600 hover:bg-gray-50">詳細</Link>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 通知候補（将来メール/LINE/Slack送信予定。今は画面表示のみ） */}
      <div className="rounded-lg border bg-white p-4">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">通知候補（要チェック）</h3>
          <span className="text-[11px] text-gray-400">高相性80点以上／締切30日以内／新着／確認待ち</span>
        </div>
        {notify.length === 0 ? (
          <p className="px-1 py-2 text-xs text-gray-400">通知対象の候補はまだありません。</p>
        ) : (
          <ul className="divide-y">
            {notify.map(({ s, tags }) => (
              <li key={s.i.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{s.i.title}</span>
                <span className="flex shrink-0 flex-wrap items-center gap-1">
                  {tags.map((t) => (
                    <span key={t} className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] text-rose-700">{t}</span>
                  ))}
                  {(s.i.official_url || s.i.url) && (
                    <a href={s.i.official_url ?? s.i.url ?? "#"} target="_blank" rel="noopener noreferrer" className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-medium text-white hover:opacity-90">本物を見る↗</a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-gray-400">
        正式登録した補助金は <Link href="/grants" className="text-accent hover:underline">補助金一覧</Link> に表示されます。
        すべての候補は <Link href="/discovery/items" className="text-accent hover:underline">候補一覧</Link> で確認・整理できます（毎朝6時に自動で最新化）。
      </p>
    </div>
  );
}

function NextActions({ item }: { item: DiscoveredItem }) {
  const actions = suggestNextActions(item).slice(0, 3);
  if (actions.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      <span className="text-[10px] font-medium text-orange-700">次にやること:</span>
      {actions.map((a) => (
        <span key={a} className="rounded bg-orange-50 px-1.5 py-0.5 text-[10px] text-orange-800 ring-1 ring-orange-100">{a}</span>
      ))}
    </div>
  );
}

function AudienceTag({ a }: { a: AudienceType | null | undefined }) {
  const key = (a ?? "unknown") as AudienceType;
  return <span className={`rounded px-1 py-0.5 text-[10px] ${AUDIENCE_TYPE_COLORS[key]}`}>{AUDIENCE_TYPE_LABEL[key]}</span>;
}
