"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchDiscoveredItems } from "@/lib/supabase";
import type { DiscoveredItem } from "@/lib/types";
import { loadProjects, classifyForProject, nextTask, type SpendingProject, type ProjectTask } from "@/lib/projects";

export function TodayTasks() {
  const [projects, setProjects] = useState<SpendingProject[]>([]);
  const [items, setItems] = useState<DiscoveredItem[]>([]);

  useEffect(() => {
    setProjects(loadProjects());
    const onChange = () => setProjects(loadProjects());
    window.addEventListener("projects-changed", onChange);
    fetchDiscoveredItems().then(setItems).catch(() => setItems([]));
    return () => window.removeEventListener("projects-changed", onChange);
  }, []);

  const tasks: ProjectTask[] = useMemo(() => {
    const out: ProjectTask[] = [];
    for (const p of projects) {
      const match = classifyForProject(p, items);
      const t = nextTask(p, match);
      if (t) out.push(t);
    }
    return out.slice(0, 6);
  }, [projects, items]);

  if (projects.length === 0 || tasks.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border-2 border-accent/30 bg-accent/5 p-4">
      <h2 className="mb-2 text-base font-bold text-ink">📋 今日やること</h2>
      <ol className="space-y-2">
        {tasks.map((t, i) => (
          <li key={t.projectId} className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-white">{i + 1}</span>
            <Link href={`/projects/${t.projectId}`} className="min-w-0 flex-1 rounded-md bg-white px-3 py-2 transition hover:shadow-sm">
              <div className="text-sm font-semibold text-ink">{t.projectName}</div>
              <div className="text-sm text-accent">{t.action}</div>
              <div className="text-[11px] text-gray-500">理由：{t.reason}</div>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
