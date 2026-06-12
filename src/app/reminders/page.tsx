"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchDiscoveredItems } from "@/lib/supabase";
import type { DiscoveredItem } from "@/lib/types";
import { loadProjects, syncProjectsFromSupabase, type SpendingProject } from "@/lib/projects";
import {
  computeProjectAlerts, loadDismissed, dismissAlert, restoreAlert, ALERT_META,
  type ProjectAlert,
} from "@/lib/projectAlerts";

export default function RemindersPage() {
  const [projects, setProjects] = useState<SpendingProject[]>([]);
  const [items, setItems] = useState<DiscoveredItem[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [showDone, setShowDone] = useState(false);

  useEffect(() => {
    setProjects(loadProjects());
    setDismissed(loadDismissed());
    const onProjects = () => setProjects(loadProjects());
    const onAlerts = () => setDismissed(loadDismissed());
    window.addEventListener("projects-changed", onProjects);
    window.addEventListener("alerts-changed", onAlerts);
    syncProjectsFromSupabase().catch(() => {});
    fetchDiscoveredItems().then(setItems).catch(() => setItems([]));
    return () => {
      window.removeEventListener("projects-changed", onProjects);
      window.removeEventListener("alerts-changed", onAlerts);
    };
  }, []);

  const all = useMemo(() => computeProjectAlerts(projects, items), [projects, items]);
  const active = all.filter((a) => !dismissed.has(a.key));
  const done = all.filter((a) => dismissed.has(a.key));
  const high = active.filter((a) => a.severity === "high");
  const medium = active.filter((a) => a.severity === "medium");

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-ink">🔔 通知・リマインド</h1>
      <p className="mb-4 text-sm leading-relaxed text-gray-600">
        登録した支出案件から、<strong>発注前に確認すべきこと・締切が近いこと</strong>などをまとめています。
        対応したものは「対応済みにする」で消せます。
      </p>
      <p className="mb-4 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-800">
        メール・LINEでの通知は今後対応予定です。今はこの画面とホームで確認できます。
      </p>

      {active.length === 0 ? (
        <div className="rounded-xl border bg-white p-8 text-center">
          <p className="text-sm font-medium text-ink">いま確認が必要な通知はありません。</p>
          <p className="mt-1 text-xs text-gray-500">支出案件を登録すると、発注前の注意や締切のリマインドが出ます。</p>
          <Link href="/projects/new" className="mt-3 inline-block rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90">＋ 支出案件を追加</Link>
        </div>
      ) : (
        <div className="space-y-5">
          {high.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-bold text-red-700">至急の確認（{high.length}）</h2>
              <div className="space-y-2">{high.map((a) => <AlertCard key={a.key} a={a} onDone={() => dismissAlert(a.key)} />)}</div>
            </section>
          )}
          {medium.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-bold text-amber-700">確認しておきたいこと（{medium.length}）</h2>
              <div className="space-y-2">{medium.map((a) => <AlertCard key={a.key} a={a} onDone={() => dismissAlert(a.key)} />)}</div>
            </section>
          )}
        </div>
      )}

      {done.length > 0 && (
        <div className="mt-6">
          <button onClick={() => setShowDone((v) => !v)} className="text-xs text-gray-500 hover:underline">
            {showDone ? "対応済みを隠す" : `対応済みを見る（${done.length}）`}
          </button>
          {showDone && (
            <div className="mt-2 space-y-2">
              {done.map((a) => (
                <div key={a.key} className="flex items-center justify-between rounded-lg border bg-gray-50 p-3 text-sm text-gray-500">
                  <span>{ALERT_META[a.kind].icon} {a.projectName}：{a.title}</span>
                  <button onClick={() => restoreAlert(a.key)} className="text-xs text-accent hover:underline">戻す</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AlertCard({ a, onDone }: { a: ProjectAlert; onDone: () => void }) {
  const tone = a.severity === "high" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50";
  const href = a.taskKey ? `/projects/${a.projectId}?task=${a.taskKey}` : `/projects/${a.projectId}`;
  return (
    <div className={`rounded-lg border p-3 ${tone}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] text-gray-600">{ALERT_META[a.kind].icon} {ALERT_META[a.kind].label}</span>
            <span className="truncate text-xs text-gray-500">{a.projectName}</span>
          </div>
          <p className="mt-1 text-sm font-semibold text-ink">{a.title}</p>
          <p className="mt-0.5 text-xs text-gray-600">{a.detail}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <Link href={href} className="rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:opacity-90">この案件を確認する →</Link>
        <button onClick={onDone} className="rounded-md border px-3 py-1.5 text-gray-600 hover:bg-white">対応済みにする</button>
      </div>
    </div>
  );
}
