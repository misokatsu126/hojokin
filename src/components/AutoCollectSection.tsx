"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchDiscoveredItems, fetchProfiles } from "@/lib/supabase";
import type { DiscoveredItem, BusinessProfile } from "@/lib/types";
import { type AudienceType } from "@/lib/constants";
import { scoreDiscoveredAgainstProfiles, ruleExtract } from "@/lib/discovery";
import { isSampleDiscovered } from "@/lib/sampleFilter";
import { lifecycle, extractStartDate, preparation, type Lifecycle } from "@/lib/lifecycle";
import { formatDate, formatAmount } from "@/lib/utils";

type AudienceFilter = "all" | "business" | "individual";
type Row = {
  i: DiscoveredItem;
  score: number;
  profile: string;
  reason: string;
  start: string | null;
  deadline: string | null;
  regions: string[];
  lc: Lifecycle;
  amount: number | null;
  prepLight: boolean; // 準備の手間が「軽い」か
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
    load().catch(() => setUnavailable(true)).finally(() => setLoading(false));
  }, []);

  const rows: Row[] = useMemo(() => {
    return items
      .filter((i) => matchAudience(i.audience_type, filter) && i.status !== "imported" && i.status !== "rejected" && i.status !== "ignored" && !isSampleDiscovered(i))
      .map((i) => {
        const sc = scoreDiscoveredAgainstProfiles(i, profiles);
        const ex = ruleExtract(i);
        const start = extractStartDate(i.raw_text);
        const deadline = i.extracted_deadline ?? sc.deadline;
        const prep = preparation({ text: i.raw_text, professional: ex.professional_check_recommended, preNg: ex.pre_application_ng_risk });
        return {
          i,
          score: i.match_score ?? sc.bestScore,
          profile: i.match_profile ?? sc.bestProfile,
          reason: i.match_reason ?? sc.reason,
          start,
          deadline,
          regions: sc.regions,
          lc: lifecycle(start, deadline),
          amount: ex.max_amount,
          prepLight: prep.label.startsWith("軽い"),
        };
      });
  }, [items, profiles, filter]);

  const todayStart = rows.filter((r) => r.lc.key === "today_start").sort((a, b) => b.score - a.score);
  const soonStart = rows.filter((r) => r.lc.key === "soon_start").sort((a, b) => (a.lc.startDays ?? 99) - (b.lc.startDays ?? 99));
  const deadlineSoon = rows.filter((r) => r.lc.deadlineDays != null && r.lc.deadlineDays >= 0 && r.lc.deadlineDays <= 30).sort((a, b) => (a.lc.deadlineDays ?? 99) - (b.lc.deadlineDays ?? 99));
  const high = rows.filter((r) => r.score >= 80).sort((a, b) => b.score - a.score);
  // 条件次第で使えるかもしれない（合いそう度60〜79）
  const conditional = rows.filter((r) => r.score >= 60 && r.score < 80 && r.lc.key !== "ended").sort((a, b) => b.score - a.score);
  const waiting = rows.filter((r) => r.i.status === "unreviewed").sort((a, b) => b.score - a.score);
  // 金額が大きい（上限100万円以上）・手間が少なそう（準備が軽い／終了済みは除く）
  const bigAmount = rows.filter((r) => r.amount != null && r.amount >= 1_000_000 && r.lc.key !== "ended").sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
  const lowEffort = rows.filter((r) => r.prepLight && r.lc.key !== "ended").sort((a, b) => b.score - a.score);

  async function runAll() {
    setRunning(true);
    setMsg(null);
    try {
      const r = await fetch("/api/discovery/run", { method: "POST" });
      const d = await r.json();
      setMsg(d.ok ? `最新の補助金を取り込みました（新着 ${d.totals?.inserted ?? 0} 件・自社事業と照合 ${d.matched ?? 0} 件）。` : `取り込みに失敗しました（${d.error ?? "不明"}）。`);
      await load();
    } catch {
      setMsg("取り込みに失敗しました。時間をおいて再度お試しください。");
    } finally {
      setRunning(false);
    }
  }

  if (loading || unavailable) return null;

  const cards = [
    { title: "まず確認すべき", icon: "✅", tone: "green", rows: high, href: "/discovery/items?view=high" },
    { title: "条件次第で使えるかも", icon: "🟡", tone: "amber", rows: conditional, href: "/discovery/items" },
    { title: "締切が近い", icon: "⚠️", tone: "red", rows: deadlineSoon, href: "/discovery/items?view=deadline" },
    { title: "本日から受付", icon: "🟦", tone: "blue", rows: todayStart, href: "/discovery/items?view=today-start" },
    { title: "近日開始", icon: "📅", tone: "sky", rows: soonStart, href: "/discovery/items?view=soon-start" },
    { title: "金額が大きい", icon: "💰", tone: "gold", rows: bigAmount, href: "/discovery/items" },
    { title: "手間が少なそう", icon: "🟢", tone: "green", rows: lowEffort, href: "/discovery/items" },
    { title: "新しく見つかった", icon: "👀", tone: "amber", rows: waiting, href: "/discovery/items?view=unreviewed" },
  ];

  return (
    <div className="mb-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-ink">あなたが確認する価値がある制度</h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border p-0.5 text-xs">
            {(["all", "business", "individual"] as AudienceFilter[]).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`rounded px-2.5 py-1 transition ${filter === f ? "bg-accent text-white" : "text-gray-600 hover:bg-gray-100"}`}>
                {f === "all" ? "すべて" : f === "business" ? "事業者向け" : "個人向け"}
              </button>
            ))}
          </div>
          <button onClick={runAll} disabled={running} className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50">
            {running ? "取り込み中…" : "最新を取り込む"}
          </button>
        </div>
      </div>

      {msg && <p className="rounded-md border border-green-200 bg-green-50 p-2 text-xs text-green-800">{msg}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cards.map((c) => <SummaryCard key={c.title} title={c.title} icon={c.icon} tone={c.tone} rows={c.rows} href={c.href} />)}
      </div>
    </div>
  );
}

function SummaryCard({ title, icon, tone, rows, href }: { title: string; icon?: string; tone: string; rows: Row[]; href: string }) {
  const head: Record<string, string> = {
    blue: "bg-blue-50 text-blue-800 border-blue-200",
    sky: "bg-sky-50 text-sky-800 border-sky-200",
    red: "bg-red-50 text-red-800 border-red-200",
    green: "bg-green-50 text-green-800 border-green-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    gold: "bg-yellow-50 text-yellow-800 border-yellow-200",
  };
  return (
    <div className="flex flex-col rounded-lg border bg-white">
      <div className={`flex items-center justify-between rounded-t-lg border-b px-3 py-2 ${head[tone]}`}>
        <span className="text-sm font-semibold">{icon ? `${icon} ` : ""}{title}</span>
        <span className="rounded-full bg-white/70 px-2 text-sm font-bold">{rows.length}</span>
      </div>
      <div className="flex-1 divide-y">
        {rows.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-gray-400">該当なし</p>
        ) : (
          rows.slice(0, 3).map((r) => <MiniRow key={r.i.id} r={r} />)
        )}
      </div>
      <Link href={href} className="border-t px-3 py-2 text-center text-xs font-medium text-accent hover:bg-gray-50">
        {title}を見る →
      </Link>
    </div>
  );
}

function MiniRow({ r }: { r: Row }) {
  const i = r.i;
  return (
    <div className="px-3 py-2">
      <div className="flex items-start justify-between gap-1.5">
        <span className="min-w-0 flex-1 text-xs font-medium text-ink line-clamp-2">{i.title}</span>
        {r.score > 0 && <span className="shrink-0 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-800">{r.score}</span>}
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-gray-500">
        <span className={`rounded px-1 py-0.5 ${r.lc.tone}`}>{r.lc.icon} {r.lc.label}</span>
        {r.regions[0] && <span>📍{r.regions[0]}</span>}
        {r.deadline && <span>🗓{formatDate(r.deadline)}</span>}
        {r.amount != null && r.amount >= 1_000_000 && <span>💰{formatAmount(r.amount)}</span>}
      </div>
      {(i.official_url || i.url) && (
        <a href={i.official_url ?? i.url ?? "#"} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-[10px] text-emerald-700 hover:underline">公式ページを見る ↗</a>
      )}
    </div>
  );
}
