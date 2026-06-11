"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchDiscoveredItems } from "@/lib/supabase";
import type { DiscoveredItem } from "@/lib/types";
import { loadProjects, classifyForProject, projectTasks, type SpendingProject, type ProjectTask } from "@/lib/projects";

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

  // 案件ごとに「やること」を最大3つまで。タスクがある案件だけ表示。
  const groups = useMemo(() => {
    return projects
      .map((p) => ({ project: p, tasks: projectTasks(p, classifyForProject(p, items)).slice(0, 3) }))
      .filter((g) => g.tasks.length > 0)
      .slice(0, 5);
  }, [projects, items]);

  if (projects.length === 0 || groups.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border-2 border-accent/30 bg-accent/5 p-4">
      <h2 className="mb-2 text-base font-bold text-ink">📋 今日やること</h2>
      <ol className="space-y-3">
        {groups.map(({ project, tasks }, i) => (
          <li key={project.id} className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-white">{i + 1}</span>
            <Link href={`/projects/${project.id}`} className="min-w-0 flex-1 rounded-md bg-white px-3 py-2 transition hover:shadow-sm">
              <div className="text-sm font-semibold text-ink">{project.name || "支出案件"}</div>
              <ul className="mt-0.5 space-y-0.5">
                {tasks.map((t, j) => (
                  <li key={j} className="text-xs">
                    <span className="font-medium text-accent">{j === 0 ? "▶ " : "・"}{t.action}</span>
                    <span className="ml-1 text-[11px] text-gray-500">（{t.reason}）</span>
                  </li>
                ))}
              </ul>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
