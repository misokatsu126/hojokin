"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchDiscoveredItems, fetchProfiles } from "@/lib/supabase";
import type { DiscoveredItem, BusinessProfile } from "@/lib/types";
import { scoreDiscoveredAgainstProfiles } from "@/lib/discovery";
import { isSampleDiscovered } from "@/lib/sampleFilter";
import { lifecycle, extractStartDate, feasibility, type Lifecycle } from "@/lib/lifecycle";
import { daysUntil, formatDate } from "@/lib/utils";

type Row = {
  i: DiscoveredItem;
  score: number;
  profile: string;
  regions: string[];
  start: string | null;
  deadline: string | null;
  lc: Lifecycle;
  source: string;
};

function sourceLabel(s: string | null): string {
  if (s === "jnet21") return "J-Net21";
  if (s === "mirasapo") return "ミラサポplus";
  if (s === "jgrants") return "Jグランツ";
  if (s === "crawl" || s === "official_url_import") return "自治体公式";
  return s ?? "自動収集";
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function CalendarPage() {
  const [items, setItems] = useState<DiscoveredItem[]>([]);
  const [profiles, setProfiles] = useState<BusinessProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"month" | "list">("month");
  const [monthOffset, setMonthOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchDiscoveredItems(), fetchProfiles()])
      .then(([it, p]) => { setItems(it); setProfiles(p); })
      .catch((e) => setError(e.message ?? "読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  const rows: Row[] = useMemo(() => {
    return items
      .filter((i) => i.status !== "imported" && i.status !== "rejected" && i.status !== "ignored" && !isSampleDiscovered(i))
      .map((i) => {
        const sc = scoreDiscoveredAgainstProfiles(i, profiles);
        const start = extractStartDate(i.raw_text);
        const deadline = i.extracted_deadline ?? sc.deadline;
        return { i, score: i.match_score ?? sc.bestScore, profile: i.match_profile ?? sc.bestProfile, regions: sc.regions, start, deadline, lc: lifecycle(start, deadline), source: sourceLabel(i.external_source ?? null) };
      });
  }, [items, profiles]);

  // 日付 → その日のイベント（開始/締切）
  const byDate = useMemo(() => {
    const m = new Map<string, { r: Row; type: "start" | "deadline" }[]>();
    for (const r of rows) {
      if (r.start) { const k = r.start.slice(0, 10); if (!m.has(k)) m.set(k, []); m.get(k)!.push({ r, type: "start" }); }
      if (r.deadline) { const k = r.deadline.slice(0, 10); if (!m.has(k)) m.set(k, []); m.get(k)!.push({ r, type: "deadline" }); }
    }
    return m;
  }, [rows]);

  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + monthOffset);
  const year = base.getFullYear();
  const month = base.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = ymd(new Date());

  const cells: ({ day: number; key: string } | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, key: ymd(new Date(year, month, d)) });

  const selectedEvents = selected ? byDate.get(selected) ?? [] : [];

  if (loading) return <p className="py-12 text-center text-gray-400">読み込み中…</p>;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-ink">補助金カレンダー</h1>
        <div className="flex rounded-md border p-0.5 text-xs">
          <button onClick={() => setMode("month")} className={`rounded px-2.5 py-1 ${mode === "month" ? "bg-accent text-white" : "text-gray-600 hover:bg-gray-100"}`}>カレンダー</button>
          <button onClick={() => setMode("list")} className={`rounded px-2.5 py-1 ${mode === "list" ? "bg-accent text-white" : "text-gray-600 hover:bg-gray-100"}`}>リスト</button>
        </div>
      </div>
      <p className="mb-4 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-800">
        受付開始（<span className="rounded bg-blue-100 px-1 text-blue-800">青</span>）と締切（<span className="rounded bg-red-100 px-1 text-red-700">赤</span>）を日付で表示します。日付をタップすると、その日の補助金が下に出ます。
      </p>
      {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {mode === "month" ? (
        <>
          <div className="mb-2 flex items-center justify-between">
            <button onClick={() => { setMonthOffset((v) => v - 1); setSelected(null); }} className="rounded-md border px-3 py-1 text-sm text-gray-600 hover:bg-gray-50">← 前の月</button>
            <span className="text-sm font-semibold text-ink">{year}年{month + 1}月</span>
            <button onClick={() => { setMonthOffset((v) => v + 1); setSelected(null); }} className="rounded-md border px-3 py-1 text-sm text-gray-600 hover:bg-gray-50">次の月 →</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-gray-400">
            {["日", "月", "火", "水", "木", "金", "土"].map((w) => <div key={w} className="py-1">{w}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((c, idx) => {
              if (!c) return <div key={idx} className="min-h-[52px] rounded-md bg-transparent" />;
              const evs = byDate.get(c.key) ?? [];
              const starts = evs.filter((e) => e.type === "start").length;
              const deadlines = evs.filter((e) => e.type === "deadline").length;
              const isToday = c.key === todayKey;
              const isSel = c.key === selected;
              return (
                <button
                  key={idx}
                  onClick={() => setSelected(isSel ? null : c.key)}
                  className={`min-h-[52px] rounded-md border p-1 text-left transition hover:border-accent ${isSel ? "border-accent ring-1 ring-accent" : ""} ${isToday ? "bg-amber-50" : "bg-white"}`}
                >
                  <div className={`text-[11px] ${isToday ? "font-bold text-amber-700" : "text-gray-500"}`}>{c.day}</div>
                  <div className="mt-0.5 flex flex-wrap gap-0.5">
                    {starts > 0 && <span className="rounded bg-blue-100 px-1 text-[9px] text-blue-800">開始{starts}</span>}
                    {deadlines > 0 && <span className="rounded bg-red-100 px-1 text-[9px] text-red-700">締切{deadlines}</span>}
                  </div>
                </button>
              );
            })}
          </div>

          {selected && (
            <div className="mt-4">
              <h2 className="mb-2 text-sm font-semibold text-ink">{selected} の補助金（{selectedEvents.length}件）</h2>
              {selectedEvents.length === 0 ? (
                <p className="rounded-md border border-dashed bg-white px-3 py-3 text-xs text-gray-400">この日の予定はありません。</p>
              ) : (
                <div className="space-y-2">
                  {selectedEvents.map((e, i) => <CalRow key={`${e.r.i.id}-${i}`} r={e.r} badge={e.type === "start" ? "開始日" : "締切日"} />)}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <ListView rows={rows} />
      )}
    </div>
  );
}

function ListView({ rows }: { rows: Row[] }) {
  const sd = (r: Row) => r.lc.startDays;
  const dd = (r: Row) => r.lc.deadlineDays;
  const groups = [
    { title: "今日開始", tone: "border-blue-300", rows: rows.filter((r) => sd(r) === 0) },
    { title: "今週開始（7日以内）", tone: "border-sky-300", rows: rows.filter((r) => sd(r) != null && sd(r)! >= 1 && sd(r)! <= 7) },
    { title: "今月開始（30日以内）", tone: "border-sky-200", rows: rows.filter((r) => sd(r) != null && sd(r)! >= 8 && sd(r)! <= 30) },
    { title: "今週締切（7日以内）", tone: "border-red-300", rows: rows.filter((r) => dd(r) != null && dd(r)! >= 0 && dd(r)! <= 7) },
    { title: "今月締切（30日以内）", tone: "border-orange-300", rows: rows.filter((r) => dd(r) != null && dd(r)! >= 8 && dd(r)! <= 30) },
    { title: "最近見つかった補助金", tone: "border-violet-300", rows: rows.filter((r) => daysUntil(r.i.detected_at) != null && daysUntil(r.i.detected_at)! >= -7 && daysUntil(r.i.detected_at)! <= 0) },
  ];
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.title}>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
            {g.title}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{g.rows.length}</span>
          </h2>
          {g.rows.length === 0 ? (
            <p className="rounded-md border border-dashed bg-white px-3 py-3 text-xs text-gray-400">該当なし</p>
          ) : (
            <div className={`space-y-2 border-l-4 ${g.tone} pl-3`}>
              {g.rows.sort((a, b) => b.score - a.score).slice(0, 12).map((r) => <CalRow key={r.i.id} r={r} />)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function CalRow({ r, badge }: { r: Row; badge?: string }) {
  const i = r.i;
  const feas = feasibility(r.deadline);
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {badge && <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${badge === "開始日" ? "bg-blue-100 text-blue-800" : "bg-red-100 text-red-700"}`}>{badge}</span>}
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${r.lc.tone}`}>{r.lc.label}</span>
            <span className="text-sm font-semibold text-ink">{i.title}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
            <span>📍{r.regions.slice(0, 2).join("・") || "—"}</span>
            <span>出典：{r.source}</span>
            {r.start && <span>開始：{formatDate(r.start)}</span>}
            {r.deadline && <span>締切：{formatDate(r.deadline)}</span>}
            {r.profile && <span>🏢{r.profile}</span>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {r.score > 0 && <span className="rounded bg-green-100 px-1.5 py-0.5 text-[11px] font-bold text-green-800">相性{r.score}</span>}
          <span className={`rounded px-1.5 py-0.5 text-[10px] ${feas.tone}`}>{feas.label}</span>
        </div>
      </div>
      <div className="mt-1.5 flex gap-2">
        {(i.official_url || i.url) && (
          <a href={i.official_url ?? i.url ?? "#"} target="_blank" rel="noopener noreferrer" className="rounded bg-emerald-600 px-2 py-0.5 text-[11px] font-medium text-white hover:opacity-90">公式ページを見る ↗</a>
        )}
        <Link href="/discovery/items" className="rounded border px-2 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50">詳細を見る</Link>
      </div>
    </div>
  );
}
