"use client";

import Link from "next/link";
import { ProjectsHome } from "@/components/ProjectsHome";
import { TodayTasks } from "@/components/TodayTasks";

export default function HomePage() {
  return (
    <div>
      {/* 最上部：今日やること（案件横断） */}
      <TodayTasks />

      {/* 主役：支出案件 */}
      <ProjectsHome />

      {/* 補助の導線（補助金一覧は主役にしない） */}
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <Link href="/search" className="rounded-lg border bg-white p-4 transition hover:border-accent">
          <div className="text-sm font-semibold text-ink">💬 相談して探す</div>
          <div className="mt-0.5 text-xs text-gray-500">やりたいことを入力。その場で支出案件も作れます。</div>
        </Link>
        <Link href="/calendar" className="rounded-lg border bg-white p-4 transition hover:border-accent">
          <div className="text-sm font-semibold text-ink">🗓 締切カレンダー</div>
          <div className="mt-0.5 text-xs text-gray-500">締切と「その前にやること」を確認。</div>
        </Link>
        <Link href="/new-and-standard" className="rounded-lg border bg-white p-4 transition hover:border-accent">
          <div className="text-sm font-semibold text-ink">🆕 新着・定番</div>
          <div className="mt-0.5 text-xs text-gray-500">新しく見つかった制度と定番制度。</div>
        </Link>
      </div>

      <p className="mt-4 text-center text-xs text-gray-400">
        補助金そのものの一覧・自動収集は{" "}
        <Link href="/discovery" className="text-accent hover:underline">管理者画面</Link>{" "}にあります。
      </p>
    </div>
  );
}
